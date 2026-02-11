-- ============================================================
-- Migración: Tablas SGC (Sistema de Gestión de Centros)
-- Fuente: caderh5_sgc.sql (MySQL/MariaDB) -> PostgreSQL
-- Schema: centros
-- ============================================================

create schema if not exists centros;

-- Drop tables in reverse dependency order
drop table if exists centros.excusa_asistencias;
drop table if exists centros.proceso_incidencias;
drop table if exists centros.proceso_matriculas;
drop table if exists centros.proceso_evaluacions;
drop table if exists centros.procesos;
drop table if exists centros.egresados;
drop table if exists centros.estudiante_jornadas;
drop table if exists centros.estudiante_areas;
drop table if exists centros.estudiante_huellas;
drop table if exists centros.estudiante_fotos;
drop table if exists centros.instructor_experiencias;
drop table if exists centros.instructor_estudios;
drop table if exists centros.instructor_areas;
drop table if exists centros.curso_modulos;
drop table if exists centros.curso_areas;
drop table if exists centros.estudiantes;
drop table if exists centros.instructors;
drop table if exists centros.cursos;
drop table if exists centros.centros;
drop table if exists centros.municipios;
drop table if exists centros.experiencias;
drop table if exists centros.tipo_certificados;
drop table if exists centros.tipo_jornadas;
drop table if exists centros.metodologias;
drop table if exists centros.etnias;
drop table if exists centros.discapacidads;
drop table if exists centros.nivel_escolaridads;
drop table if exists centros.areas;
drop table if exists centros.departamentos;

-- ============================================================
-- 1. Catálogos sin dependencias
-- ============================================================

create table if not exists centros.departamentos (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL
);

create table if not exists centros.areas (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL
);

create table if not exists centros.nivel_escolaridads (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL
);

-- Registro dummy para compatibilidad con instructors.nivel_escolaridad_id DEFAULT 0
INSERT INTO centros.nivel_escolaridads (id, nombre, estatus, created_at, updated_at)
VALUES (0, 'Sin especificar', 1, now(), now())
ON CONFLICT (id) DO NOTHING;

create table if not exists centros.discapacidads (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL
);

create table if not exists centros.etnias (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL
);

create table if not exists centros.metodologias (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL
);

create table if not exists centros.tipo_jornadas (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL
);

create table if not exists centros.tipo_certificados (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL
);

create table if not exists centros.experiencias (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL
);

-- ============================================================
-- 2. Con dependencia a catálogos
-- ============================================================

create table if not exists centros.municipios (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    departamento_id INTEGER NOT NULL,
    geocodigo TEXT DEFAULT NULL,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint municipios_departamento_id_foreign FOREIGN KEY (departamento_id) REFERENCES centros.departamentos(id) ON DELETE CASCADE
);

-- ============================================================
-- 3. Entidades principales
-- ============================================================

create table if not exists centros.centros (
    id SERIAL PRIMARY KEY,
    siglas TEXT NOT NULL,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT NULL,
    departamento_id INTEGER NOT NULL,
    municipio_id INTEGER NOT NULL,
    logo TEXT DEFAULT NULL,
    foto TEXT DEFAULT NULL,
    direccion TEXT DEFAULT NULL,
    telefono TEXT DEFAULT NULL,
    email TEXT DEFAULT NULL,
    pagina_web TEXT DEFAULT NULL,
    facebook TEXT DEFAULT NULL,
    twitter TEXT DEFAULT NULL,
    nombre_director TEXT DEFAULT NULL,
    telefono_director TEXT DEFAULT NULL,
    email_director TEXT DEFAULT NULL,
    foto_director TEXT DEFAULT NULL,
    nombre_contacto TEXT DEFAULT NULL,
    telefono_contacto TEXT DEFAULT NULL,
    email_contacto TEXT DEFAULT NULL,
    puesto_contacto TEXT DEFAULT NULL,
    pie_reportes TEXT DEFAULT NULL,
    estatus SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint centros_departamento_id_foreign FOREIGN KEY (departamento_id) REFERENCES centros.departamentos(id) ON DELETE CASCADE,
    constraint centros_municipio_id_foreign FOREIGN KEY (municipio_id) REFERENCES centros.municipios(id) ON DELETE CASCADE
);

