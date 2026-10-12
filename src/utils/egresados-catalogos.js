// ─────────────────────────────────────────────────────────────────────────────
// Catálogos del módulo de egresados y seguimiento (migración 1772360000000).
//
// En la BD se guardan CÓDIGOS (validados con CHECK); las ETIQUETAS son lo que
// ve el usuario y lo que se escribe en los Excel. Los valores salen de los
// archivos reales de CADERH (Anexo I, Empleo PRICE, SEGUIMIENTO DE EMPLEO) y
// de los motivos de retiro que usaba el SGC.
//
// Espejo en el frontend: caderh-frontend/lib/egresados-catalogos.ts
// ─────────────────────────────────────────────────────────────────────────────

import { plano } from "./texto.js";

export { plano };

export const RESULTADOS = {
    EGRESADO: "Egresó",
    DESERTOR: "Desertó",
};

export const MOTIVOS_DESERCION = {
    DESINTERES: "Falta de interés o decisión personal",
    ECONOMICO: "Falta de dinero",
    MIGRACION: "Migró o viajó",
    DOMICILIO: "Cambio de domicilio",
    OTRO: "Otro",
};

export const RESULTADOS_PASANTIA = {
    EN_CURSO: "En curso",
    COMPLETADA: "Completada",
    DESERTO: "Desertó",
};

export const ESTATUS_SEGUIMIENTO = {
    TRABAJO_PERMANENTE: "Trabajo permanente",
    TRABAJO_TEMPORAL: "Trabajo temporal",
    EMPRENDIENDO: "Emprendiendo",
    ESTUDIANDO: "Estudiando",
    BUSQUEDA_EMPLEO: "Búsqueda de empleo",
    EN_PASANTIA: "En pasantía",
    OTRO: "Otro",
    NO_APLICA: "No aplica",
};

// Agrupación de los cuadros de resumen (como en el Anexo, "Trabajando" =
// permanente + temporal). OTRO y NO_APLICA se reportan juntos.
export const GRUPO_ESTATUS = {
    TRABAJO_PERMANENTE: "TRABAJANDO",
    TRABAJO_TEMPORAL: "TRABAJANDO",
    EMPRENDIENDO: "EMPRENDIENDO",
    ESTUDIANDO: "ESTUDIANDO",
    BUSQUEDA_EMPLEO: "BUSQUEDA_EMPLEO",
    EN_PASANTIA: "EN_PASANTIA",
    OTRO: "OTRO",
    NO_APLICA: "OTRO",
};

export const GRUPOS_ESTATUS = {
    TRABAJANDO: "Trabajando",
    EMPRENDIENDO: "Emprendiendo",
    ESTUDIANDO: "Estudiando",
    BUSQUEDA_EMPLEO: "Búsqueda de empleo",
    EN_PASANTIA: "En pasantía",
    OTRO: "Otro / no aplica",
    SIN_SEGUIMIENTO: "Sin seguimiento",
};

// Rangos de salario e ingreso mensual (Word: "tabla de rangos"; valores del
// Anexo I, columna "¿Cuál es el ingreso promedio mensual en su hogar?").
export const RANGOS_INGRESO = [
    "Menos de L 3,000",
    "L 3,000 a L 5,000",
    "L 5,000 a L 8,000",
    "L 8,000 a L 12,000",
    "L 12,000 a L 15,000",
    "L 15,000 a L 20,000",
    "Más de L 20,000",
];
const RANGO_LIMITES = [
    [0, 3000], [3000, 5000], [5000, 8000], [8000, 12000], [12000, 15000], [15000, 20000], [20000, Infinity],
];

function buildIndex(map, aliases = {}) {
    const index = new Map();
    for (const [code, label] of Object.entries(map)) {
        index.set(plano(code), code);
        index.set(plano(label), code);
    }
    for (const [alias, code] of Object.entries(aliases)) index.set(plano(alias), code);
    return index;
}

