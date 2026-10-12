-- Up Migration

-- ─────────────────────────────────────────────────────────────────────────────
-- Consolida los estudiantes duplicados por identidad: una persona = una fila.
--
-- Origen: la importación Excel da de baja a quien no viene en el archivo (es
-- el diseño), pero cuando esa persona volvía en una importación posterior se
-- creaba una fila NUEVA en vez de reactivar la suya: solo se buscaba entre
-- activos y se descartaba el ID del Excel. En prd (12/10/2026) había 606
-- filas para 141 personas. El código ya reactiva; esta migración limpia lo
-- existente.
--
-- Regla por identidad: se conserva el registro activo (en los datos reales
-- siempre es también el más actualizado); si todos están de baja, el de
-- updated_at más reciente. Desempate final: el id mayor.
--
-- Dependencias: toda tabla con FK a centros.estudiantes (se descubren en el
-- catálogo; hoy son 9 y todas ON DELETE CASCADE) se re-apunta al registro
-- conservado ANTES de borrar los duplicados, así el CASCADE no arrastra nada.
-- Si una persona quedara matriculada dos veces en el mismo proceso (UNIQUE
-- proceso_id + estudiante_id) la migración se aborta completa sin cambiar
-- nada, para revisarlo a mano.
--
-- Respaldo y reversa: las filas eliminadas quedan en
-- centros.estudiantes_dedup_respaldo y cada dependencia movida en
-- centros.estudiantes_dedup_dependencias; la Down Migration las usa para
-- dejar todo como estaba. Se pueden borrar cuando ya no hagan falta.
--
-- Al final la identidad pasa a ser única para TODAS las filas (antes solo
-- entre activas), para que los duplicados no vuelvan por ningún camino.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Mapa duplicado → conservado.
CREATE TEMP TABLE dedup_mapa ON COMMIT DROP AS
WITH ranked AS (
    SELECT id, identidad,
           row_number() OVER (
               PARTITION BY identidad
               ORDER BY (estatus = 1) DESC, updated_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM centros.estudiantes
)
SELECT d.id AS duplicado_id, k.id AS conservado_id
FROM ranked d
JOIN ranked k ON k.identidad = d.identidad AND k.rn = 1
WHERE d.rn > 1;

-- 2. Validaciones previas: nada se toca si alguna falla.
DO $$
DECLARE
    fk_compuestas int;
    conflictos int;
BEGIN
    -- Solo se saben re-apuntar FKs de una columna; una compuesta quedaría
    -- sin mover y el CASCADE la borraría.
    SELECT count(*) INTO fk_compuestas
    FROM pg_constraint
    WHERE contype = 'f'
      AND confrelid = 'centros.estudiantes'::regclass
      AND cardinality(conkey) <> 1;
    IF fk_compuestas > 0 THEN
        RAISE EXCEPTION 'Consolidación abortada: hay % FK compuesta(s) hacia centros.estudiantes que esta migración no sabe re-apuntar.', fk_compuestas;
    END IF;

    SELECT count(*) INTO conflictos
    FROM (
        SELECT coalesce(m.conservado_id, pm.estudiante_id) AS estudiante_id, pm.proceso_id
        FROM centros.proceso_matriculas pm
        LEFT JOIN pg_temp.dedup_mapa m ON m.duplicado_id = pm.estudiante_id
        GROUP BY 1, 2
        HAVING count(*) > 1
    ) t;
    IF conflictos > 0 THEN
        RAISE EXCEPTION 'Consolidación abortada: en % caso(s) la misma persona quedaría matriculada dos veces en un proceso. Revisar a mano antes de migrar.', conflictos;
    END IF;
END $$;

-- 3. Respaldo de las filas que se eliminan y bitácora de dependencias movidas.
CREATE TABLE centros.estudiantes_dedup_respaldo AS
SELECT e.*, m.conservado_id AS dedup_conservado_id, now() AS dedup_consolidado_en
FROM centros.estudiantes e
JOIN pg_temp.dedup_mapa m ON m.duplicado_id = e.id;

CREATE TABLE centros.estudiantes_dedup_dependencias (
    tabla                  text    NOT NULL,
    columna                text    NOT NULL,
    fila_id                bigint  NOT NULL,
    estudiante_id_anterior integer NOT NULL,
    estudiante_id_nuevo    integer NOT NULL
);

-- 4. Re-apuntar cada dependencia al registro conservado.
DO $$
DECLARE
    fk record;
BEGIN
    FOR fk IN
        SELECT c.conrelid::regclass AS tabla, a.attname AS columna
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f'
          AND c.confrelid = 'centros.estudiantes'::regclass
    LOOP
        EXECUTE format(
            'INSERT INTO centros.estudiantes_dedup_dependencias
                 (tabla, columna, fila_id, estudiante_id_anterior, estudiante_id_nuevo)
             SELECT %L, %L, t.id, t.%I, m.conservado_id
             FROM %s t JOIN pg_temp.dedup_mapa m ON m.duplicado_id = t.%I',
            fk.tabla::text, fk.columna, fk.columna, fk.tabla, fk.columna);
        EXECUTE format(
            'UPDATE %s t SET %I = m.conservado_id
             FROM pg_temp.dedup_mapa m WHERE t.%I = m.duplicado_id',
            fk.tabla, fk.columna, fk.columna);
    END LOOP;
END $$;

-- 5. Eliminar los duplicados (ya sin dependencias).
DELETE FROM centros.estudiantes e
USING pg_temp.dedup_mapa m
WHERE e.id = m.duplicado_id;

-- 6. Comprobación final e identidad única para todas las filas.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM centros.estudiantes GROUP BY identidad HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Consolidación abortada: aún quedan identidades repetidas.';
    END IF;
END $$;

DROP INDEX IF EXISTS centros.estudiantes_identidad_unique;
CREATE UNIQUE INDEX estudiantes_identidad_unique ON centros.estudiantes (identidad);

-- Down Migration

-- Vuelve al índice único solo entre activas (permite reinsertar las bajas).
DROP INDEX IF EXISTS centros.estudiantes_identidad_unique;
CREATE UNIQUE INDEX estudiantes_identidad_unique ON centros.estudiantes (identidad) WHERE estatus = 1;

-- Reinsertar las filas eliminadas con su id original.
DO $$
DECLARE
    cols text;
BEGIN
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'centros' AND table_name = 'estudiantes';
    EXECUTE format(
        'INSERT INTO centros.estudiantes (%s) SELECT %s FROM centros.estudiantes_dedup_respaldo',
        cols, cols);
END $$;

-- Devolver cada dependencia a su estudiante original.
DO $$
DECLARE
    d record;
BEGIN
    FOR d IN SELECT DISTINCT tabla, columna FROM centros.estudiantes_dedup_dependencias LOOP
        EXECUTE format(
            'UPDATE %s t SET %I = x.estudiante_id_anterior
             FROM centros.estudiantes_dedup_dependencias x
             WHERE x.tabla = %L AND x.columna = %L AND t.id = x.fila_id',
            d.tabla, d.columna, d.tabla, d.columna);
    END LOOP;
END $$;

DROP TABLE centros.estudiantes_dedup_dependencias;
DROP TABLE centros.estudiantes_dedup_respaldo;