create table if not exists centros.cursos (
    id SERIAL PRIMARY KEY,
    codigo INTEGER NOT NULL,
    centro_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    codigo_programa TEXT NOT NULL,
    total_horas TEXT NOT NULL,
    taller INTEGER NOT NULL DEFAULT 1,
    departamento_id INTEGER DEFAULT NULL,
    municipio_id INTEGER DEFAULT NULL,
    comunidad TEXT DEFAULT NULL,
    objetivo TEXT NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint cursos_centro_id_foreign FOREIGN KEY (centro_id) REFERENCES centros.centros(id) ON DELETE CASCADE,
    constraint cursos_departamento_id_foreign FOREIGN KEY (departamento_id) REFERENCES centros.departamentos(id),
    constraint cursos_municipio_id_foreign FOREIGN KEY (municipio_id) REFERENCES centros.municipios(id)
);

create table if not exists centros.instructors (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL DEFAULT 0,
    centro_id INTEGER NOT NULL,
    identidad TEXT NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    departamento_id INTEGER NOT NULL,
    municipio_id INTEGER NOT NULL,
    imagen TEXT DEFAULT NULL,
    pdf TEXT DEFAULT NULL,
    direccion TEXT DEFAULT NULL,
    fecha_nacimiento TEXT DEFAULT NULL,
    email TEXT DEFAULT NULL,
    telefono TEXT DEFAULT NULL,
    celular TEXT DEFAULT NULL,
    estado_civil TEXT NOT NULL,
    sexo TEXT NOT NULL,
    nivel_escolaridad_id INTEGER NOT NULL DEFAULT 0,
    titulo_obtenido TEXT DEFAULT NULL,
    otros_titulos TEXT DEFAULT NULL,
    estatus SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint instructors_centro_id_foreign FOREIGN KEY (centro_id) REFERENCES centros.centros(id) ON DELETE CASCADE,
    constraint instructors_departamento_id_foreign FOREIGN KEY (departamento_id) REFERENCES centros.departamentos(id) ON DELETE CASCADE,
    constraint instructors_municipio_id_foreign FOREIGN KEY (municipio_id) REFERENCES centros.municipios(id) ON DELETE CASCADE,
    constraint instructors_nivel_escolaridad_id_foreign FOREIGN KEY (nivel_escolaridad_id) REFERENCES centros.nivel_escolaridads(id) ON DELETE CASCADE
);

