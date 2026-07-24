// ─────────────────────────────────────────────────────────────────────────────
// Normalización y validación centralizada para la CAPTURA de centros
// (estudiantes y procesos educativos), alineada al esquema post-recaptura:
//   · migración 1772310000000 (estudiantes): sexo M/F, identidad ####-####-#####,
//     fecha_nacimiento DATE 1930..hoy-10años, vive catálogo de 5 labels,
//     nivel_escolaridad_id/discapacidad_id/etnia_id INTEGER, banderas 0/1.
//   · migración 1772320000000 (procesos): duracion_horas INTEGER > 0,
//     fecha_final >= fecha_inicial, dias en JSON canónico ["1".."7"].
//
// Todas las rutas de alta/edición (JSON, wizard y Excel) deben pasar por aquí
// para que exista UNA sola definición de cada regla.
//
// Convención: cada normalizador devuelve { value } si es válido o
// { error: "mensaje en español" } si no. buildStudentPayload agrega todos los
// errores de un estudiante en un arreglo para reportarlos juntos.
// ─────────────────────────────────────────────────────────────────────────────

const ISO_DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}/;

function pad2(n) {
    return String(n).padStart(2, "0");
}

// Convierte Date | 'YYYY-MM-DD[...]' | número serial de Excel → 'YYYY-MM-DD'.
// Devuelve null si el valor no es interpretable como fecha.
export function toDateOnly(value) {
    if (value === null || value === undefined || value === "") return null;

    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        // Una fecha "solo día" puede venir anclada a medianoche UTC (APIs,
        // Date.UTC) o a medianoche local (lectores de Excel). Leerla con los
        // getters equivocados corre el día en zonas UTC-negativas como
        // Honduras (UTC-6). Si el reloj UTC marca 00:00 es un ancla UTC.
        if (value.getUTCHours() === 0 && value.getUTCMinutes() === 0) {
            return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
        }
        return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }

    // Serial de fecha de Excel (época 1899-12-30). Rango sano ≈ 1901..2100.
    if (typeof value === "number" && Number.isFinite(value)) {
        if (value < 367 || value > 73415) return null;
        const d = new Date(Math.round((value - 25569) * 86400000));
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }

    const s = String(value).trim();
    if (ISO_DATE_PREFIX_RE.test(s)) {
        const iso = s.slice(0, 10);
        const [y, m, d] = iso.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
        return iso;
    }

    // Texto D/M/AAAA o DD-MM-AAAA: formato natural de los Excel del cliente
    // (ej. "2/9/2008", "16/03/2003"). SIEMPRE día primero (convención
    // hondureña) — nunca se interpreta como mes/día. Años de 2 dígitos se
    // rechazan a propósito: adivinar el siglo produce fechas silenciosamente
    // equivocadas.
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (dmy) {
        const d = Number(dmy[1]);
        const m = Number(dmy[2]);
        const y = Number(dmy[3]);
        const dt = new Date(Date.UTC(y, m - 1, d));
        if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
        return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    return null;
}

function todayLocalIso() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// ─── Estudiantes ─────────────────────────────────────────────────────────────

export function normalizeSexo(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
        return { error: "Sexo es requerido" };
    }
    const s = String(value).trim().toUpperCase();
    if (["M", "MASCULINO", "HOMBRE", "VARON", "VARÓN"].includes(s)) return { value: "M" };
    if (["F", "FEMENINO", "MUJER"].includes(s)) return { value: "F" };
    return { error: `Sexo inválido: "${String(value).trim()}". Use M/Masculino o F/Femenino` };
}

export function normalizeFechaNacimiento(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
        return { value: null };
    }
    const iso = toDateOnly(value);
    if (!iso) {
        return { error: `Fecha de nacimiento inválida: "${String(value).trim()}". Use AAAA-MM-DD o DD/MM/AAAA (año de 4 dígitos)` };
    }
    // Cota superior = hoy - 10 años (misma regla que el CHECK de la migración).
    const hoy = todayLocalIso();
    const max = `${Number(hoy.slice(0, 4)) - 10}${hoy.slice(4)}`;
    if (iso < "1930-01-01" || iso > max) {
        return { error: `Fecha de nacimiento fuera de rango: debe estar entre 1930-01-01 y ${max} (edad mínima 10 años)` };
    }
    return { value: iso };
}

export function normalizeIdentidad(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
        return { error: "Identidad es requerida" };
    }
    const digits = String(value).replace(/\D/g, "");
    if (digits.length !== 13) {
        return { error: `Identidad inválida: "${String(value).trim()}". Debe tener 13 dígitos (formato ####-####-#####)` };
    }
    return { value: `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}` };
}

