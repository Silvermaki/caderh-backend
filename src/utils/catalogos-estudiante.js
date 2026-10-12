// ─────────────────────────────────────────────────────────────────────────────
// Resolución de catálogos del estudiante por NOMBRE (notas CADERH 18/08/2026:
// "la subida masiva pide código de departamento y municipio").
//
// La carga masiva acepta el nombre tal como lo escribe la gente
// ("Francisco Morazán", "Francisco_Morazan", "francisco morazan") y, por
// compatibilidad con plantillas viejas, también el ID numérico. Si vienen
// ambos manda el nombre: en las plantillas viejas la columna de nombre era la
// que la gente editaba.
// ─────────────────────────────────────────────────────────────────────────────

import { plano } from "./texto.js";

const vacio = (v) => v === null || v === undefined || String(v).trim() === "";

function indexar(rows) {
    const porId = new Map(rows.map((r) => [Number(r.id), r]));
    const porNombre = new Map();
    for (const r of rows) {
        const k = plano(r.nombre);
        if (!porNombre.has(k)) porNombre.set(k, r);
    }
    return { porId, porNombre };
}

export function crearResolverEstudiante(catalogos) {
    const deptos = indexar(catalogos.departamentos ?? []);
    const munis = catalogos.municipios ?? [];
    const munisPorDepto = new Map();
    for (const m of munis) {
        const k = Number(m.departamento_id);
        if (!munisPorDepto.has(k)) munisPorDepto.set(k, indexar([]));
    }
    for (const [deptoId] of munisPorDepto) {
        munisPorDepto.set(deptoId, indexar(munis.filter((m) => Number(m.departamento_id) === deptoId)));
    }
    const catalogosSimples = {
        nivel: indexar(catalogos.nivelEscolaridades ?? []),
        discapacidad: indexar(catalogos.discapacidades ?? []),
        etnia: indexar(catalogos.etnias ?? []),
    };

    function departamento(nombre, id) {
        if (!vacio(nombre)) {
            const r = deptos.porNombre.get(plano(nombre));
            if (r) return { value: Number(r.id) };
            return { error: `Departamento "${String(nombre).trim()}" no existe en el catálogo` };
        }
        if (!vacio(id)) {
            const r = deptos.porId.get(Number(id));
            if (r) return { value: Number(r.id) };
            return { error: `Departamento ID ${id} no existe en el catálogo` };
        }
        return { error: "Departamento es requerido" };
    }

    function municipio(departamentoId, nombre, id) {
        const delDepto = munisPorDepto.get(Number(departamentoId)) ?? indexar([]);
        if (!vacio(nombre)) {
            const r = delDepto.porNombre.get(plano(nombre));
            if (r) return { value: Number(r.id) };
            return { error: `Municipio "${String(nombre).trim()}" no pertenece al departamento indicado` };
        }
        if (!vacio(id)) {
            const r = delDepto.porId.get(Number(id));
            if (r) return { value: Number(r.id) };
            return { error: `Municipio ID ${id} no pertenece al departamento indicado` };
        }
        return { error: "Municipio es requerido" };
    }

    // Catálogo opcional (nivel de escolaridad, discapacidad, etnia): vacío → null.
    function catalogo(tipo, etiqueta, nombre, id) {
        const cat = catalogosSimples[tipo];
        if (!vacio(nombre)) {
            const r = cat.porNombre.get(plano(nombre));
            if (r) return { value: Number(r.id) };
            return { error: `${etiqueta} "${String(nombre).trim()}" no existe en el catálogo` };
        }
        if (!vacio(id)) {
            const r = cat.porId.get(Number(String(id).replace(/[[\]"'\\]/g, "")));
            if (r) return { value: Number(r.id) };
            return { error: `${etiqueta} ID ${id} no existe en el catálogo` };
        }
        return { value: null };
    }

    return { departamento, municipio, catalogo };
}