create table if not exists centros.estudiantes (
    id SERIAL PRIMARY KEY,
    centro_id INTEGER NOT NULL,
    identidad TEXT NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    departamento_id INTEGER NOT NULL,
    municipio_id INTEGER NOT NULL,
    direccion TEXT DEFAULT NULL,
    fecha_nacimiento TEXT DEFAULT NULL,
    estado_civil TEXT NOT NULL,
    sexo TEXT NOT NULL,
    email TEXT DEFAULT NULL,
    facebook TEXT DEFAULT NULL,
    telefono TEXT DEFAULT NULL,
    celular TEXT DEFAULT NULL,
    estudia INTEGER NOT NULL DEFAULT 0,
    nivel_escolaridad_id TEXT DEFAULT NULL,
    pdf TEXT DEFAULT NULL,
    sangre TEXT NOT NULL,
    vive TEXT NOT NULL,
    numero_dep TEXT NOT NULL,
    trabajo_actual INTEGER NOT NULL DEFAULT 0,
    donde_trabaja TEXT DEFAULT NULL,
    puesto TEXT DEFAULT NULL,
    especial INTEGER NOT NULL DEFAULT 0,
    discapacidad_id TEXT DEFAULT NULL,
    riesgo_social INTEGER NOT NULL DEFAULT 0,
    etnia_id TEXT DEFAULT NULL,
    interno INTEGER NOT NULL DEFAULT 0,
    nombre_r TEXT DEFAULT NULL,
    telefono_r TEXT DEFAULT NULL,
    datos_r TEXT DEFAULT NULL,
    parentesco_r TEXT DEFAULT NULL,
    adicional_r TEXT DEFAULT NULL,
    estatus SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    twitter TEXT DEFAULT NULL,
    instagram TEXT DEFAULT NULL,
    tiene_hijos INTEGER NOT NULL DEFAULT 0,
    cuantos_hijos INTEGER NOT NULL DEFAULT 0,
    vivienda TEXT DEFAULT NULL,
    cantidad_viven INTEGER NOT NULL DEFAULT 0,
    cantidad_trabajan_viven INTEGER NOT NULL DEFAULT 0,
    cantidad_notrabajan_viven INTEGER NOT NULL DEFAULT 0,
    ingreso_promedio INTEGER NOT NULL DEFAULT 0,
    trabajado_ant INTEGER NOT NULL DEFAULT 0,
    tiempo_ant TEXT DEFAULT NULL,
    tipo_contrato_ant INTEGER DEFAULT NULL,
    beneficios_empleo TEXT DEFAULT NULL,
    beneficios_empleo_otro TEXT DEFAULT NULL,
    autoempleo INTEGER NOT NULL DEFAULT 0,
    autoempleo_dedicacion TEXT DEFAULT NULL,
    autoempleo_otro TEXT DEFAULT NULL,
    autoempleo_tiempo TEXT DEFAULT NULL,
    dias_semana_trabajo TEXT DEFAULT NULL,
    horas_dia_trabajo TEXT DEFAULT NULL,
    socios INTEGER NOT NULL DEFAULT 0,
    socios_cantidad INTEGER NOT NULL DEFAULT 0,
    constraint estudiantes_centro_id_foreign FOREIGN KEY (centro_id) REFERENCES centros.centros(id) ON DELETE CASCADE,
    constraint estudiantes_departamento_id_foreign FOREIGN KEY (departamento_id) REFERENCES centros.departamentos(id) ON DELETE CASCADE,
    constraint estudiantes_municipio_id_foreign FOREIGN KEY (municipio_id) REFERENCES centros.municipios(id) ON DELETE CASCADE,
    UNIQUE (centro_id, identidad)
);

-- ============================================================
-- 4. Tablas hijo / relación
-- ============================================================

create table if not exists centros.curso_areas (
    id SERIAL PRIMARY KEY,
    curso_id INTEGER NOT NULL,
    area_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint curso_areas_curso_id_foreign FOREIGN KEY (curso_id) REFERENCES centros.cursos(id) ON DELETE CASCADE,
    constraint curso_areas_area_id_foreign FOREIGN KEY (area_id) REFERENCES centros.areas(id) ON DELETE CASCADE
);

create table if not exists centros.curso_modulos (
    id SERIAL PRIMARY KEY,
    curso_id INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    horas_teoricas TEXT NOT NULL,
    horas_practicas TEXT NOT NULL,
    tipo_evaluacion INTEGER NOT NULL DEFAULT 1,
    observaciones TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint curso_modulos_curso_id_foreign FOREIGN KEY (curso_id) REFERENCES centros.cursos(id) ON DELETE CASCADE
);

create table if not exists centros.instructor_areas (
    id SERIAL PRIMARY KEY,
    instructor_id INTEGER NOT NULL,
    area_id INTEGER NOT NULL,
    subareas TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint instructor_areas_instructor_id_foreign FOREIGN KEY (instructor_id) REFERENCES centros.instructors(id) ON DELETE CASCADE,
    constraint instructor_areas_area_id_foreign FOREIGN KEY (area_id) REFERENCES centros.areas(id) ON DELETE CASCADE
);

create table if not exists centros.instructor_estudios (
    id SERIAL PRIMARY KEY,
    instructor_id INTEGER NOT NULL,
    tipo_certificado_id INTEGER NOT NULL,
    descripcion TEXT DEFAULT NULL,
    fecha DATE NOT NULL,
    horas_recibidas TEXT NOT NULL,
    institucion TEXT DEFAULT NULL,
    lugar TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint instructor_estudios_instructor_id_foreign FOREIGN KEY (instructor_id) REFERENCES centros.instructors(id) ON DELETE CASCADE,
    constraint instructor_estudios_tipo_certificado_id_foreign FOREIGN KEY (tipo_certificado_id) REFERENCES centros.tipo_certificados(id) ON DELETE CASCADE
);