const VIVE_BY_ID = { 1: "Padres", 2: "Solo(a)", 3: "Pareja", 4: "Familiares", 5: "Otros" };

export function normalizeVive(value) {
    if (Array.isArray(value)) value = value.length > 0 ? value[0] : null;
    if (value === null || value === undefined || String(value).trim() === "") {
        return { error: "El campo \"vive\" es requerido" };
    }
    // Quita corchetes/comillas/escapes de las variantes JSON heredadas ('["1"]', '[\"1\"]').
    const s = String(value).replace(/[[\]"'\\]/g, "").trim();
    if (/^[1-5]$/.test(s)) return { value: VIVE_BY_ID[Number(s)] };
    const lower = s.toLowerCase();
    for (const label of Object.values(VIVE_BY_ID)) {
        if (label.toLowerCase() === lower) return { value: label };
    }
    if (["solo", "sola", "solo(a)", "sola(o)", "soloa"].includes(lower)) return { value: "Solo(a)" };
    if (lower === "otro") return { value: "Otros" };
    return { error: `Valor de "vive" inválido: "${String(value).trim()}". Use Padres, Solo(a), Pareja, Familiares u Otros` };
}

// Ids de catálogo (nivel_escolaridad_id, discapacidad_id, etnia_id):
// acepta 3, '3', ['3'], '["3"]'; ''/'null'/null → null; otro → error.
export function normalizeCatalogId(value, label) {
    if (value === null || value === undefined) return { value: null };
    if (Array.isArray(value)) {
        if (value.length === 0) return { value: null };
        value = value[0];
    }
    const s = String(value).replace(/[[\]"'\\]/g, "").trim();
    if (s === "" || s.toLowerCase() === "null") return { value: null };
    const n = Number(s);
    if (Number.isInteger(n) && n > 0) return { value: n };
    return { error: `${label} inválido: "${String(value).trim()}". Debe ser un entero del catálogo o vacío` };
}

// Banderas sí/no → 0/1 (coerción, nunca error: cualquier cosa rara cae a 0/1).
export function coerceFlag(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "boolean") return value ? 1 : 0;
    const s = String(value).trim().toLowerCase();
    if (["1", "si", "sí", "true", "yes", "x"].includes(s)) return 1;
    if (["0", "no", "false"].includes(s)) return 0;
    const n = Number(s);
    return Number.isFinite(n) && n !== 0 ? 1 : 0;
}

function strOrNull(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s || null;
}

function intOrDefault(value, def) {
    if (value === null || value === undefined || String(value).trim() === "") return def;
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : def;
}

// Payload completo de estudiante para INSERT/UPDATE. Usado por TODAS las rutas
// de alta/edición (JSON individual, wizard de centro e import Excel).
// Devuelve { payload, errors }; si errors.length > 0 el registro NO debe
// persistirse (la ruta responde 400 o reporta el error por fila).
export function buildStudentPayload(b) {
    const errors = [];
    const take = (res) => {
        if (res.error) {
            errors.push(res.error);
            return null;
        }
        return res.value;
    };

    const identidad = take(normalizeIdentidad(b.identidad));
    const sexo = take(normalizeSexo(b.sexo));
    const fecha_nacimiento = take(normalizeFechaNacimiento(b.fecha_nacimiento));
    const vive = take(normalizeVive(b.vive));
    const nivel_escolaridad_id = take(normalizeCatalogId(b.nivel_escolaridad_id, "Nivel de escolaridad"));
    const discapacidad_id = take(normalizeCatalogId(b.discapacidad_id, "Discapacidad"));
    const etnia_id = take(normalizeCatalogId(b.etnia_id, "Etnia"));

    const payload = {
        identidad,
        nombres: strOrNull(b.nombres),
        apellidos: strOrNull(b.apellidos),
        departamento_id: intOrDefault(b.departamento_id, null),
        municipio_id: intOrDefault(b.municipio_id, null),
        email: strOrNull(b.email),
        telefono: strOrNull(b.telefono),
        celular: strOrNull(b.celular),
        sexo,
        estado_civil: strOrNull(b.estado_civil),
        fecha_nacimiento,
        vive,
        numero_dep: b.numero_dep === null || b.numero_dep === undefined ? null : String(b.numero_dep).trim(),
        direccion: strOrNull(b.direccion),
        facebook: strOrNull(b.facebook),
        twitter: strOrNull(b.twitter),
        instagram: strOrNull(b.instagram),
        estudia: coerceFlag(b.estudia),
        nivel_escolaridad_id,
        tiene_hijos: coerceFlag(b.tiene_hijos),
        cuantos_hijos: intOrDefault(b.cuantos_hijos, 0),
        vivienda: strOrNull(b.vivienda),
        cantidad_viven: intOrDefault(b.cantidad_viven, 0),
        cantidad_trabajan_viven: intOrDefault(b.cantidad_trabajan_viven, 0),
        cantidad_notrabajan_viven: intOrDefault(b.cantidad_notrabajan_viven, 0),
        ingreso_promedio: intOrDefault(b.ingreso_promedio, 0),
        trabajo_actual: coerceFlag(b.trabajo_actual),
        donde_trabaja: strOrNull(b.donde_trabaja),
        puesto: strOrNull(b.puesto),
        trabajado_ant: coerceFlag(b.trabajado_ant),
        tiempo_ant: strOrNull(b.tiempo_ant),
        tipo_contrato_ant: intOrDefault(b.tipo_contrato_ant, null),
        beneficios_empleo: strOrNull(b.beneficios_empleo),
        beneficios_empleo_otro: strOrNull(b.beneficios_empleo_otro),
        autoempleo: coerceFlag(b.autoempleo),
        autoempleo_dedicacion: strOrNull(b.autoempleo_dedicacion),
        autoempleo_otro: strOrNull(b.autoempleo_otro),
        autoempleo_tiempo: strOrNull(b.autoempleo_tiempo),
        dias_semana_trabajo: strOrNull(b.dias_semana_trabajo),
        horas_dia_trabajo: strOrNull(b.horas_dia_trabajo),
        socios: coerceFlag(b.socios),
        socios_cantidad: intOrDefault(b.socios_cantidad, 0),
        especial: coerceFlag(b.especial),
        discapacidad_id,
        etnia_id,
        interno: coerceFlag(b.interno),
        nombre_r: strOrNull(b.nombre_r),
        telefono_r: strOrNull(b.telefono_r),
        datos_r: strOrNull(b.datos_r),
        parentesco_r: strOrNull(b.parentesco_r),
        adicional_r: strOrNull(b.adicional_r),
        // riesgo_social y sangre solo se tocan si vienen en el body: el import
        // Excel omite riesgo_social a propósito (no pisa el valor histórico) y
        // las rutas JSON históricamente no escribían sangre.
        ...(b.riesgo_social !== undefined ? { riesgo_social: coerceFlag(b.riesgo_social) } : {}),
        ...(b.sangre !== undefined ? { sangre: strOrNull(b.sangre) } : {}),
    };

    return { payload, errors };
}

// ─── Procesos educativos ─────────────────────────────────────────────────────

export function normalizeDuracionHoras(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
        return { error: "Duración en horas es requerida" };
    }
    const n = Number(String(value).trim());
    if (!Number.isInteger(n) || n <= 0) {
        return { error: `Duración en horas inválida: "${String(value).trim()}". Debe ser un entero mayor que 0` };
    }
    return { value: n };
}

// dias → JSON canónico: array de strings '1'..'7', únicos y ordenados,
// serializado con JSON.stringify (ej. ["2","3","5"]). Acepta array, JSON
// escapado ('[\"2\"]'), JSON normal ('["2","3"]') y CSV ('2,3,5').
export function normalizeDias(value) {
    let items;
    if (Array.isArray(value)) {
        items = value;
    } else {
        if (value === null || value === undefined || String(value).trim() === "") {
            return { error: "Días es requerido" };
        }
        const s = String(value).replace(/[[\]"'\\]/g, "").trim();
        if (s === "") return { error: "Días es requerido" };
        items = s.split(",");
    }

    const dias = [...new Set(
        items
            .map((d) => String(d ?? "").replace(/[[\]"'\\]/g, "").trim())
            .filter((d) => d !== "")
    )];
    if (dias.length === 0) return { error: "Días es requerido" };
    for (const d of dias) {
        if (!/^[1-7]$/.test(d)) {
            return { error: `Día inválido: "${d}". Use valores del 1 (Domingo) al 7 (Sábado)` };
        }
    }
    dias.sort();
    return { value: JSON.stringify(dias) };
}

export function normalizeProcessDates(fechaInicial, fechaFinal) {
    const ini = toDateOnly(fechaInicial);
    if (!ini) {
        return { error: `Fecha inicial inválida: "${fechaInicial ?? ""}". Use el formato AAAA-MM-DD` };
    }
    const fin = toDateOnly(fechaFinal);
    if (!fin) {
        return { error: `Fecha final inválida: "${fechaFinal ?? ""}". Use el formato AAAA-MM-DD` };
    }
    if (fin < ini) {
        return { error: `La fecha final (${fin}) no puede ser anterior a la fecha inicial (${ini})` };
    }
    return { value: { fecha_inicial: ini, fecha_final: fin } };
}