const RESULTADO_INDEX = buildIndex(RESULTADOS, {
    egreso: "EGRESADO", egresado: "EGRESADO", egresada: "EGRESADO", graduado: "EGRESADO",
    graduada: "EGRESADO", completo: "EGRESADO", finalizo: "EGRESADO", termino: "EGRESADO",
    deserto: "DESERTOR", desertor: "DESERTOR", desertora: "DESERTOR", retirado: "DESERTOR",
    retirada: "DESERTOR", abandono: "DESERTOR", desercion: "DESERTOR",
});
const MOTIVO_INDEX = buildIndex(MOTIVOS_DESERCION, {
    "falta de interes": "DESINTERES", desinteres: "DESINTERES", "decision personal": "DESINTERES",
    "no le gusto": "DESINTERES",
    economico: "ECONOMICO", "falta de recursos": "ECONOMICO", "falta de recursos economicos": "ECONOMICO",
    "problemas economicos": "ECONOMICO",
    migracion: "MIGRACION", migro: "MIGRACION", emigro: "MIGRACION", viajo: "MIGRACION", viaje: "MIGRACION",
    "cambio de residencia": "DOMICILIO", traslado: "DOMICILIO", "se traslado": "DOMICILIO",
});
const RESULTADO_PASANTIA_INDEX = buildIndex(RESULTADOS_PASANTIA, {
    "en proceso": "EN_CURSO", cursando: "EN_CURSO",
    completo: "COMPLETADA", completado: "COMPLETADA", finalizada: "COMPLETADA", finalizo: "COMPLETADA",
    terminada: "COMPLETADA", termino: "COMPLETADA",
    deserto: "DESERTO", abandono: "DESERTO", retirado: "DESERTO", desercion: "DESERTO",
});
const ESTATUS_INDEX = buildIndex(ESTATUS_SEGUIMIENTO, {
    permanente: "TRABAJO_PERMANENTE", "trabajando permanente": "TRABAJO_PERMANENTE",
    "empleo permanente": "TRABAJO_PERMANENTE",
    temporal: "TRABAJO_TEMPORAL", "trabajando temporal": "TRABAJO_TEMPORAL", "empleo temporal": "TRABAJO_TEMPORAL",
    "por eventos": "TRABAJO_TEMPORAL",
    emprendimiento: "EMPRENDIENDO", autoempleo: "EMPRENDIENDO", emprende: "EMPRENDIENDO",
    "retorno estudiando": "ESTUDIANDO", "retorno al estudio": "ESTUDIANDO", estudia: "ESTUDIANDO",
    "busqueda de empleo": "BUSQUEDA_EMPLEO", "buscando empleo": "BUSQUEDA_EMPLEO",
    "en busca de empleo": "BUSQUEDA_EMPLEO", "busca empleo": "BUSQUEDA_EMPLEO",
    pasantia: "EN_PASANTIA", "en pasantia": "EN_PASANTIA",
    "incapacidad medica": "OTRO",
    "n a": "NO_APLICA", na: "NO_APLICA", "no aplica": "NO_APLICA", "sin contacto": "NO_APLICA",
});

function fromIndex(index, value) {
    const key = plano(value);
    if (!key) return { value: null };
    const code = index.get(key);
    return code ? { value: code } : { error: true };
}

const listado = (map) => Object.values(map).join(", ");

export function normalizeResultado(value) {
    const key = plano(value);
    // "Pendiente" en la lista de cierre = quitar el resultado registrado.
    if (key === "pendiente" || key === "sin cierre") return { value: "PENDIENTE" };
    const r = fromIndex(RESULTADO_INDEX, value);
    if (r.error) return { error: `Resultado inválido: "${String(value).trim()}". Use ${listado(RESULTADOS)} o Pendiente` };
    return r;
}

export function normalizeMotivo(value) {
    const r = fromIndex(MOTIVO_INDEX, value);
    if (r.error) return { error: `Motivo de deserción inválido: "${String(value).trim()}". Use: ${listado(MOTIVOS_DESERCION)}` };
    return r;
}

export function normalizeResultadoPasantia(value) {
    const r = fromIndex(RESULTADO_PASANTIA_INDEX, value);
    if (r.error) return { error: `Resultado de pasantía inválido: "${String(value).trim()}". Use: ${listado(RESULTADOS_PASANTIA)}` };
    return r;
}

export function normalizeEstatus(value) {
    const key = plano(value);
    if (key === "trabajando" || key === "trabaja") {
        return { error: `Estatus "${String(value).trim()}" incompleto: indique Trabajo permanente o Trabajo temporal` };
    }
    const r = fromIndex(ESTATUS_INDEX, value);
    if (r.error) return { error: `Estatus inválido: "${String(value).trim()}". Use: ${listado(ESTATUS_SEGUIMIENTO)}` };
    return r;
}

// Acepta la etiqueta exacta o textos como "Entre L.5,000 a L.8,000" / "Más de 20000".
export function normalizeRango(value, campo = "Rango") {
    const raw = String(value ?? "").trim();
    if (!raw) return { value: null };
    const key = plano(raw);
    const exact = RANGOS_INGRESO.find((r) => plano(r) === key);
    if (exact) return { value: exact };
    const numeros = (raw.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (numeros.length >= 2) {
        const [a, b] = numeros;
        const idx = RANGO_LIMITES.findIndex(([min, max]) => min === a && max === b);
        if (idx >= 0) return { value: RANGOS_INGRESO[idx] };
    } else if (numeros.length === 1) {
        if (/mas|mayor|arriba/.test(key) && numeros[0] === 20000) return { value: RANGOS_INGRESO[6] };
        if (/menos|menor|debajo/.test(key) && numeros[0] === 3000) return { value: RANGOS_INGRESO[0] };
    }
    return { error: `${campo} inválido: "${raw}". Use uno de: ${RANGOS_INGRESO.join(" · ")}` };
}

// Monto en Lempiras ("2,500", "L 2500.50", 2500) → centavos BIGINT. Vacío → null.
export function normalizeMontoCents(value, campo = "Monto") {
    if (value === null || value === undefined || String(value).trim() === "") return { value: null };
    const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(n) || n < 0) return { error: `${campo} inválido: "${String(value).trim()}". Escriba solo el número (ej. 2500)` };
    return { value: Math.round(n * 100) };
}

export function normalizeSiNo(value) {
    const key = plano(value);
    if (!key) return { value: null };
    if (["si", "s", "1", "true", "x", "yes"].includes(key)) return { value: true };
    if (["no", "n", "0", "false"].includes(key)) return { value: false };
    return { error: `Valor inválido: "${String(value).trim()}". Use Sí o No` };
}

export function textoOpcional(value, max = 300) {
    const s = String(value ?? "").trim();
    return s ? s.slice(0, max) : null;
}