create table if not exists centros.instructor_experiencias (
    id SERIAL PRIMARY KEY,
    instructor_id INTEGER NOT NULL,
    experiencia_id INTEGER NOT NULL,
    lugar TEXT DEFAULT NULL,
    puesto TEXT DEFAULT NULL,
    fecha_inicial DATE NOT NULL,
    fecha_final DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint instructor_experiencias_instructor_id_foreign FOREIGN KEY (instructor_id) REFERENCES centros.instructors(id) ON DELETE CASCADE,
    constraint instructor_experiencias_experiencia_id_foreign FOREIGN KEY (experiencia_id) REFERENCES centros.experiencias(id) ON DELETE CASCADE
);

create table if not exists centros.estudiante_fotos (
    id SERIAL PRIMARY KEY,
    estudiante_id INTEGER NOT NULL,
    tipo_foto INTEGER NOT NULL DEFAULT 1,
    foto TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint estudiante_fotos_estudiante_id_foreign FOREIGN KEY (estudiante_id) REFERENCES centros.estudiantes(id) ON DELETE CASCADE
);

create table if not exists centros.estudiante_huellas (
    id SERIAL PRIMARY KEY,
    estudiante_id INTEGER NOT NULL,
    pin TEXT DEFAULT NULL,
    huella1 TEXT DEFAULT NULL,
    huella2 TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint estudiante_huellas_estudiante_id_foreign FOREIGN KEY (estudiante_id) REFERENCES centros.estudiantes(id) ON DELETE CASCADE
);

create table if not exists centros.estudiante_areas (
    id SERIAL PRIMARY KEY,
    estudiante_id INTEGER NOT NULL,
    area_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint estudiante_areas_estudiante_id_foreign FOREIGN KEY (estudiante_id) REFERENCES centros.estudiantes(id) ON DELETE CASCADE,
    constraint estudiante_areas_area_id_foreign FOREIGN KEY (area_id) REFERENCES centros.areas(id) ON DELETE CASCADE
);

create table if not exists centros.estudiante_jornadas (
    id SERIAL PRIMARY KEY,
    estudiante_id INTEGER NOT NULL,
    jornada_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint estudiante_jornadas_estudiante_id_foreign FOREIGN KEY (estudiante_id) REFERENCES centros.estudiantes(id) ON DELETE CASCADE,
    constraint estudiante_jornadas_jornada_id_foreign FOREIGN KEY (jornada_id) REFERENCES centros.tipo_jornadas(id) ON DELETE CASCADE
);

create table if not exists centros.egresados (
    id SERIAL PRIMARY KEY,
    estudiante_id INTEGER NOT NULL,
    tipo_egreso INTEGER NOT NULL,
    practica_profesional INTEGER NOT NULL DEFAULT 0,
    nombre_empresa TEXT DEFAULT NULL,
    estudiando INTEGER NOT NULL DEFAULT 0,
    nombre_institucion TEXT DEFAULT NULL,
    carrera TEXT DEFAULT NULL,
    buscando_empleo INTEGER NOT NULL DEFAULT 0,
    empresas_visitadas TEXT DEFAULT NULL,
    fecha_visita DATE DEFAULT NULL,
    trabaja_actualmente INTEGER NOT NULL DEFAULT 0,
    lugar_trabajo TEXT DEFAULT NULL,
    inicio DATE DEFAULT NULL,
    deserto DATE DEFAULT NULL,
    final DATE DEFAULT NULL,
    observaciones TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint egresados_estudiante_id_foreign FOREIGN KEY (estudiante_id) REFERENCES centros.estudiantes(id) ON DELETE CASCADE
);

-- ============================================================
-- 5. Procesos
-- ============================================================

create table if not exists centros.procesos (
    id SERIAL PRIMARY KEY,
    codigo TEXT NOT NULL,
    centro_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    instructor_id INTEGER NOT NULL,
    curso_id INTEGER NOT NULL,
    metodologia_id INTEGER NOT NULL,
    otra_metodologia TEXT DEFAULT NULL,
    fecha_inicial DATE NOT NULL,
    fecha_final DATE NOT NULL,
    duracion_horas TEXT NOT NULL,
    tipo_jornada_id INTEGER NOT NULL,
    horario TEXT NOT NULL,
    dias TEXT NOT NULL,
    sede INTEGER NOT NULL DEFAULT 0,
    lugar TEXT DEFAULT NULL,
    fuente_financiamiento_id INTEGER NOT NULL,
    estatus SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint procesos_centro_id_foreign FOREIGN KEY (centro_id) REFERENCES centros.centros(id) ON DELETE CASCADE,
    constraint procesos_curso_id_foreign FOREIGN KEY (curso_id) REFERENCES centros.cursos(id) ON DELETE CASCADE,
    constraint procesos_instructor_id_foreign FOREIGN KEY (instructor_id) REFERENCES centros.instructors(id) ON DELETE CASCADE,
    constraint procesos_metodologia_id_foreign FOREIGN KEY (metodologia_id) REFERENCES centros.metodologias(id) ON DELETE CASCADE,
    constraint procesos_tipo_jornada_id_foreign FOREIGN KEY (tipo_jornada_id) REFERENCES centros.tipo_jornadas(id) ON DELETE CASCADE
);

-- ============================================================
-- 6. Tablas de proceso
-- ============================================================

create table if not exists centros.proceso_evaluacions (
    id SERIAL PRIMARY KEY,
    proceso_id INTEGER NOT NULL,
    estudiante_id INTEGER NOT NULL,
    modulo_id INTEGER NOT NULL,
    calificacion BIGINT NOT NULL DEFAULT 0,
    observacion TEXT DEFAULT NULL,
    estatus SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint proceso_evaluacions_proceso_id_foreign FOREIGN KEY (proceso_id) REFERENCES centros.procesos(id) ON DELETE CASCADE,
    constraint proceso_evaluacions_estudiante_id_foreign FOREIGN KEY (estudiante_id) REFERENCES centros.estudiantes(id) ON DELETE CASCADE,
    constraint proceso_evaluacions_modulo_id_foreign FOREIGN KEY (modulo_id) REFERENCES centros.curso_modulos(id) ON DELETE CASCADE
);

create table if not exists centros.proceso_matriculas (
    id SERIAL PRIMARY KEY,
    proceso_id INTEGER NOT NULL,
    estudiante_id INTEGER NOT NULL,
    tipo_matricula INTEGER NOT NULL DEFAULT 2,
    estatus SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint proceso_matriculas_proceso_id_foreign FOREIGN KEY (proceso_id) REFERENCES centros.procesos(id) ON DELETE CASCADE,
    constraint proceso_matriculas_estudiante_id_foreign FOREIGN KEY (estudiante_id) REFERENCES centros.estudiantes(id) ON DELETE CASCADE
);

create table if not exists centros.proceso_incidencias (
    id SERIAL PRIMARY KEY,
    proceso_id INTEGER NOT NULL,
    estudiante_id INTEGER NOT NULL,
    tipo_incidencia_id INTEGER NOT NULL,
    fecha DATE NOT NULL,
    descripcion TEXT DEFAULT NULL,
    observacion TEXT DEFAULT NULL,
    archivo TEXT DEFAULT NULL,
    bloquear SMALLINT NOT NULL DEFAULT 0,
    estatus SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint proceso_incidencias_proceso_id_foreign FOREIGN KEY (proceso_id) REFERENCES centros.procesos(id) ON DELETE CASCADE,
    constraint proceso_incidencias_estudiante_id_foreign FOREIGN KEY (estudiante_id) REFERENCES centros.estudiantes(id) ON DELETE CASCADE
);

create table if not exists centros.excusa_asistencias (
    id SERIAL PRIMARY KEY,
    estudiante_id INTEGER NOT NULL,
    proceso_id INTEGER NOT NULL,
    observacion TEXT NOT NULL,
    fecha DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT NULL,
    constraint excusa_asistencias_estudiante_id_foreign FOREIGN KEY (estudiante_id) REFERENCES centros.estudiantes(id) ON DELETE CASCADE,
    constraint excusa_asistencias_proceso_id_foreign FOREIGN KEY (proceso_id) REFERENCES centros.procesos(id) ON DELETE CASCADE
);
