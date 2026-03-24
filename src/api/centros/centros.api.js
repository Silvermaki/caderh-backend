import { Router } from "express";
import { sequelize, user_logs, sgc_areas, sgc_departamentos, sgc_municipios, sgc_centros, sgc_instructors, sgc_estudiantes, sgc_cursos, sgc_nivel_escolaridads, sgc_curso_modulos, sgc_procesos, sgc_proceso_matriculas, sgc_metodologias, sgc_tipo_jornadas, projects_processes, projects } from "../../utils/sequelize.js";
import { verify_token, is_supervisor, is_authenticated } from "../../utils/token.js";
import { Op } from "sequelize";
import { instructorFileUpload, buildInstructorFilePath, studentFileUpload, buildStudentFilePath } from "../../utils/upload.js";
import multer from "multer";
import {
    generateInstructorsExcel, parseInstructorsExcel,
    generateStudentsExcel, parseStudentsExcel,
    generateCoursesExcel, parseCoursesExcel,
    generateProcessesExcel, parseProcessesExcel,
    generateModulesExcel, parseModulesExcel,
    generateEnrollmentsExcel, parseEnrollmentsExcel,
    validateMunicipioDepartamento,
} from "../../utils/excel-centros.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const router = Router();

// ─── Areas CRUD ──────────────────────────────────────────────────────────────

// List areas (paginated or all)
router.get("/areas", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { limit, offset, sort, desc, search, all } = req.query;

            if (all === "true") {
                const rows = await sgc_areas.findAll({
                    where: { estatus: 1 },
                    attributes: ["id", "nombre"],
                    order: [["nombre", "ASC"]],
                });
                return res.status(200).json({ data: rows });
            }

            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const where = {
                estatus: 1,
                ...(search ? { nombre: { [Op.iLike]: `%${search}%` } } : {}),
            };

            const result = await sgc_areas.findAndCountAll({
                attributes: ["id", "nombre", "estatus", "created_at"],
                where,
                order: sort ? [[sort, desc === "desc" ? "DESC" : "ASC"]] : [["nombre", "ASC"]],
                limit: Number(limit),
                offset: Number(offset ?? 0),
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

// Create area
router.post("/areas", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { nombre } = req.body;
            if (!nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
                return res.status(400).json({ message: "Nombre inválido" });
            }

            const existing = await sgc_areas.findOne({ where: { nombre: { [Op.iLike]: nombre.trim() }, estatus: 1 } });
            if (existing) {
                return res.status(400).json({ message: "Ya existe un área con este nombre" });
            }

            const area = await sgc_areas.create({ nombre: nombre.trim() });

            await user_logs.create({
                user_id: req.user_id,
                log: `Creó área ID: ${area.id}, NOMBRE: ${area.nombre}`,
            });

            res.status(201).json({ ok: true, id: area.id });
        } catch (e) {
            next(e);
        }
    }
);

// Update area
router.put("/areas", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id, nombre } = req.body;
            if (!id || !nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const area = await sgc_areas.findOne({ where: { id } });
            if (!area) return res.status(404).json({ message: "Área no encontrada" });

            const existing = await sgc_areas.findOne({ where: { nombre: { [Op.iLike]: nombre.trim() }, estatus: 1, id: { [Op.ne]: id } } });
            if (existing) {
                return res.status(400).json({ message: "Ya existe otra área con este nombre" });
            }

            await sgc_areas.update({ nombre: nombre.trim() }, { where: { id } });

            await user_logs.create({
                user_id: req.user_id,
                log: `Actualizó área ID: ${id}, NOMBRE: ${nombre.trim()}`,
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Delete area (soft delete)
router.delete("/areas/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const area = await sgc_areas.findOne({ where: { id } });
            if (!area) return res.status(404).json({ message: "Área no encontrada" });

            await sgc_areas.update({ estatus: 0 }, { where: { id } });

            await user_logs.create({
                user_id: req.user_id,
                log: `Eliminó área ID: ${id}, NOMBRE: ${area.nombre}`,
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Departamentos & Municipios (catalogos de ubicación) ─────────────────────

// List departamentos
router.get("/departamentos", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const rows = await sgc_departamentos.findAll({
                where: { estatus: 1 },
                attributes: ["id", "nombre"],
                order: [["nombre", "ASC"]],
            });
            res.status(200).json({ data: rows });
        } catch (e) {
            next(e);
        }
    }
);

// List municipios (filtered by departamento)
router.get("/municipios", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { departamento_id } = req.query;
            const where = { estatus: 1 };
            if (departamento_id) where.departamento_id = Number(departamento_id);

            const rows = await sgc_municipios.findAll({
                where,
                attributes: ["id", "nombre", "departamento_id"],
                order: [["nombre", "ASC"]],
            });
            res.status(200).json({ data: rows });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Centros ─────────────────────────────────────────────────────────────────

// List centros
router.get("/centros", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { limit, offset, sort, desc, search, estatus, all } = req.query;

            if (all === "true") {
                const rows = await sgc_centros.findAll({
                    where: { estatus: 1 },
                    attributes: ["id", "nombre"],
                    order: [["nombre", "ASC"]],
                });
                return res.status(200).json({ data: rows });
            }

            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const statusFilter = estatus === "0" ? 0 : 1;

            const where = {
                estatus: statusFilter,
                ...(search
                    ? {
                        [Op.or]: [
                            { nombre: { [Op.iLike]: `%${search}%` } },
                            { siglas: { [Op.iLike]: `%${search}%` } },
                            { codigo: { [Op.iLike]: `%${search}%` } },
                        ],
                    }
                    : {}),
            };

            const result = await sgc_centros.findAndCountAll({
                attributes: [
                    "id", "siglas", "codigo", "nombre", "descripcion",
                    "departamento_id", "municipio_id",
                    "direccion", "telefono", "email",
                    "nombre_director", "estatus", "created_at",
                    [sequelize.literal(`(SELECT d.nombre FROM centros.departamentos d WHERE d.id = "centros".departamento_id)`), "departamento_nombre"],
                    [sequelize.literal(`(SELECT m.nombre FROM centros.municipios m WHERE m.id = "centros".municipio_id)`), "municipio_nombre"],
                ],
                where,
                order: sort ? [[sort, desc === "desc" ? "DESC" : "ASC"]] : [["nombre", "ASC"]],
                limit: Number(limit),
                offset: Number(offset ?? 0),
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

// Get single centro
router.get("/centros/:id", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const centro = await sgc_centros.findOne({
                where: { id },
                attributes: {
                    include: [
                        [sequelize.literal(`(SELECT d.nombre FROM centros.departamentos d WHERE d.id = "centros".departamento_id)`), "departamento_nombre"],
                        [sequelize.literal(`(SELECT m.nombre FROM centros.municipios m WHERE m.id = "centros".municipio_id)`), "municipio_nombre"],
                    ],
                },
            });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });
            res.status(200).json({ data: centro });
        } catch (e) {
            next(e);
        }
    }
);

// Update centro general info
router.put("/centros/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const b = req.body;

            if (!b.nombre || !b.siglas || !b.codigo || !b.departamento_id || !b.municipio_id) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const centro = await sgc_centros.findOne({ where: { id } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            await sgc_centros.update({
                nombre: b.nombre.trim(),
                siglas: b.siglas.trim(),
                codigo: b.codigo.trim(),
                descripcion: b.descripcion?.trim() || null,
                departamento_id: b.departamento_id,
                municipio_id: b.municipio_id,
                direccion: b.direccion?.trim() || null,
                telefono: b.telefono?.trim() || null,
                email: b.email?.trim() || null,
                pagina_web: b.pagina_web?.trim() || null,
                facebook: b.facebook?.trim() || null,
                twitter: b.twitter?.trim() || null,
                nombre_director: b.nombre_director?.trim() || null,
                telefono_director: b.telefono_director?.trim() || null,
                email_director: b.email_director?.trim() || null,
                nombre_contacto: b.nombre_contacto?.trim() || null,
                telefono_contacto: b.telefono_contacto?.trim() || null,
                email_contacto: b.email_contacto?.trim() || null,
                puesto_contacto: b.puesto_contacto?.trim() || null,
            }, { where: { id } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó centro ID: ${id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Centro Wizard (create centro + courses + instructors + students) ────────

router.post("/centros/wizard", verify_token, is_supervisor,
    async (req, res, next) => {
        const t = await sequelize.transaction();
        try {
            const b = req.body;

            // 1. Validate centro required fields
            if (!b.nombre?.trim() || !b.siglas?.trim() || !b.codigo?.trim() || !b.departamento_id || !b.municipio_id) {
                await t.rollback();
                return res.status(400).json({ message: "Faltan campos requeridos del centro (nombre, siglas, codigo, departamento, municipio)" });
            }

            // 2. Create centro
            const centro = await sgc_centros.create({
                nombre: b.nombre.trim(),
                siglas: b.siglas.trim(),
                codigo: b.codigo.trim(),
                descripcion: b.descripcion?.trim() || null,
                departamento_id: Number(b.departamento_id),
                municipio_id: Number(b.municipio_id),
                direccion: b.direccion?.trim() || null,
                telefono: b.telefono?.trim() || null,
                email: b.email?.trim() || null,
                pagina_web: b.pagina_web?.trim() || null,
                facebook: b.facebook?.trim() || null,
                twitter: b.twitter?.trim() || null,
                nombre_director: b.nombre_director?.trim() || null,
                telefono_director: b.telefono_director?.trim() || null,
                email_director: b.email_director?.trim() || null,
                nombre_contacto: b.nombre_contacto?.trim() || null,
                telefono_contacto: b.telefono_contacto?.trim() || null,
                email_contacto: b.email_contacto?.trim() || null,
                puesto_contacto: b.puesto_contacto?.trim() || null,
                estatus: 1,
            }, { transaction: t });

            const centroId = centro.id;
            let coursesCreated = 0, instructorsCreated = 0, studentsCreated = 0;
            const errors = [];

            // 3. Create courses with modules
            const courses = Array.isArray(b.courses) ? b.courses : [];
            for (const c of courses) {
                try {
                    if (!c.nombre?.trim() || !c.codigo_programa?.trim() || !c.objetivo?.trim()) {
                        errors.push(`Curso "${c.nombre || "sin nombre"}": faltan campos requeridos`);
                        continue;
                    }
                    const course = await sgc_cursos.create({
                        centro_id: centroId,
                        codigo: c.codigo ? Number(c.codigo) : null,
                        nombre: c.nombre.trim(),
                        codigo_programa: c.codigo_programa.trim(),
                        total_horas: "0",
                        taller: c.taller ?? 1,
                        objetivo: c.objetivo.trim(),
                        estatus: 1,
                    }, { transaction: t });

                    const modules = Array.isArray(c.modules) ? c.modules : [];
                    for (const m of modules) {
                        try {
                            if (!m.codigo || !m.nombre || !m.horas_teoricas || !m.horas_practicas) continue;
                            await sgc_curso_modulos.create({
                                curso_id: course.id,
                                codigo: m.codigo,
                                nombre: m.nombre,
                                horas_teoricas: m.horas_teoricas,
                                horas_practicas: m.horas_practicas,
                                tipo_evaluacion: m.tipo_evaluacion ?? 1,
                                observaciones: m.observaciones || null,
                            }, { transaction: t });
                        } catch (err) {
                            errors.push(`Módulo "${m.nombre}" del curso "${c.nombre}": ${err.message}`);
                        }
                    }

                    // Recalculate total_horas
                    const mods = await sgc_curso_modulos.findAll({ where: { curso_id: course.id }, transaction: t, raw: true });
                    const total = mods.reduce((sum, m) => sum + (parseFloat(m.horas_teoricas) || 0) + (parseFloat(m.horas_practicas) || 0), 0);
                    await sgc_cursos.update({ total_horas: String(total) }, { where: { id: course.id }, transaction: t });

                    coursesCreated++;
                } catch (err) {
                    errors.push(`Curso "${c.nombre}": ${err.message}`);
                }
            }

            // 4. Create instructors
            const instructors = Array.isArray(b.instructors) ? b.instructors : [];
            for (const i of instructors) {
                try {
                    if (!i.nombres?.trim() || !i.apellidos?.trim()) {
                        errors.push(`Instructor "${i.nombres || "sin nombre"}": faltan campos requeridos`);
                        continue;
                    }
                    await sgc_instructors.create({
                        centro_id: centroId,
                        nombres: i.nombres.trim(),
                        apellidos: i.apellidos.trim(),
                        titulo_obtenido: i.titulo_obtenido?.trim() || null,
                        otros_titulos: i.otros_titulos?.trim() || null,
                        estatus: 1,
                    }, { transaction: t });
                    instructorsCreated++;
                } catch (err) {
                    errors.push(`Instructor "${i.nombres}": ${err.message}`);
                }
            }

            // 5. Create students
            const students = Array.isArray(b.students) ? b.students : [];
            // Check duplicate identidades within batch
            const batchIdentidades = students.map(s => s.identidad?.trim()).filter(Boolean);
            const duplicatesInBatch = batchIdentidades.filter((id, idx) => batchIdentidades.indexOf(id) !== idx);

            // Check existing identidades in DB
            let existingIdentidades = new Set();
            if (batchIdentidades.length > 0) {
                const existing = await sgc_estudiantes.findAll({
                    where: { identidad: { [Op.in]: batchIdentidades }, estatus: 1 },
                    attributes: ["identidad"],
                    raw: true,
                    transaction: t,
                });
                existingIdentidades = new Set(existing.map(e => e.identidad));
            }

            for (const s of students) {
                try {
                    const identidad = s.identidad?.trim();
                    if (!identidad || !s.nombres?.trim() || !s.apellidos?.trim() || !s.sexo || !s.departamento_id || !s.municipio_id || !s.vive || s.numero_dep == null) {
                        errors.push(`Estudiante "${identidad || "sin identidad"}": faltan campos requeridos`);
                        continue;
                    }
                    if (duplicatesInBatch.includes(identidad)) {
                        errors.push(`Estudiante "${identidad}": identidad duplicada en el archivo`);
                        continue;
                    }
                    if (existingIdentidades.has(identidad)) {
                        errors.push(`Estudiante "${identidad}": ya existe en el sistema`);
                        continue;
                    }
                    await sgc_estudiantes.create({
                        centro_id: centroId,
                        estatus: 1,
                        ...buildStudentBody(s),
                    }, { transaction: t });
                    existingIdentidades.add(identidad);
                    studentsCreated++;
                } catch (err) {
                    errors.push(`Estudiante "${s.identidad}": ${err.message}`);
                }
            }

            // 6. Commit
            await t.commit();

            await user_logs.create({ user_id: req.user_id, log: `Creó centro ID: ${centroId} con ${coursesCreated} curso(s), ${instructorsCreated} instructor(es), ${studentsCreated} estudiante(s) por wizard` });
            res.status(201).json({ ok: true, centroId, coursesCreated, instructorsCreated, studentsCreated, errors: errors.length > 0 ? errors : undefined });
        } catch (e) {
            await t.rollback();
            next(e);
        }
    }
);

// ─── Excel Templates (for wizard, no IDs) ───────────────────────────────────

router.get("/centros/excel/template/:entity", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { entity } = req.params;
            const catalogs = await loadCatalogosBase();
            let wb, filename;

            if (entity === "courses") {
                wb = generateCoursesExcel([], catalogs, []);
                filename = "plantilla-cursos.xlsx";
            } else if (entity === "instructors") {
                wb = generateInstructorsExcel([], catalogs, []);
                filename = "plantilla-instructores.xlsx";
            } else if (entity === "students") {
                wb = generateStudentsExcel([], catalogs, []);
                filename = "plantilla-estudiantes.xlsx";
            } else {
                return res.status(400).json({ message: "Entidad no válida. Use: courses, instructors, students" });
            }

            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
            return wb.write(filename, res);
        } catch (e) {
            next(e);
        }
    }
);

// ─── Centro Summary (mini-dashboard) ─────────────────────────────────────────

router.get("/centros/:id/summary", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.id);
            const [instructores, estudiantes, cursos] = await Promise.all([
                sgc_instructors.count({ where: { centro_id: centroId, estatus: 1 } }),
                sgc_estudiantes.count({ where: { centro_id: centroId, estatus: 1 } }),
                sgc_cursos.count({ where: { centro_id: centroId, estatus: 1 } }),
            ]);
            res.status(200).json({ instructores, estudiantes, cursos });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Nivel de escolaridades (catalogo) ───────────────────────────────────────

router.get("/nivel-escolaridades", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const rows = await sgc_nivel_escolaridads.findAll({
                where: { estatus: 1 },
                attributes: ["id", "nombre"],
                order: [["nombre", "ASC"]],
            });
            res.status(200).json({ data: rows });
        } catch (e) {
            next(e);
        }
    }
);

router.get("/vive-catalogo", verify_token, is_authenticated,
    (req, res) => {
        const options = ["Padres", "Solo(a)", "Pareja", "Familiares", "Otros"];
        res.status(200).json({ data: options.map((o) => ({ value: o, label: o })) });
    }
);

router.get("/dias-catalogo", verify_token, is_authenticated,
    (req, res) => {
        const dias = [
            { value: "1", label: "Domingo" },
            { value: "2", label: "Lunes" },
            { value: "3", label: "Martes" },
            { value: "4", label: "Miércoles" },
            { value: "5", label: "Jueves" },
            { value: "6", label: "Viernes" },
            { value: "7", label: "Sábado" },
        ];
        res.status(200).json({ data: dias });
    }
);

// ─── Instructores CRUD (por centro) ─────────────────────────────────────────

router.get("/centros/:centroId/instructors", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const { limit, offset, sort, desc, search } = req.query;
            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const where = {
                centro_id: centroId,
                estatus: 1,
                ...(search
                    ? {
                        [Op.or]: [
                            { nombres: { [Op.iLike]: `%${search}%` } },
                            { apellidos: { [Op.iLike]: `%${search}%` } },
                            { titulo_obtenido: { [Op.iLike]: `%${search}%` } },
                        ],
                    }
                    : {}),
            };

            const result = await sgc_instructors.findAndCountAll({
                attributes: ["id", "centro_id", "nombres", "apellidos", "titulo_obtenido", "otros_titulos", "pdf"],
                where,
                order: sort ? [[sort, desc === "desc" ? "DESC" : "ASC"]] : [["nombres", "ASC"]],
                limit: Number(limit),
                offset: Number(offset ?? 0),
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/centros/:centroId/instructors", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const { nombres, apellidos, titulo_obtenido, otros_titulos } = req.body;

            if (!nombres || !apellidos) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const instructor = await sgc_instructors.create({
                centro_id: centroId, nombres: nombres.trim(), apellidos: apellidos.trim(),
                titulo_obtenido: titulo_obtenido?.trim() || null, otros_titulos: otros_titulos?.trim() || null,
                estatus: 1,
            });

            await user_logs.create({ user_id: req.user_id, log: `Creó instructor ID: ${instructor.id}, CENTRO: ${centroId}` });
            res.status(201).json({ ok: true, id: instructor.id });
        } catch (e) {
            next(e);
        }
    }
);

router.put("/centros/:centroId/instructors", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const { id, nombres, apellidos, titulo_obtenido, otros_titulos } = req.body;

            if (!id || !nombres || !apellidos) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const instructor = await sgc_instructors.findOne({ where: { id, centro_id: centroId } });
            if (!instructor) return res.status(404).json({ message: "Instructor no encontrado" });

            await sgc_instructors.update({
                nombres: nombres.trim(), apellidos: apellidos.trim(),
                titulo_obtenido: titulo_obtenido?.trim() || null, otros_titulos: otros_titulos?.trim() || null,
            }, { where: { id, centro_id: centroId } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó instructor ID: ${id}, CENTRO: ${centroId}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/centros/:centroId/instructors/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { centroId, id } = req.params;
            const instructor = await sgc_instructors.findOne({ where: { id, centro_id: centroId } });
            if (!instructor) return res.status(404).json({ message: "Instructor no encontrado" });

            await sgc_instructors.update({ estatus: 0 }, { where: { id, centro_id: centroId } });
            await user_logs.create({ user_id: req.user_id, log: `Eliminó instructor ID: ${id}, CENTRO: ${centroId}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Instructores CRUD (global) ─────────────────────────────────────────────

router.get("/instructors", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { limit, offset, sort, desc, search, centro_id } = req.query;
            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const where = {
                estatus: 1,
                ...(centro_id ? { centro_id: Number(centro_id) } : {}),
                ...(search
                    ? {
                        [Op.or]: [
                            { nombres: { [Op.iLike]: `%${search}%` } },
                            { apellidos: { [Op.iLike]: `%${search}%` } },
                            { titulo_obtenido: { [Op.iLike]: `%${search}%` } },
                        ],
                    }
                    : {}),
            };

            const result = await sgc_instructors.findAndCountAll({
                attributes: [
                    "id", "centro_id", "nombres", "apellidos", "titulo_obtenido", "otros_titulos", "pdf",
                    [sequelize.literal(`(SELECT c.nombre FROM centros.centros c WHERE c.id = "instructors".centro_id)`), "centro_nombre"],
                ],
                where,
                order: sort ? [[sort, desc === "desc" ? "DESC" : "ASC"]] : [["nombres", "ASC"]],
                limit: Number(limit),
                offset: Number(offset ?? 0),
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

router.get("/instructors/:id", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const instructor = await sgc_instructors.findOne({
                where: { id: Number(id), estatus: 1 },
                attributes: [
                    "id", "centro_id", "nombres", "apellidos", "titulo_obtenido", "otros_titulos", "pdf",
                    [sequelize.literal(`(SELECT c.nombre FROM centros.centros c WHERE c.id = "instructors".centro_id)`), "centro_nombre"],
                    [sequelize.literal(`(SELECT COUNT(*) FROM centros.procesos p WHERE p.instructor_id = "instructors".id AND p.estatus = 1)::int`), "process_count"],
                ],
            });
            if (!instructor) return res.status(404).json({ message: "Instructor no encontrado" });
            res.status(200).json({ data: instructor });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/instructors", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { centro_id, nombres, apellidos, titulo_obtenido, otros_titulos } = req.body;

            if (!centro_id || !nombres || !apellidos) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const centro = await sgc_centros.findOne({ where: { id: centro_id } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            const instructor = await sgc_instructors.create({
                centro_id, nombres: nombres.trim(), apellidos: apellidos.trim(),
                titulo_obtenido: titulo_obtenido?.trim() || null, otros_titulos: otros_titulos?.trim() || null,
                estatus: 1,
            });

            await user_logs.create({ user_id: req.user_id, log: `Creó instructor ID: ${instructor.id}, CENTRO: ${centro_id}` });
            res.status(201).json({ ok: true, id: instructor.id });
        } catch (e) {
            next(e);
        }
    }
);

router.put("/instructors", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id, nombres, apellidos, titulo_obtenido, otros_titulos } = req.body;

            if (!id || !nombres || !apellidos) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const instructor = await sgc_instructors.findOne({ where: { id, estatus: 1 } });
            if (!instructor) return res.status(404).json({ message: "Instructor no encontrado" });

            await sgc_instructors.update({
                nombres: nombres.trim(), apellidos: apellidos.trim(),
                titulo_obtenido: titulo_obtenido?.trim() || null, otros_titulos: otros_titulos?.trim() || null,
            }, { where: { id } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó instructor ID: ${id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/instructors/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const instructor = await sgc_instructors.findOne({ where: { id, estatus: 1 } });
            if (!instructor) return res.status(404).json({ message: "Instructor no encontrado" });

            await sgc_instructors.update({ estatus: 0 }, { where: { id } });
            await user_logs.create({ user_id: req.user_id, log: `Eliminó instructor ID: ${id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Instructor PDF (hoja de vida) ──────────────────────────────────────────

router.post("/instructors/:id/pdf", verify_token, is_supervisor,
    (req, res, next) => {
        instructorFileUpload.single("file")(req, res, (err) => {
            if (err) {
                if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "Archivo excede 10MB" });
                return res.status(400).json({ message: err.message || "Error al subir archivo" });
            }
            next();
        });
    },
    async (req, res, next) => {
        try {
            const { id } = req.params;
            if (!req.file) return res.status(400).json({ message: "No se envió un archivo" });

            const instructor = await sgc_instructors.findOne({ where: { id, estatus: 1 } });
            if (!instructor) return res.status(404).json({ message: "Instructor no encontrado" });

            if (instructor.pdf) {
                const oldPath = path.join(__dirname, "../../files", instructor.pdf);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            const relativePath = buildInstructorFilePath(id, req.file.originalname);
            const fullPath = path.join(__dirname, "../../files", relativePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, req.file.buffer);

            await sgc_instructors.update({ pdf: relativePath }, { where: { id } });

            await user_logs.create({ user_id: req.user_id, log: `Subió hoja de vida para instructor ID: ${id}` });
            res.status(200).json({ ok: true, pdf: relativePath });
        } catch (e) {
            next(e);
        }
    }
);

router.get("/instructors/:id/pdf", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const instructor = await sgc_instructors.findOne({ where: { id, estatus: 1 }, attributes: ["pdf"] });
            if (!instructor || !instructor.pdf) return res.status(404).json({ message: "Archivo no encontrado" });

            const fullPath = path.join(__dirname, "../../files", instructor.pdf);
            if (!fs.existsSync(fullPath)) return res.status(404).json({ message: "Archivo no encontrado en el servidor" });

            res.sendFile(path.resolve(fullPath));
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/instructors/:id/pdf", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const instructor = await sgc_instructors.findOne({ where: { id, estatus: 1 }, attributes: ["id", "pdf"] });
            if (!instructor) return res.status(404).json({ message: "Instructor no encontrado" });
            if (!instructor.pdf) return res.status(404).json({ message: "El instructor no tiene hoja de vida" });

            const fullPath = path.join(__dirname, "../../files", instructor.pdf);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

            await sgc_instructors.update({ pdf: null }, { where: { id } });
            await user_logs.create({ user_id: req.user_id, log: `Eliminó hoja de vida del instructor ID: ${id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Estudiantes CRUD (por centro) ──────────────────────────────────────────

router.get("/centros/:centroId/estudiantes", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const { limit, offset, sort, desc, search } = req.query;
            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const where = {
                centro_id: centroId,
                estatus: 1,
                ...(search
                    ? {
                        [Op.or]: [
                            { identidad: { [Op.iLike]: `%${search}%` } },
                            { nombres: { [Op.iLike]: `%${search}%` } },
                            { apellidos: { [Op.iLike]: `%${search}%` } },
                        ],
                    }
                    : {}),
            };

            const result = await sgc_estudiantes.findAndCountAll({
                attributes: [
                    "id", "centro_id", "identidad", "nombres", "apellidos", "email", "telefono", "celular", "sexo", "pdf", "fecha_nacimiento",
                ],
                where,
                order: sort ? [[sort, desc === "desc" ? "DESC" : "ASC"]] : [["nombres", "ASC"]],
                limit: Number(limit),
                offset: Number(offset ?? 0),
                raw: true,
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/centros/:centroId/estudiantes", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const b = req.body;

            if (!b.identidad || !b.nombres || !b.apellidos || !b.departamento_id || !b.municipio_id || !b.sexo || !b.vive || !b.numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const existingByIdentidad = await sgc_estudiantes.findOne({ where: { identidad: b.identidad.trim(), estatus: 1 } });
            if (existingByIdentidad) return res.status(409).json({ message: "Ya existe un estudiante con esta identidad" });

            const estudiante = await sgc_estudiantes.create({
                centro_id: centroId, identidad: b.identidad.trim(), nombres: b.nombres.trim(), apellidos: b.apellidos.trim(),
                departamento_id: b.departamento_id, municipio_id: b.municipio_id,
                email: b.email?.trim() || null, telefono: b.telefono?.trim() || null, celular: b.celular?.trim() || null,
                sexo: b.sexo, estado_civil: b.estado_civil, fecha_nacimiento: b.fecha_nacimiento || null,
                vive: b.vive, numero_dep: b.numero_dep, direccion: b.direccion?.trim() || null,
                facebook: b.facebook?.trim() || null, twitter: b.twitter?.trim() || null, instagram: b.instagram?.trim() || null,
                estudia: b.estudia ?? 0, nivel_escolaridad_id: b.nivel_escolaridad_id || null,
                tiene_hijos: b.tiene_hijos ?? 0, cuantos_hijos: b.cuantos_hijos ?? 0,
                vivienda: b.vivienda?.trim() || null, cantidad_viven: b.cantidad_viven ?? 0,
                cantidad_trabajan_viven: b.cantidad_trabajan_viven ?? 0, cantidad_notrabajan_viven: b.cantidad_notrabajan_viven ?? 0,
                ingreso_promedio: b.ingreso_promedio ?? 0,
                trabajo_actual: b.trabajo_actual ?? 0, donde_trabaja: b.donde_trabaja?.trim() || null, puesto: b.puesto?.trim() || null,
                trabajado_ant: b.trabajado_ant ?? 0, tiempo_ant: b.tiempo_ant?.trim() || null,
                tipo_contrato_ant: b.tipo_contrato_ant ?? null, beneficios_empleo: b.beneficios_empleo?.trim() || null,
                beneficios_empleo_otro: b.beneficios_empleo_otro?.trim() || null,
                autoempleo: b.autoempleo ?? 0, autoempleo_dedicacion: b.autoempleo_dedicacion?.trim() || null,
                autoempleo_otro: b.autoempleo_otro?.trim() || null, autoempleo_tiempo: b.autoempleo_tiempo?.trim() || null,
                dias_semana_trabajo: b.dias_semana_trabajo?.trim() || null, horas_dia_trabajo: b.horas_dia_trabajo?.trim() || null,
                socios: b.socios ?? 0, socios_cantidad: b.socios_cantidad ?? 0,
                especial: b.especial ?? 0, discapacidad_id: b.discapacidad_id || null,
                riesgo_social: b.riesgo_social ?? 0, etnia_id: b.etnia_id || null, interno: b.interno ?? 0,
                nombre_r: b.nombre_r?.trim() || null, telefono_r: b.telefono_r?.trim() || null,
                datos_r: b.datos_r?.trim() || null, parentesco_r: b.parentesco_r?.trim() || null,
                adicional_r: b.adicional_r?.trim() || null,
                estatus: 1,
            });

            await user_logs.create({ user_id: req.user_id, log: `Creó estudiante ID: ${estudiante.id}, CENTRO: ${centroId}` });
            res.status(201).json({ ok: true, id: estudiante.id });
        } catch (e) {
            if (e.name === "SequelizeUniqueConstraintError") {
                return res.status(409).json({ message: "Ya existe un estudiante con esta identidad" });
            }
            next(e);
        }
    }
);

router.put("/centros/:centroId/estudiantes", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const b = req.body;

            if (!b.id || !b.identidad || !b.nombres || !b.apellidos || !b.departamento_id || !b.municipio_id || !b.sexo || !b.vive || !b.numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const estudiante = await sgc_estudiantes.findOne({ where: { id: b.id, centro_id: centroId } });
            if (!estudiante) return res.status(404).json({ message: "Estudiante no encontrado" });

            const existingByIdentidad = await sgc_estudiantes.findOne({ where: { identidad: b.identidad.trim(), estatus: 1, id: { [Op.ne]: b.id } } });
            if (existingByIdentidad) return res.status(409).json({ message: "Ya existe un estudiante con esta identidad" });

            await sgc_estudiantes.update({
                identidad: b.identidad.trim(), nombres: b.nombres.trim(), apellidos: b.apellidos.trim(),
                departamento_id: b.departamento_id, municipio_id: b.municipio_id,
                email: b.email?.trim() || null, telefono: b.telefono?.trim() || null, celular: b.celular?.trim() || null,
                sexo: b.sexo, estado_civil: b.estado_civil, fecha_nacimiento: b.fecha_nacimiento || null,
                vive: b.vive, numero_dep: b.numero_dep, direccion: b.direccion?.trim() || null,
                facebook: b.facebook?.trim() || null, twitter: b.twitter?.trim() || null, instagram: b.instagram?.trim() || null,
                estudia: b.estudia ?? 0, nivel_escolaridad_id: b.nivel_escolaridad_id || null,
                tiene_hijos: b.tiene_hijos ?? 0, cuantos_hijos: b.cuantos_hijos ?? 0,
                vivienda: b.vivienda?.trim() || null, cantidad_viven: b.cantidad_viven ?? 0,
                cantidad_trabajan_viven: b.cantidad_trabajan_viven ?? 0, cantidad_notrabajan_viven: b.cantidad_notrabajan_viven ?? 0,
                ingreso_promedio: b.ingreso_promedio ?? 0,
                trabajo_actual: b.trabajo_actual ?? 0, donde_trabaja: b.donde_trabaja?.trim() || null, puesto: b.puesto?.trim() || null,
                trabajado_ant: b.trabajado_ant ?? 0, tiempo_ant: b.tiempo_ant?.trim() || null,
                tipo_contrato_ant: b.tipo_contrato_ant ?? null, beneficios_empleo: b.beneficios_empleo?.trim() || null,
                beneficios_empleo_otro: b.beneficios_empleo_otro?.trim() || null,
                autoempleo: b.autoempleo ?? 0, autoempleo_dedicacion: b.autoempleo_dedicacion?.trim() || null,
                autoempleo_otro: b.autoempleo_otro?.trim() || null, autoempleo_tiempo: b.autoempleo_tiempo?.trim() || null,
                dias_semana_trabajo: b.dias_semana_trabajo?.trim() || null, horas_dia_trabajo: b.horas_dia_trabajo?.trim() || null,
                socios: b.socios ?? 0, socios_cantidad: b.socios_cantidad ?? 0,
                especial: b.especial ?? 0, discapacidad_id: b.discapacidad_id || null,
                riesgo_social: b.riesgo_social ?? 0, etnia_id: b.etnia_id || null, interno: b.interno ?? 0,
                nombre_r: b.nombre_r?.trim() || null, telefono_r: b.telefono_r?.trim() || null,
                datos_r: b.datos_r?.trim() || null, parentesco_r: b.parentesco_r?.trim() || null,
                adicional_r: b.adicional_r?.trim() || null,
            }, { where: { id: b.id, centro_id: centroId } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó estudiante ID: ${b.id}, CENTRO: ${centroId}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            if (e.name === "SequelizeUniqueConstraintError") {
                return res.status(409).json({ message: "Ya existe un estudiante con esta identidad" });
            }
            next(e);
        }
    }
);

router.delete("/centros/:centroId/estudiantes/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { centroId, id } = req.params;
            const estudiante = await sgc_estudiantes.findOne({ where: { id, centro_id: centroId } });
            if (!estudiante) return res.status(404).json({ message: "Estudiante no encontrado" });

            await sgc_estudiantes.update({ estatus: 0 }, { where: { id, centro_id: centroId } });
            await user_logs.create({ user_id: req.user_id, log: `Eliminó estudiante ID: ${id}, CENTRO: ${centroId}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Cursos CRUD ─────────────────────────────────────────────────────────────

router.get("/centros/:centroId/cursos", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const { limit, offset, sort, desc, search } = req.query;
            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const where = {
                centro_id: centroId,
                estatus: 1,
                ...(search
                    ? {
                        [Op.or]: [
                            { nombre: { [Op.iLike]: `%${search}%` } },
                            sequelize.where(sequelize.cast(sequelize.col('codigo'), 'TEXT'), { [Op.iLike]: `%${search}%` }),
                            { codigo_programa: { [Op.iLike]: `%${search}%` } },
                        ],
                    }
                    : {}),
            };

            const result = await sgc_cursos.findAndCountAll({
                attributes: [
                    "id", "codigo", "nombre", "codigo_programa", "total_horas", "taller", "objetivo", "estatus", "created_at",
                    "departamento_id", "municipio_id", "comunidad",
                ],
                where,
                order: sort ? [[sort, desc === "desc" ? "DESC" : "ASC"]] : [["nombre", "ASC"]],
                limit: Number(limit),
                offset: Number(offset ?? 0),
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/centros/:centroId/cursos", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const { codigo, nombre, codigo_programa, total_horas, taller, objetivo, departamento_id, municipio_id } = req.body;

            if (!nombre || !codigo_programa || !objetivo) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const curso = await sgc_cursos.create({
                centro_id: centroId, codigo: codigo ? Number(codigo) : null, nombre: nombre.trim(), codigo_programa: codigo_programa.trim(),
                total_horas: total_horas?.toString().trim() || '0', taller: taller ?? 1, objetivo: objetivo.trim(),
                departamento_id: departamento_id || null, municipio_id: municipio_id || null, estatus: 1,
            });

            await user_logs.create({ user_id: req.user_id, log: `Creó curso ID: ${curso.id}, CENTRO: ${centroId}` });
            res.status(201).json({ ok: true, id: curso.id });
        } catch (e) {
            next(e);
        }
    }
);

router.put("/centros/:centroId/cursos", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const { id, codigo, nombre, codigo_programa, total_horas, taller, objetivo, departamento_id, municipio_id } = req.body;

            if (!id || !nombre || !codigo_programa || !objetivo) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const curso = await sgc_cursos.findOne({ where: { id, centro_id: centroId } });
            if (!curso) return res.status(404).json({ message: "Curso no encontrado" });

            await sgc_cursos.update({
                codigo: codigo ? Number(codigo) : null, nombre: nombre.trim(), codigo_programa: codigo_programa.trim(),
                total_horas: total_horas?.toString().trim() || '0', taller: taller ?? 1, objetivo: objetivo.trim(),
                departamento_id: departamento_id || null, municipio_id: municipio_id || null,
            }, { where: { id, centro_id: centroId } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó curso ID: ${id}, CENTRO: ${centroId}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/centros/:centroId/cursos/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { centroId, id } = req.params;
            const curso = await sgc_cursos.findOne({ where: { id, centro_id: centroId } });
            if (!curso) return res.status(404).json({ message: "Curso no encontrado" });

            await sgc_cursos.update({ estatus: 0 }, { where: { id, centro_id: centroId } });
            await user_logs.create({ user_id: req.user_id, log: `Eliminó curso ID: ${id}, CENTRO: ${centroId}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Students CRUD (global) ─────────────────────────────────────────────────

const STUDENT_ALL_FIELDS = [
    "id", "centro_id", "identidad", "nombres", "apellidos", "departamento_id", "municipio_id",
    "direccion", "fecha_nacimiento", "estado_civil", "sexo", "email", "facebook", "telefono", "celular",
    "estudia", "nivel_escolaridad_id", "pdf", "vive", "numero_dep", "trabajo_actual", "donde_trabaja",
    "puesto", "especial", "discapacidad_id", "riesgo_social", "etnia_id", "interno",
    "nombre_r", "telefono_r", "datos_r", "parentesco_r", "adicional_r",
    "twitter", "instagram", "tiene_hijos", "cuantos_hijos", "vivienda",
    "cantidad_viven", "cantidad_trabajan_viven", "cantidad_notrabajan_viven", "ingreso_promedio",
    "trabajado_ant", "tiempo_ant", "tipo_contrato_ant", "beneficios_empleo", "beneficios_empleo_otro",
    "autoempleo", "autoempleo_dedicacion", "autoempleo_otro", "autoempleo_tiempo",
    "dias_semana_trabajo", "horas_dia_trabajo", "socios", "socios_cantidad",
];

function buildStudentBody(b) {
    return {
        identidad: b.identidad?.trim(), nombres: b.nombres?.trim(), apellidos: b.apellidos?.trim(),
        departamento_id: b.departamento_id, municipio_id: b.municipio_id,
        email: b.email?.trim() || null, telefono: b.telefono?.trim() || null, celular: b.celular?.trim() || null,
        sexo: b.sexo, estado_civil: b.estado_civil, fecha_nacimiento: b.fecha_nacimiento || null,
        vive: b.vive, numero_dep: b.numero_dep, direccion: b.direccion?.trim() || null,
        facebook: b.facebook?.trim() || null, twitter: b.twitter?.trim() || null, instagram: b.instagram?.trim() || null,
        estudia: b.estudia ?? 0, nivel_escolaridad_id: b.nivel_escolaridad_id || null,
        tiene_hijos: b.tiene_hijos ?? 0, cuantos_hijos: b.cuantos_hijos ?? 0,
        vivienda: b.vivienda?.trim() || null, cantidad_viven: b.cantidad_viven ?? 0,
        cantidad_trabajan_viven: b.cantidad_trabajan_viven ?? 0, cantidad_notrabajan_viven: b.cantidad_notrabajan_viven ?? 0,
        ingreso_promedio: b.ingreso_promedio ?? 0,
        trabajo_actual: b.trabajo_actual ?? 0, donde_trabaja: b.donde_trabaja?.trim() || null, puesto: b.puesto?.trim() || null,
        trabajado_ant: b.trabajado_ant ?? 0, tiempo_ant: b.tiempo_ant?.trim() || null,
        tipo_contrato_ant: b.tipo_contrato_ant ?? null, beneficios_empleo: b.beneficios_empleo?.trim() || null,
        beneficios_empleo_otro: b.beneficios_empleo_otro?.trim() || null,
        autoempleo: b.autoempleo ?? 0, autoempleo_dedicacion: b.autoempleo_dedicacion?.trim() || null,
        autoempleo_otro: b.autoempleo_otro?.trim() || null, autoempleo_tiempo: b.autoempleo_tiempo?.trim() || null,
        dias_semana_trabajo: b.dias_semana_trabajo?.trim() || null, horas_dia_trabajo: b.horas_dia_trabajo?.trim() || null,
        socios: b.socios ?? 0, socios_cantidad: b.socios_cantidad ?? 0,
        especial: b.especial ?? 0, discapacidad_id: b.discapacidad_id || null,
        riesgo_social: b.riesgo_social ?? 0, etnia_id: b.etnia_id || null, interno: b.interno ?? 0,
        nombre_r: b.nombre_r?.trim() || null, telefono_r: b.telefono_r?.trim() || null,
        datos_r: b.datos_r?.trim() || null, parentesco_r: b.parentesco_r?.trim() || null,
        adicional_r: b.adicional_r?.trim() || null,
    };
}

router.get("/students", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { limit, offset, sort, desc, search, centro_id } = req.query;
            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const where = {
                estatus: 1,
                ...(centro_id ? { centro_id: Number(centro_id) } : {}),
                ...(search
                    ? {
                        [Op.or]: [
                            { identidad: { [Op.iLike]: `%${search}%` } },
                            { nombres: { [Op.iLike]: `%${search}%` } },
                            { apellidos: { [Op.iLike]: `%${search}%` } },
                        ],
                    }
                    : {}),
            };

            const result = await sgc_estudiantes.findAndCountAll({
                attributes: [
                    "id", "centro_id", "identidad", "nombres", "apellidos", "sexo", "celular", "email", "pdf", "fecha_nacimiento",
                    [sequelize.literal(`(SELECT c.nombre FROM centros.centros c WHERE c.id = "estudiantes".centro_id)`), "centro_nombre"],
                ],
                where,
                order: sort ? [[sort, desc === "desc" ? "DESC" : "ASC"]] : [["nombres", "ASC"]],
                limit: Number(limit),
                offset: Number(offset ?? 0),
                raw: true,
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

router.get("/students/:id", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const student = await sgc_estudiantes.findOne({
                where: { id, estatus: 1 },
                attributes: [
                    ...STUDENT_ALL_FIELDS,
                    [sequelize.literal(`(SELECT c.nombre FROM centros.centros c WHERE c.id = "estudiantes".centro_id)`), "centro_nombre"],
                    [sequelize.literal(`(SELECT d.nombre FROM centros.departamentos d WHERE d.id = "estudiantes".departamento_id)`), "departamento_nombre"],
                    [sequelize.literal(`(SELECT m.nombre FROM centros.municipios m WHERE m.id = "estudiantes".municipio_id)`), "municipio_nombre"],
                    [sequelize.literal(`(SELECT n.nombre FROM centros.nivel_escolaridads n WHERE n.id::text = "estudiantes".nivel_escolaridad_id)`), "nivel_escolaridad_nombre"],
                ],
            });
            if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });
            res.status(200).json({ data: student });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/students", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const b = req.body;
            if (!b.centro_id || !b.identidad || !b.nombres || !b.apellidos || !b.departamento_id || !b.municipio_id || !b.sexo || !b.vive || !b.numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const centro = await sgc_centros.findOne({ where: { id: b.centro_id } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            const existingByIdentidad = await sgc_estudiantes.findOne({ where: { identidad: b.identidad.trim(), estatus: 1 } });
            if (existingByIdentidad) return res.status(409).json({ message: "Ya existe un estudiante con esta identidad" });

            const student = await sgc_estudiantes.create({
                centro_id: b.centro_id, estatus: 1, ...buildStudentBody(b),
            });

            await user_logs.create({ user_id: req.user_id, log: `Creó estudiante ID: ${student.id}, CENTRO: ${b.centro_id}` });
            res.status(201).json({ ok: true, id: student.id });
        } catch (e) {
            if (e.name === "SequelizeUniqueConstraintError") {
                return res.status(409).json({ message: "Ya existe un estudiante con esta identidad" });
            }
            next(e);
        }
    }
);

router.put("/students", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const b = req.body;
            if (!b.id || !b.identidad || !b.nombres || !b.apellidos || !b.departamento_id || !b.municipio_id || !b.sexo || !b.vive || !b.numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const student = await sgc_estudiantes.findOne({ where: { id: b.id, estatus: 1 } });
            if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

            const existingByIdentidad = await sgc_estudiantes.findOne({ where: { identidad: b.identidad.trim(), estatus: 1, id: { [Op.ne]: b.id } } });
            if (existingByIdentidad) return res.status(409).json({ message: "Ya existe un estudiante con esta identidad" });

            await sgc_estudiantes.update(buildStudentBody(b), { where: { id: b.id } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó estudiante ID: ${b.id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            if (e.name === "SequelizeUniqueConstraintError") {
                return res.status(409).json({ message: "Ya existe un estudiante con esta identidad" });
            }
            next(e);
        }
    }
);

router.delete("/students/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const student = await sgc_estudiantes.findOne({ where: { id, estatus: 1 } });
            if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

            await sgc_estudiantes.update({ estatus: 0 }, { where: { id } });
            await user_logs.create({ user_id: req.user_id, log: `Eliminó estudiante ID: ${id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Student PDF (hoja de vida) ─────────────────────────────────────────────

router.post("/students/:id/pdf", verify_token, is_supervisor,
    (req, res, next) => {
        studentFileUpload.single("file")(req, res, (err) => {
            if (err) {
                if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "Archivo excede 10MB" });
                return res.status(400).json({ message: err.message || "Error al subir archivo" });
            }
            next();
        });
    },
    async (req, res, next) => {
        try {
            const { id } = req.params;
            if (!req.file) return res.status(400).json({ message: "No se envió un archivo" });

            const student = await sgc_estudiantes.findOne({ where: { id, estatus: 1 } });
            if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

            if (student.pdf) {
                const oldPath = path.join(__dirname, "../../files", student.pdf);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            const relativePath = buildStudentFilePath(id, req.file.originalname);
            const fullPath = path.join(__dirname, "../../files", relativePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, req.file.buffer);

            await sgc_estudiantes.update({ pdf: relativePath }, { where: { id } });

            await user_logs.create({ user_id: req.user_id, log: `Subió hoja de vida para estudiante ID: ${id}` });
            res.status(200).json({ ok: true, pdf: relativePath });
        } catch (e) {
            next(e);
        }
    }
);

router.get("/students/:id/pdf", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const student = await sgc_estudiantes.findOne({ where: { id, estatus: 1 }, attributes: ["pdf"] });
            if (!student || !student.pdf) return res.status(404).json({ message: "Archivo no encontrado" });

            const fullPath = path.join(__dirname, "../../files", student.pdf);
            if (!fs.existsSync(fullPath)) return res.status(404).json({ message: "Archivo no encontrado en el servidor" });

            res.sendFile(path.resolve(fullPath));
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/students/:id/pdf", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const student = await sgc_estudiantes.findOne({ where: { id, estatus: 1 }, attributes: ["id", "pdf"] });
            if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });
            if (!student.pdf) return res.status(404).json({ message: "El estudiante no tiene hoja de vida" });

            const fullPath = path.join(__dirname, "../../files", student.pdf);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

            await sgc_estudiantes.update({ pdf: null }, { where: { id } });
            await user_logs.create({ user_id: req.user_id, log: `Eliminó hoja de vida del estudiante ID: ${id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Student enrollments (cross-process) ────────────────────────────────────

router.post("/students/batch-enrollment-check", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { student_ids, exclude_process_id } = req.body;
            if (!Array.isArray(student_ids) || student_ids.length === 0) {
                return res.status(400).json({ message: "student_ids requerido" });
            }

            const rows = await sequelize.query(`
                SELECT pm.estudiante_id, COUNT(*)::int AS count
                FROM centros.proceso_matriculas pm
                JOIN centros.procesos p ON p.id = pm.proceso_id
                WHERE pm.estudiante_id IN (:ids) AND pm.estatus = 1
                AND p.estatus = 1 AND p.fecha_final >= CURRENT_DATE
                ${exclude_process_id ? "AND pm.proceso_id != :excludeId" : ""}
                GROUP BY pm.estudiante_id
                HAVING COUNT(*) > 0
            `, {
                replacements: { ids: student_ids.map(Number), excludeId: exclude_process_id ? Number(exclude_process_id) : 0 },
                type: sequelize.QueryTypes.SELECT,
            });

            res.json({ data: rows });
        } catch (e) {
            next(e);
        }
    }
);

router.get("/students/:studentId/enrollments", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const studentId = Number(req.params.studentId);
            const all = req.query.all === "true";
            const rows = await sequelize.query(`
                SELECT pm.id, pm.proceso_id, p.nombre AS proceso_nombre, p.codigo AS proceso_codigo,
                       p.fecha_inicial, p.fecha_final, c.nombre AS centro_nombre,
                       cur.nombre AS curso_nombre,
                       (SELECT COUNT(*)::int FROM centros.proceso_matriculas pm2 WHERE pm2.proceso_id = p.id AND pm2.estatus = 1) AS enrolled_count
                FROM centros.proceso_matriculas pm
                JOIN centros.procesos p ON p.id = pm.proceso_id
                JOIN centros.centros c ON c.id = p.centro_id
                LEFT JOIN centros.cursos cur ON cur.id = p.curso_id
                WHERE pm.estudiante_id = :studentId AND pm.estatus = 1
                ${all ? "" : "AND p.estatus = 1 AND p.fecha_final >= CURRENT_DATE"}
                ORDER BY p.fecha_inicial DESC
            `, { replacements: { studentId }, type: sequelize.QueryTypes.SELECT });
            res.json({ data: rows });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Courses CRUD (global) ──────────────────────────────────────────────────

router.get("/courses", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { limit, offset, sort, desc, search, centro_id } = req.query;
            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const where = {
                estatus: 1,
                ...(centro_id ? { centro_id: Number(centro_id) } : {}),
                ...(search ? {
                    [Op.or]: [
                        { nombre: { [Op.iLike]: `%${search}%` } },
                        { codigo_programa: { [Op.iLike]: `%${search}%` } },
                        sequelize.where(sequelize.cast(sequelize.col('"cursos"."codigo"'), 'TEXT'), { [Op.iLike]: `%${search}%` }),
                    ],
                } : {}),
            };

            const result = await sgc_cursos.findAndCountAll({
                attributes: [
                    "id", "codigo", "centro_id", "nombre", "codigo_programa", "total_horas", "taller", "objetivo", "estatus",
                    [sequelize.literal(`(SELECT c.nombre FROM centros.centros c WHERE c.id = "cursos".centro_id)`), "centro_nombre"],
                ],
                where,
                order: sort ? [[sort, desc === "desc" ? "DESC" : "ASC"]] : [["nombre", "ASC"]],
                limit: Number(limit),
                offset: Number(offset ?? 0),
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

router.get("/courses/:id", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const course = await sgc_cursos.findOne({
                where: { id, estatus: 1 },
                attributes: [
                    "id", "codigo", "centro_id", "nombre", "codigo_programa", "total_horas", "taller", "objetivo",
                    "departamento_id", "municipio_id", "comunidad",
                    [sequelize.literal(`(SELECT c.nombre FROM centros.centros c WHERE c.id = "cursos".centro_id)`), "centro_nombre"],
                ],
            });
            if (!course) return res.status(404).json({ message: "Curso no encontrado" });
            res.status(200).json({ data: course });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/courses", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const b = req.body;
            if (!b.centro_id || !b.nombre || !b.codigo_programa || !b.objetivo) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const centro = await sgc_centros.findOne({ where: { id: b.centro_id } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            const course = await sgc_cursos.create({
                centro_id: Number(b.centro_id),
                codigo: b.codigo ? Number(b.codigo) : null,
                nombre: b.nombre.trim(),
                codigo_programa: b.codigo_programa.trim(),
                total_horas: (b.total_horas ?? "0").toString().trim(),
                taller: b.taller ?? 1,
                objetivo: b.objetivo.trim(),
                departamento_id: null,
                municipio_id: null,
                estatus: 1,
            });

            await user_logs.create({ user_id: req.user_id, log: `Creó curso ID: ${course.id}, CENTRO: ${b.centro_id}` });
            res.status(201).json({ ok: true, id: course.id });
        } catch (e) {
            next(e);
        }
    }
);

router.put("/courses", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const b = req.body;
            if (!b.id || !b.nombre || !b.codigo_programa || !b.objetivo) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const course = await sgc_cursos.findOne({ where: { id: b.id, estatus: 1 } });
            if (!course) return res.status(404).json({ message: "Curso no encontrado" });

            await sgc_cursos.update({
                codigo: b.codigo ? Number(b.codigo) : null,
                nombre: b.nombre.trim(),
                codigo_programa: b.codigo_programa.trim(),
                taller: b.taller ?? 1,
                objetivo: b.objetivo.trim(),
            }, { where: { id: b.id } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó curso ID: ${b.id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/courses/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const course = await sgc_cursos.findOne({ where: { id, estatus: 1 } });
            if (!course) return res.status(404).json({ message: "Curso no encontrado" });

            await sgc_cursos.update({ estatus: 0 }, { where: { id } });
            await user_logs.create({ user_id: req.user_id, log: `Eliminó curso ID: ${id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Course Modules CRUD ────────────────────────────────────────────────────

async function recalcCourseTotalHours(courseId) {
    const modules = await sgc_curso_modulos.findAll({ where: { curso_id: courseId } });
    const total = modules.reduce((sum, m) => sum + (parseFloat(m.horas_teoricas) || 0) + (parseFloat(m.horas_practicas) || 0), 0);
    await sgc_cursos.update({ total_horas: total.toString() }, { where: { id: courseId } });
}

router.get("/courses/:courseId/modules", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const courseId = Number(req.params.courseId);
            const modules = await sgc_curso_modulos.findAll({
                where: { curso_id: courseId },
                attributes: ["id", "curso_id", "codigo", "nombre", "horas_teoricas", "horas_practicas", "tipo_evaluacion", "observaciones"],
                order: [["codigo", "ASC"]],
            });
            res.status(200).json({ data: modules });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/courses/:courseId/modules", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const courseId = Number(req.params.courseId);
            const b = req.body;
            if (!b.codigo || !b.nombre || !b.horas_teoricas || !b.horas_practicas) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const course = await sgc_cursos.findOne({ where: { id: courseId, estatus: 1 } });
            if (!course) return res.status(404).json({ message: "Curso no encontrado" });

            const mod = await sgc_curso_modulos.create({
                curso_id: courseId,
                codigo: b.codigo.toString().trim(),
                nombre: b.nombre.trim(),
                horas_teoricas: b.horas_teoricas.toString().trim(),
                horas_practicas: b.horas_practicas.toString().trim(),
                tipo_evaluacion: b.tipo_evaluacion ?? 1,
                observaciones: b.observaciones?.trim() || null,
            });

            await recalcCourseTotalHours(courseId);
            await user_logs.create({ user_id: req.user_id, log: `Creó módulo ID: ${mod.id} en curso ID: ${courseId}` });
            res.status(201).json({ ok: true, id: mod.id });
        } catch (e) {
            next(e);
        }
    }
);

router.put("/courses/:courseId/modules", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const courseId = Number(req.params.courseId);
            const b = req.body;
            if (!b.id || !b.codigo || !b.nombre || !b.horas_teoricas || !b.horas_practicas) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const mod = await sgc_curso_modulos.findOne({ where: { id: b.id, curso_id: courseId } });
            if (!mod) return res.status(404).json({ message: "Módulo no encontrado" });

            await sgc_curso_modulos.update({
                codigo: b.codigo.toString().trim(),
                nombre: b.nombre.trim(),
                horas_teoricas: b.horas_teoricas.toString().trim(),
                horas_practicas: b.horas_practicas.toString().trim(),
                tipo_evaluacion: b.tipo_evaluacion ?? 1,
                observaciones: b.observaciones?.trim() || null,
            }, { where: { id: b.id, curso_id: courseId } });

            await recalcCourseTotalHours(courseId);
            await user_logs.create({ user_id: req.user_id, log: `Actualizó módulo ID: ${b.id} en curso ID: ${courseId}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/courses/:courseId/modules/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const courseId = Number(req.params.courseId);
            const { id } = req.params;

            const mod = await sgc_curso_modulos.findOne({ where: { id, curso_id: courseId } });
            if (!mod) return res.status(404).json({ message: "Módulo no encontrado" });

            await sgc_curso_modulos.destroy({ where: { id, curso_id: courseId } });
            await recalcCourseTotalHours(courseId);
            await user_logs.create({ user_id: req.user_id, log: `Eliminó módulo ID: ${id} del curso ID: ${courseId}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Wizard: Create course + modules in one call ─────────────────────────────

router.post("/courses/wizard", verify_token, is_supervisor,
    async (req, res, next) => {
        const t = await sequelize.transaction();
        try {
            const b = req.body;
            if (!b.centro_id || !b.nombre || !b.codigo_programa || !b.objetivo) {
                await t.rollback();
                return res.status(400).json({ message: "Faltan campos requeridos del curso" });
            }

            const centro = await sgc_centros.findOne({ where: { id: b.centro_id } });
            if (!centro) { await t.rollback(); return res.status(404).json({ message: "Centro no encontrado" }); }

            const course = await sgc_cursos.create({
                centro_id: Number(b.centro_id),
                codigo: b.codigo ? Number(b.codigo) : null,
                nombre: b.nombre.trim(),
                codigo_programa: b.codigo_programa.trim(),
                total_horas: "0",
                taller: b.taller ?? 1,
                objetivo: b.objetivo.trim(),
                departamento_id: null,
                municipio_id: null,
                estatus: 1,
            }, { transaction: t });

            let modulesCreated = 0;
            const moduleErrors = [];
            const modules = Array.isArray(b.modules) ? b.modules : [];

            for (const item of modules) {
                try {
                    if (!item.codigo || !item.nombre || !item.horas_teoricas || !item.horas_practicas) {
                        moduleErrors.push({ message: `Módulo "${item.nombre || "sin nombre"}" tiene campos requeridos vacíos` });
                        continue;
                    }
                    await sgc_curso_modulos.create({
                        curso_id: course.id,
                        codigo: item.codigo,
                        nombre: item.nombre,
                        horas_teoricas: item.horas_teoricas,
                        horas_practicas: item.horas_practicas,
                        tipo_evaluacion: item.tipo_evaluacion ?? 1,
                        observaciones: item.observaciones || null,
                    }, { transaction: t });
                    modulesCreated++;
                } catch (err) {
                    moduleErrors.push({ message: `Error en módulo "${item.nombre}": ${err.message}` });
                }
            }

            if (modulesCreated > 0) {
                const mods = await sgc_curso_modulos.findAll({ where: { curso_id: course.id }, transaction: t, raw: true });
                const total = mods.reduce((sum, m) => sum + (parseFloat(m.horas_teoricas) || 0) + (parseFloat(m.horas_practicas) || 0), 0);
                await sgc_cursos.update({ total_horas: String(total) }, { where: { id: course.id }, transaction: t });
            }

            await t.commit();

            await user_logs.create({ user_id: req.user_id, log: `Creó curso ID: ${course.id} con ${modulesCreated} módulo(s) por wizard, CENTRO: ${b.centro_id}` });
            res.status(201).json({ ok: true, id: course.id, modulesCreated, moduleErrors });
        } catch (e) {
            await t.rollback();
            next(e);
        }
    }
);

// ─── Excel: Plantilla vacía de módulos (para wizard) ─────────────────────────

router.get("/courses/excel/modules-template", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const wb = generateModulesExcel([]);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=plantilla-modulos.xlsx");
            return wb.write("plantilla-modulos.xlsx", res);
        } catch (e) {
            next(e);
        }
    }
);

// ─── Excel: Módulos de Curso ─────────────────────────────────────────────────

router.get("/courses/:courseId/excel/modules", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const courseId = Number(req.params.courseId);
            const course = await sgc_cursos.findOne({ where: { id: courseId, estatus: 1 } });
            if (!course) return res.status(404).json({ message: "Curso no encontrado" });

            const rows = await sgc_curso_modulos.findAll({ where: { curso_id: courseId }, order: [["codigo", "ASC"]], raw: true });
            const wb = generateModulesExcel(rows);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=plantilla-modulos.xlsx");
            return wb.write("plantilla-modulos.xlsx", res);
        } catch (e) {
            next(e);
        }
    }
);

router.post("/courses/:courseId/excel/modules", verify_token, is_supervisor, excelUpload.single("file"),
    async (req, res, next) => {
        try {
            const courseId = Number(req.params.courseId);
            const course = await sgc_cursos.findOne({ where: { id: courseId, estatus: 1 } });
            if (!course) return res.status(404).json({ message: "Curso no encontrado" });
            if (!req.file) return res.status(400).json({ message: "Archivo requerido" });

            const { parsed, errors } = parseModulesExcel(req.file.buffer);

            const existingRows = await sgc_curso_modulos.findAll({ where: { curso_id: courseId }, attributes: ["id"], raw: true });
            const existingIds = new Set(existingRows.map((r) => r.id));
            const excelIds = new Set(parsed.filter((r) => r.id).map((r) => r.id));

            let created = 0, updated = 0, deleted = 0;

            for (const existing of existingRows) {
                if (!excelIds.has(existing.id)) {
                    await sgc_curso_modulos.destroy({ where: { id: existing.id, curso_id: courseId } });
                    deleted++;
                }
            }

            for (const row of parsed) {
                try {
                    if (row.id && existingIds.has(row.id)) {
                        const { id, ...data } = row;
                        await sgc_curso_modulos.update(data, { where: { id, curso_id: courseId } });
                        updated++;
                    } else {
                        await sgc_curso_modulos.create({ ...row, id: undefined, curso_id: courseId, tipo_evaluacion: row.tipo_evaluacion ?? 1 });
                        created++;
                    }
                } catch (err) {
                    errors.push({ row: null, message: `Error en módulo "${row.nombre}": ${err.message}` });
                }
            }

            await recalcCourseTotalHours(courseId);
            await user_logs.create({
                user_id: req.user_id,
                log: `Importó módulos por Excel en curso ${courseId} (${created} creados, ${updated} actualizados, ${deleted} eliminados)`,
            });

            res.status(200).json({ ok: true, created, updated, deleted, errors, processed: created + updated });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Catalogs ───────────────────────────────────────────────────────────────

router.get("/metodologias", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const rows = await sgc_metodologias.findAll({
                where: { estatus: 1 },
                attributes: ["id", "nombre"],
                order: [["nombre", "ASC"]],
            });
            res.status(200).json({ data: rows });
        } catch (e) {
            next(e);
        }
    }
);

router.get("/tipo-jornadas", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const rows = await sgc_tipo_jornadas.findAll({
                where: { estatus: 1 },
                attributes: ["id", "nombre"],
                order: [["nombre", "ASC"]],
            });
            res.status(200).json({ data: rows });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Processes CRUD (global) ────────────────────────────────────────────────

router.get("/processes", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { limit, offset, sort, desc, search, centro_id, curso_id, instructor_id } = req.query;
            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const where = {
                estatus: 1,
                ...(centro_id ? { centro_id: Number(centro_id) } : {}),
                ...(curso_id ? { curso_id: Number(curso_id) } : {}),
                ...(instructor_id ? { instructor_id: Number(instructor_id) } : {}),
                ...(search ? {
                    [Op.or]: [
                        { nombre: { [Op.iLike]: `%${search}%` } },
                        { codigo: { [Op.iLike]: `%${search}%` } },
                    ],
                } : {}),
            };

            const result = await sgc_procesos.findAndCountAll({
                attributes: [
                    "id", "codigo", "centro_id", "nombre", "instructor_id", "curso_id",
                    "fecha_inicial", "fecha_final", "duracion_horas", "estatus",
                    [sequelize.literal(`(SELECT c.nombre FROM centros.centros c WHERE c.id = "procesos".centro_id)`), "centro_nombre"],
                    [sequelize.literal(`(SELECT cu.nombre FROM centros.cursos cu WHERE cu.id = "procesos".curso_id)`), "curso_nombre"],
                    [sequelize.literal(`(SELECT CONCAT(i.nombres, ' ', i.apellidos) FROM centros.instructors i WHERE i.id = "procesos".instructor_id)`), "instructor_nombre"],
                    [sequelize.literal(`(SELECT COUNT(*) FROM centros.proceso_matriculas pm WHERE pm.proceso_id = "procesos".id AND pm.estatus = 1)::int`), "enrolled_count"],
                ],
                where,
                order: sort ? [[sort, desc === "desc" ? "DESC" : "ASC"]] : [["nombre", "ASC"]],
                limit: Number(limit),
                offset: Number(offset ?? 0),
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

router.get("/processes/:id", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const process = await sgc_procesos.findOne({
                where: { id, estatus: 1 },
                attributes: [
                    "id", "codigo", "centro_id", "nombre", "instructor_id", "curso_id",
                    "metodologia_id", "otra_metodologia", "fecha_inicial", "fecha_final",
                    "duracion_horas", "tipo_jornada_id", "horario", "dias", "sede", "lugar",
                    [sequelize.literal(`(SELECT c.nombre FROM centros.centros c WHERE c.id = "procesos".centro_id)`), "centro_nombre"],
                    [sequelize.literal(`(SELECT cu.nombre FROM centros.cursos cu WHERE cu.id = "procesos".curso_id)`), "curso_nombre"],
                    [sequelize.literal(`(SELECT CONCAT(i.nombres, ' ', i.apellidos) FROM centros.instructors i WHERE i.id = "procesos".instructor_id)`), "instructor_nombre"],
                    [sequelize.literal(`(SELECT m.nombre FROM centros.metodologias m WHERE m.id = "procesos".metodologia_id)`), "metodologia_nombre"],
                    [sequelize.literal(`(SELECT tj.nombre FROM centros.tipo_jornadas tj WHERE tj.id = "procesos".tipo_jornada_id)`), "tipo_jornada_nombre"],
                    [sequelize.literal(`(SELECT COUNT(*) FROM centros.proceso_matriculas pm WHERE pm.proceso_id = "procesos".id AND pm.estatus = 1)::int`), "enrolled_count"],
                    [sequelize.literal(`(SELECT COUNT(*) FROM centros.curso_modulos cm WHERE cm.curso_id = "procesos".curso_id)::int`), "module_count"],
                    [sequelize.literal(`(SELECT COUNT(*) FROM caderh.projects_processes pp WHERE pp.process_id = "procesos".id)::int`), "project_count"],
                ],
            });
            if (!process) return res.status(404).json({ message: "Proceso no encontrado" });
            res.status(200).json({ data: process });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/processes", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const b = req.body;
            if (!b.centro_id || !b.codigo || !b.nombre || !b.instructor_id || !b.curso_id ||
                !b.metodologia_id || !b.fecha_inicial || !b.fecha_final || !b.duracion_horas ||
                !b.tipo_jornada_id || !b.horario || !b.dias) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const centro = await sgc_centros.findOne({ where: { id: b.centro_id } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            const process = await sgc_procesos.create({
                codigo: b.codigo.trim(),
                centro_id: Number(b.centro_id),
                nombre: b.nombre.trim(),
                instructor_id: Number(b.instructor_id),
                curso_id: Number(b.curso_id),
                metodologia_id: Number(b.metodologia_id),
                otra_metodologia: b.otra_metodologia?.trim() || null,
                fecha_inicial: b.fecha_inicial,
                fecha_final: b.fecha_final,
                duracion_horas: b.duracion_horas.toString().trim(),
                tipo_jornada_id: Number(b.tipo_jornada_id),
                horario: b.horario.trim(),
                dias: b.dias.trim(),
                sede: b.sede ?? 0,
                lugar: b.lugar?.trim() || null,
                estatus: 1,
            });

            await user_logs.create({ user_id: req.user_id, log: `Creó proceso educativo ID: ${process.id}, CENTRO: ${b.centro_id}` });
            res.status(201).json({ ok: true, id: process.id });
        } catch (e) {
            next(e);
        }
    }
);

router.put("/processes", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const b = req.body;
            if (!b.id || !b.codigo || !b.nombre || !b.instructor_id || !b.curso_id ||
                !b.metodologia_id || !b.fecha_inicial || !b.fecha_final || !b.duracion_horas ||
                !b.tipo_jornada_id || !b.horario || !b.dias) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const process = await sgc_procesos.findOne({ where: { id: b.id, estatus: 1 } });
            if (!process) return res.status(404).json({ message: "Proceso no encontrado" });

            await sgc_procesos.update({
                codigo: b.codigo.trim(),
                nombre: b.nombre.trim(),
                instructor_id: Number(b.instructor_id),
                curso_id: Number(b.curso_id),
                metodologia_id: Number(b.metodologia_id),
                otra_metodologia: b.otra_metodologia?.trim() || null,
                fecha_inicial: b.fecha_inicial,
                fecha_final: b.fecha_final,
                duracion_horas: b.duracion_horas.toString().trim(),
                tipo_jornada_id: Number(b.tipo_jornada_id),
                horario: b.horario.trim(),
                dias: b.dias.trim(),
                sede: b.sede ?? 0,
                lugar: b.lugar?.trim() || null,
            }, { where: { id: b.id } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó proceso educativo ID: ${b.id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/processes/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const process = await sgc_procesos.findOne({ where: { id, estatus: 1 } });
            if (!process) return res.status(404).json({ message: "Proceso no encontrado" });

            await sgc_procesos.update({ estatus: 0 }, { where: { id } });
            await user_logs.create({ user_id: req.user_id, log: `Eliminó proceso educativo ID: ${id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Process Enrollments ────────────────────────────────────────────────────

router.get("/processes/:id/enrollments", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const processId = Number(req.params.id);
            const rows = await sgc_proceso_matriculas.findAll({
                where: { proceso_id: processId, estatus: 1 },
                attributes: [
                    "id", "proceso_id", "estudiante_id", "tipo_matricula",
                    [sequelize.literal(`(SELECT CONCAT(e.nombres, ' ', e.apellidos) FROM centros.estudiantes e WHERE e.id = "proceso_matriculas".estudiante_id)`), "estudiante_nombre"],
                    [sequelize.literal(`(SELECT e.identidad FROM centros.estudiantes e WHERE e.id = "proceso_matriculas".estudiante_id)`), "estudiante_identidad"],
                    [sequelize.literal(`(SELECT COUNT(*) FROM centros.proceso_matriculas pm2 JOIN centros.procesos p2 ON p2.id = pm2.proceso_id WHERE pm2.estudiante_id = "proceso_matriculas".estudiante_id AND pm2.estatus = 1 AND pm2.proceso_id != "proceso_matriculas".proceso_id AND p2.estatus = 1 AND p2.fecha_final >= CURRENT_DATE)::int`), "other_process_count"],
                ],
                order: [[sequelize.literal(`(SELECT e.nombres FROM centros.estudiantes e WHERE e.id = "proceso_matriculas".estudiante_id)`), "ASC"]],
            });
            res.status(200).json({ data: rows });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/processes/:id/enrollments", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const processId = Number(req.params.id);
            const { student_ids } = req.body;
            if (!Array.isArray(student_ids) || student_ids.length === 0) {
                return res.status(400).json({ message: "Debe enviar al menos un estudiante" });
            }

            const process = await sgc_procesos.findOne({ where: { id: processId, estatus: 1 } });
            if (!process) return res.status(404).json({ message: "Proceso no encontrado" });

            const existing = await sgc_proceso_matriculas.findAll({
                where: { proceso_id: processId, estudiante_id: { [Op.in]: student_ids.map(Number) }, estatus: 1 },
                attributes: ["estudiante_id"],
            });
            const existingIds = existing.map(e => e.estudiante_id);
            const newIds = student_ids.map(Number).filter(id => !existingIds.includes(id));

            if (newIds.length > 0) {
                await sgc_proceso_matriculas.bulkCreate(
                    newIds.map(sid => ({ proceso_id: processId, estudiante_id: sid, tipo_matricula: 2, estatus: 1 }))
                );
            }

            // Check which newly enrolled students are also in other current processes
            let warnings = [];
            if (newIds.length > 0) {
                const multiEnrolled = await sequelize.query(`
                    SELECT DISTINCT pm.estudiante_id FROM centros.proceso_matriculas pm
                    JOIN centros.procesos p ON p.id = pm.proceso_id
                    WHERE pm.estudiante_id IN (:ids) AND pm.estatus = 1
                    AND pm.proceso_id != :processId AND p.estatus = 1
                    AND p.fecha_final >= CURRENT_DATE
                `, { replacements: { ids: newIds, processId }, type: sequelize.QueryTypes.SELECT });

                if (multiEnrolled.length > 0) {
                    const multiIds = multiEnrolled.map(r => r.estudiante_id);
                    const multiStudents = await sgc_estudiantes.findAll({
                        where: { id: { [Op.in]: multiIds } },
                        attributes: ["id", [sequelize.literal(`CONCAT(nombres, ' ', apellidos)`), "nombre_completo"]],
                    });
                    warnings = multiStudents.map(s => s.toJSON().nombre_completo);
                }
            }

            await user_logs.create({ user_id: req.user_id, log: `Matriculó ${newIds.length} estudiante(s) al proceso ID: ${processId}` });
            res.status(201).json({ ok: true, enrolled: newIds.length, warnings });
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/processes/:id/enrollments/:studentId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const processId = Number(req.params.id);
            const studentId = Number(req.params.studentId);

            const enrollment = await sgc_proceso_matriculas.findOne({
                where: { proceso_id: processId, estudiante_id: studentId, estatus: 1 },
            });
            if (!enrollment) return res.status(404).json({ message: "Matrícula no encontrada" });

            await sgc_proceso_matriculas.update({ estatus: 0 }, { where: { id: enrollment.id } });
            await user_logs.create({ user_id: req.user_id, log: `Desmatriculó estudiante ID: ${studentId} del proceso ID: ${processId}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Enrollment Excel export ─────────────────────────────────────────────────

router.get("/processes/:id/enrollments/excel", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const processId = Number(req.params.id);

            const process = await sgc_procesos.findOne({ where: { id: processId, estatus: 1 }, attributes: ["id", "codigo", "centro_id"] });
            if (!process) return res.status(404).json({ message: "Proceso no encontrado" });

            const enrollments = await sgc_proceso_matriculas.findAll({
                where: { proceso_id: processId, estatus: 1 },
                attributes: [
                    "id",
                    [sequelize.literal(`(SELECT CONCAT(e.nombres, ' ', e.apellidos) FROM centros.estudiantes e WHERE e.id = "proceso_matriculas".estudiante_id)`), "nombre_completo"],
                    [sequelize.literal(`(SELECT e.identidad FROM centros.estudiantes e WHERE e.id = "proceso_matriculas".estudiante_id)`), "identidad"],
                    [sequelize.literal(`(SELECT COUNT(*) FROM centros.proceso_matriculas pm2 JOIN centros.procesos p2 ON p2.id = pm2.proceso_id WHERE pm2.estudiante_id = "proceso_matriculas".estudiante_id AND pm2.estatus = 1 AND pm2.proceso_id != "proceso_matriculas".proceso_id AND p2.estatus = 1 AND p2.fecha_final >= CURRENT_DATE)::int`), "other_process_count"],
                ],
                order: [[sequelize.literal(`"nombre_completo"`), "ASC"]],
            });

            // Fetch students from the same centro NOT enrolled in this process (for catalog sheet)
            const centroId = process.centro_id;
            const allStudents = await sequelize.query(`
                SELECT e.id, e.identidad, e.nombres, e.apellidos,
                    (SELECT COUNT(*)::int FROM centros.proceso_matriculas pm
                     JOIN centros.procesos p ON p.id = pm.proceso_id
                     WHERE pm.estudiante_id = e.id
                     AND pm.estatus = 1 AND p.estatus = 1
                     AND p.fecha_final >= CURRENT_DATE
                     AND pm.proceso_id != :processId) AS procesos_activos
                FROM centros.estudiantes e
                WHERE e.centro_id = :centroId AND e.estatus = 1
                  AND e.id NOT IN (
                      SELECT pm.estudiante_id FROM centros.proceso_matriculas pm
                      WHERE pm.proceso_id = :processId AND pm.estatus = 1
                  )
                ORDER BY e.nombres ASC, e.apellidos ASC
            `, { replacements: { centroId, processId }, type: sequelize.QueryTypes.SELECT });

            const rows = enrollments.map((e) => e.toJSON());
            const wb = generateEnrollmentsExcel(rows, allStudents);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", `attachment; filename=matricula-${process.codigo || processId}.xlsx`);
            return wb.write(`matricula-${process.codigo || processId}.xlsx`, res);
        } catch (e) {
            next(e);
        }
    }
);

router.post("/processes/:id/enrollments/excel", verify_token, is_supervisor, excelUpload.single("file"),
    async (req, res, next) => {
        try {
            const processId = Number(req.params.id);
            if (!req.file) return res.status(400).json({ message: "Se requiere un archivo Excel" });

            const process = await sgc_procesos.findOne({ where: { id: processId, estatus: 1 }, attributes: ["id", "centro_id"] });
            if (!process) return res.status(404).json({ message: "Proceso no encontrado" });

            const { parsed, errors } = parseEnrollmentsExcel(req.file.buffer);
            if (parsed.length === 0 && errors.length > 0) {
                return res.status(400).json({ message: "No se encontraron registros válidos", errors });
            }

            // Find students by identity within the same centro
            const identidades = parsed.map((p) => p.identidad);
            const students = await sgc_estudiantes.findAll({
                where: { identidad: { [Op.in]: identidades }, centro_id: process.centro_id, estatus: 1 },
                attributes: ["id", "identidad"],
            });

            const identityToId = new Map(students.map((s) => [s.identidad, s.id]));

            // Check which are already enrolled
            const existingEnrollments = await sgc_proceso_matriculas.findAll({
                where: { proceso_id: processId, estatus: 1 },
                attributes: ["estudiante_id"],
            });
            const enrolledIds = new Set(existingEnrollments.map((e) => e.estudiante_id));

            let enrolled = 0;
            let removed = 0;
            const warnings = [];

            // Resolve student IDs from the Excel
            const excelStudentIds = new Set();
            for (const item of parsed) {
                const studentId = identityToId.get(item.identidad);
                if (!studentId) {
                    warnings.push(`Identidad ${item.identidad}: estudiante no encontrado en el centro`);
                    continue;
                }
                excelStudentIds.add(studentId);

                if (enrolledIds.has(studentId)) continue; // already enrolled, skip

                await sgc_proceso_matriculas.create({
                    proceso_id: processId,
                    estudiante_id: studentId,
                    tipo_matricula: 2,
                    estatus: 1,
                });
                enrolled++;
            }

            // Remove students that are currently enrolled but NOT in the Excel
            for (const existingId of enrolledIds) {
                if (!excelStudentIds.has(existingId)) {
                    await sgc_proceso_matriculas.update(
                        { estatus: 0 },
                        { where: { proceso_id: processId, estudiante_id: existingId, estatus: 1 } },
                    );
                    removed++;
                }
            }

            await user_logs.create({
                user_id: req.user_id,
                log: `Importó matrícula Excel en proceso ID: ${processId}. Matriculados: ${enrolled}, Removidos: ${removed}`,
            });

            res.status(200).json({ ok: true, enrolled, removed, warnings, errors, processed: parsed.length });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Processes <-> Projects (proyectos relacionados) ────────────────────────

router.get("/processes/:id/projects", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const processId = Number(req.params.id);

            const rows = await sequelize.query(`
                SELECT p.id, p.name, p.description, p.project_status, p.project_category,
                    p.start_date, p.end_date
                FROM caderh.projects_processes pp
                JOIN caderh.projects p ON p.id = pp.project_id
                WHERE pp.process_id = :processId AND p.project_status != 'DELETED'
                ORDER BY p.name ASC
            `, { replacements: { processId }, type: sequelize.QueryTypes.SELECT });

            res.status(200).json({ data: rows });
        } catch (e) {
            next(e);
        }
    }
);

router.post("/processes/:id/projects", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const processId = Number(req.params.id);
            const { project_ids } = req.body;

            const process_ = await sgc_procesos.findOne({ where: { id: processId, estatus: 1 } });
            if (!process_) return res.status(404).json({ message: "Proceso no encontrado" });

            const ids = Array.isArray(project_ids) ? project_ids.filter(Boolean) : [];
            if (ids.length === 0) return res.status(400).json({ message: "Debe seleccionar al menos un proyecto" });

            await projects_processes.bulkCreate(
                ids.map((project_id) => ({ project_id, process_id: processId })),
                { ignoreDuplicates: true }
            );

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

router.delete("/processes/:id/projects/:projectId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const processId = Number(req.params.id);
            const { projectId } = req.params;

            const deleted = await projects_processes.destroy({
                where: { project_id: projectId, process_id: processId },
            });

            if (!deleted) return res.status(404).json({ message: "Relación no encontrada" });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// ═══════════════════════════════════════════════════════════════════════════
// Excel Import / Export
// ═══════════════════════════════════════════════════════════════════════════

async function loadCatalogosBase() {
    const [departamentos, municipios, nivelEscolaridades] = await Promise.all([
        sgc_departamentos.findAll({ where: { estatus: 1 }, attributes: ["id", "nombre"], order: [["nombre", "ASC"]], raw: true }),
        sgc_municipios.findAll({ where: { estatus: 1 }, attributes: ["id", "nombre", "departamento_id"], order: [["nombre", "ASC"]], raw: true }),
        sgc_nivel_escolaridads.findAll({ where: { estatus: 1 }, attributes: ["id", "nombre"], order: [["nombre", "ASC"]], raw: true }),
    ]);
    return { departamentos, municipios, nivelEscolaridades };
}

// ─── Excel: Instructores ────────────────────────────────────────────────────

router.get("/centros/:centroId/excel/instructors", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const centro = await sgc_centros.findOne({ where: { id: centroId } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            const rows = await sgc_instructors.findAll({ where: { centro_id: centroId, estatus: 1 }, raw: true });
            const catalogs = await loadCatalogosBase();

            const protectedRows = await sgc_procesos.findAll({
                where: { estatus: 1 },
                attributes: [[sequelize.fn("DISTINCT", sequelize.col("instructor_id")), "instructor_id"]],
                raw: true,
            });
            const protectedIds = protectedRows.map((r) => r.instructor_id);

            const wb = generateInstructorsExcel(rows, catalogs, protectedIds);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=plantilla-instructores.xlsx");
            return wb.write("plantilla-instructores.xlsx", res);
        } catch (e) {
            next(e);
        }
    }
);

router.post("/centros/:centroId/excel/instructors", verify_token, is_supervisor, excelUpload.single("file"),
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const centro = await sgc_centros.findOne({ where: { id: centroId } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });
            if (!req.file) return res.status(400).json({ message: "Archivo requerido" });

            const { parsed, errors } = parseInstructorsExcel(req.file.buffer);

            const allMunicipios = await sgc_municipios.findAll({ where: { estatus: 1 }, attributes: ["id", "departamento_id"], raw: true });
            const munDeptErrors = validateMunicipioDepartamento(parsed, allMunicipios);
            munDeptErrors.forEach((e) => errors.push({ row: null, message: e.message }));

            const validRows = parsed.filter((r) => !munDeptErrors.find((e) => e.id === r.id && r.id));

            const existingRows = await sgc_instructors.findAll({ where: { centro_id: centroId, estatus: 1 }, attributes: ["id"], raw: true });
            const existingIds = new Set(existingRows.map((r) => r.id));
            const excelIds = new Set(validRows.filter((r) => r.id).map((r) => r.id));

            const protectedRows = await sgc_procesos.findAll({
                where: { instructor_id: { [Op.in]: [...existingIds] }, estatus: 1 },
                attributes: [[sequelize.fn("DISTINCT", sequelize.col("instructor_id")), "instructor_id"]],
                raw: true,
            });
            const protectedIds = new Set(protectedRows.map((r) => r.instructor_id));

            let created = 0, updated = 0, deleted = 0;
            const warnings = [];

            for (const existing of existingRows) {
                if (!excelIds.has(existing.id)) {
                    if (protectedIds.has(existing.id)) {
                        warnings.push({ id: existing.id, message: `Instructor ID ${existing.id} está protegido (tiene procesos asignados) y no fue eliminado` });
                    } else {
                        await sgc_instructors.update({ estatus: 0 }, { where: { id: existing.id, centro_id: centroId } });
                        deleted++;
                    }
                }
            }

            for (const row of validRows) {
                try {
                    if (row.id && existingIds.has(row.id)) {
                        const { id, ...data } = row;
                        await sgc_instructors.update(data, { where: { id, centro_id: centroId } });
                        updated++;
                    } else {
                        await sgc_instructors.create({ ...row, id: undefined, centro_id: centroId, estatus: 1 });
                        created++;
                    }
                } catch (err) {
                    errors.push({ row: null, message: `Error en instructor "${row.nombres} ${row.apellidos}": ${err.message}` });
                }
            }

            await user_logs.create({
                user_id: req.user_id,
                log: `Importó instructores por Excel en centro ${centroId} (${created} creados, ${updated} actualizados, ${deleted} eliminados, ${warnings.length} protegidos)`,
            });

            res.status(200).json({ ok: true, created, updated, deleted, warnings, errors, processed: created + updated });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Excel: Estudiantes ─────────────────────────────────────────────────────

router.get("/centros/:centroId/excel/students", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const centro = await sgc_centros.findOne({ where: { id: centroId } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            const rows = await sgc_estudiantes.findAll({ where: { centro_id: centroId, estatus: 1 }, raw: true });
            const catalogs = await loadCatalogosBase();

            const protectedRows = await sgc_proceso_matriculas.findAll({
                where: { estatus: 1 },
                attributes: [[sequelize.fn("DISTINCT", sequelize.col("estudiante_id")), "estudiante_id"]],
                raw: true,
            });
            const protectedIds = protectedRows.map((r) => r.estudiante_id);

            const wb = generateStudentsExcel(rows, catalogs, protectedIds);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=plantilla-estudiantes.xlsx");
            return wb.write("plantilla-estudiantes.xlsx", res);
        } catch (e) {
            next(e);
        }
    }
);

router.post("/centros/:centroId/excel/students", verify_token, is_supervisor, excelUpload.single("file"),
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const centro = await sgc_centros.findOne({ where: { id: centroId } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });
            if (!req.file) return res.status(400).json({ message: "Archivo requerido" });

            const { parsed, errors } = parseStudentsExcel(req.file.buffer);

            const allMunicipios = await sgc_municipios.findAll({ where: { estatus: 1 }, attributes: ["id", "departamento_id"], raw: true });
            const munDeptErrors = validateMunicipioDepartamento(parsed, allMunicipios);
            munDeptErrors.forEach((e) => errors.push({ row: null, message: e.message }));

            const existingRows = await sgc_estudiantes.findAll({
                where: { centro_id: centroId, estatus: 1 },
                attributes: ["id", "identidad"],
                raw: true,
            });
            const existingIds = new Set(existingRows.map((r) => r.id));
            const excelIds = new Set(parsed.filter((r) => r.id).map((r) => r.id));

            // Fetch global identidades for uniqueness check
            const parsedIdentidades = parsed.map((r) => r.identidad).filter(Boolean);
            const globalExisting = await sgc_estudiantes.findAll({
                where: { identidad: { [Op.in]: parsedIdentidades }, estatus: 1 },
                attributes: ["id", "identidad"],
                raw: true,
            });
            const globalIdentidades = new Map(globalExisting.map((r) => [r.identidad, r.id]));

            // Validate unique identidad within excel + existing (globally)
            const seenIdentidades = new Map();
            const validRows = [];
            for (const row of parsed) {
                const hasError = munDeptErrors.find((e) => e.id === row.id && row.id);
                if (hasError) continue;

                if (seenIdentidades.has(row.identidad)) {
                    errors.push({ row: null, message: `Identidad "${row.identidad}" duplicada en el Excel` });
                    continue;
                }
                seenIdentidades.set(row.identidad, true);

                // Check if identidad already belongs to a different student (globally)
                const existingStudentId = globalIdentidades.get(row.identidad);
                if (existingStudentId && (!row.id || row.id !== existingStudentId)) {
                    errors.push({ row: null, message: `Identidad "${row.identidad}" ya existe para otro estudiante (ID ${existingStudentId})` });
                    continue;
                }

                validRows.push(row);
            }

            const protectedRows = await sgc_proceso_matriculas.findAll({
                where: { estudiante_id: { [Op.in]: [...existingIds] }, estatus: 1 },
                attributes: [[sequelize.fn("DISTINCT", sequelize.col("estudiante_id")), "estudiante_id"]],
                raw: true,
            });
            const protectedIds = new Set(protectedRows.map((r) => r.estudiante_id));

            let created = 0, updated = 0, deleted = 0;
            const warnings = [];

            for (const existing of existingRows) {
                if (!excelIds.has(existing.id)) {
                    if (protectedIds.has(existing.id)) {
                        warnings.push({ id: existing.id, message: `Estudiante ID ${existing.id} (${existing.identidad}) está protegido (tiene matrículas) y no fue eliminado` });
                    } else {
                        await sgc_estudiantes.update({ estatus: 0 }, { where: { id: existing.id, centro_id: centroId } });
                        deleted++;
                    }
                }
            }

            for (const row of validRows) {
                try {
                    if (row.id && existingIds.has(row.id)) {
                        const { id, ...data } = row;
                        await sgc_estudiantes.update(data, { where: { id, centro_id: centroId } });
                        updated++;
                    } else {
                        await sgc_estudiantes.create({ ...row, id: undefined, centro_id: centroId, estatus: 1 });
                        created++;
                    }
                } catch (err) {
                    errors.push({ row: null, message: `Error en estudiante "${row.nombres} ${row.apellidos}": ${err.message}` });
                }
            }

            await user_logs.create({
                user_id: req.user_id,
                log: `Importó estudiantes por Excel en centro ${centroId} (${created} creados, ${updated} actualizados, ${deleted} eliminados, ${warnings.length} protegidos)`,
            });

            res.status(200).json({ ok: true, created, updated, deleted, warnings, errors, processed: created + updated });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Excel: Cursos ──────────────────────────────────────────────────────────

router.get("/centros/:centroId/excel/courses", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const centro = await sgc_centros.findOne({ where: { id: centroId } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            const rows = await sgc_cursos.findAll({ where: { centro_id: centroId, estatus: 1 }, raw: true });
            const catalogs = await loadCatalogosBase();

            const protectedRows = await sgc_procesos.findAll({
                where: { estatus: 1 },
                attributes: [[sequelize.fn("DISTINCT", sequelize.col("curso_id")), "curso_id"]],
                raw: true,
            });
            const protectedIds = protectedRows.map((r) => r.curso_id);

            const wb = generateCoursesExcel(rows, catalogs, protectedIds);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=plantilla-cursos.xlsx");
            return wb.write("plantilla-cursos.xlsx", res);
        } catch (e) {
            next(e);
        }
    }
);

router.post("/centros/:centroId/excel/courses", verify_token, is_supervisor, excelUpload.single("file"),
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const centro = await sgc_centros.findOne({ where: { id: centroId } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });
            if (!req.file) return res.status(400).json({ message: "Archivo requerido" });

            const { parsed, errors } = parseCoursesExcel(req.file.buffer);

            const existingRows = await sgc_cursos.findAll({ where: { centro_id: centroId, estatus: 1 }, attributes: ["id"], raw: true });
            const existingIds = new Set(existingRows.map((r) => r.id));
            const excelIds = new Set(parsed.filter((r) => r.id).map((r) => r.id));

            const protectedRows = await sgc_procesos.findAll({
                where: { curso_id: { [Op.in]: [...existingIds] }, estatus: 1 },
                attributes: [[sequelize.fn("DISTINCT", sequelize.col("curso_id")), "curso_id"]],
                raw: true,
            });
            const protectedIds = new Set(protectedRows.map((r) => r.curso_id));

            let created = 0, updated = 0, deleted = 0;
            const warnings = [];

            for (const existing of existingRows) {
                if (!excelIds.has(existing.id)) {
                    if (protectedIds.has(existing.id)) {
                        warnings.push({ id: existing.id, message: `Curso ID ${existing.id} está protegido (tiene procesos asignados) y no fue eliminado` });
                    } else {
                        await sgc_cursos.update({ estatus: 0 }, { where: { id: existing.id, centro_id: centroId } });
                        deleted++;
                    }
                }
            }

            for (const row of parsed) {
                try {
                    if (row.id && existingIds.has(row.id)) {
                        const { id, ...data } = row;
                        await sgc_cursos.update(data, { where: { id, centro_id: centroId } });
                        updated++;
                    } else {
                        await sgc_cursos.create({ ...row, id: undefined, centro_id: centroId, estatus: 1 });
                        created++;
                    }
                } catch (err) {
                    errors.push({ row: null, message: `Error en curso "${row.nombre}": ${err.message}` });
                }
            }

            await user_logs.create({
                user_id: req.user_id,
                log: `Importó cursos por Excel en centro ${centroId} (${created} creados, ${updated} actualizados, ${deleted} eliminados, ${warnings.length} protegidos)`,
            });

            res.status(200).json({ ok: true, created, updated, deleted, warnings, errors, processed: created + updated });
        } catch (e) {
            next(e);
        }
    }
);

// ─── Excel: Procesos Educativos ─────────────────────────────────────────────

router.get("/centros/:centroId/excel/processes", verify_token, is_authenticated,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const centro = await sgc_centros.findOne({ where: { id: centroId } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            const rows = await sgc_procesos.findAll({ where: { centro_id: centroId, estatus: 1 }, raw: true });

            const [instructores, cursos, metodologias, tipoJornadas] = await Promise.all([
                sgc_instructors.findAll({ where: { centro_id: centroId, estatus: 1 }, attributes: ["id", "nombres", "apellidos"], raw: true }),
                sgc_cursos.findAll({ where: { centro_id: centroId, estatus: 1 }, attributes: ["id", "nombre"], raw: true }),
                sgc_metodologias.findAll({ where: { estatus: 1 }, attributes: ["id", "nombre"], raw: true }),
                sgc_tipo_jornadas.findAll({ where: { estatus: 1 }, attributes: ["id", "nombre"], raw: true }),
            ]);

            const catalogs = { instructores, cursos, metodologias, tipoJornadas };

            // Protected if has enrollments or linked projects
            const [matRows, projRows] = await Promise.all([
                sgc_proceso_matriculas.findAll({
                    where: { estatus: 1 },
                    attributes: [[sequelize.fn("DISTINCT", sequelize.col("proceso_id")), "proceso_id"]],
                    raw: true,
                }),
                projects_processes.findAll({
                    attributes: [[sequelize.fn("DISTINCT", sequelize.col("process_id")), "process_id"]],
                    raw: true,
                }),
            ]);
            const protectedIds = [...new Set([...matRows.map((r) => r.proceso_id), ...projRows.map((r) => r.process_id)])];

            const wb = generateProcessesExcel(rows, catalogs, protectedIds);
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=plantilla-procesos.xlsx");
            return wb.write("plantilla-procesos.xlsx", res);
        } catch (e) {
            next(e);
        }
    }
);

router.post("/centros/:centroId/excel/processes", verify_token, is_supervisor, excelUpload.single("file"),
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const centro = await sgc_centros.findOne({ where: { id: centroId } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });
            if (!req.file) return res.status(400).json({ message: "Archivo requerido" });

            const { parsed, errors } = parseProcessesExcel(req.file.buffer);

            // Validate FK references
            const [validInstructors, validCourses, validMetodologias, validJornadas] = await Promise.all([
                sgc_instructors.findAll({ where: { centro_id: centroId, estatus: 1 }, attributes: ["id"], raw: true }),
                sgc_cursos.findAll({ where: { centro_id: centroId, estatus: 1 }, attributes: ["id"], raw: true }),
                sgc_metodologias.findAll({ where: { estatus: 1 }, attributes: ["id"], raw: true }),
                sgc_tipo_jornadas.findAll({ where: { estatus: 1 }, attributes: ["id"], raw: true }),
            ]);
            const instSet = new Set(validInstructors.map((r) => r.id));
            const cursoSet = new Set(validCourses.map((r) => r.id));
            const metSet = new Set(validMetodologias.map((r) => r.id));
            const tjSet = new Set(validJornadas.map((r) => r.id));

            const validRows = [];
            for (const row of parsed) {
                let hasErr = false;
                if (!instSet.has(row.instructor_id)) {
                    errors.push({ row: null, message: `Instructor ID ${row.instructor_id} no encontrado en este centro (proceso "${row.nombre}")` });
                    hasErr = true;
                }
                if (!cursoSet.has(row.curso_id)) {
                    errors.push({ row: null, message: `Curso ID ${row.curso_id} no encontrado en este centro (proceso "${row.nombre}")` });
                    hasErr = true;
                }
                if (!metSet.has(row.metodologia_id)) {
                    errors.push({ row: null, message: `Metodología ID ${row.metodologia_id} no encontrada (proceso "${row.nombre}")` });
                    hasErr = true;
                }
                if (!tjSet.has(row.tipo_jornada_id)) {
                    errors.push({ row: null, message: `Tipo Jornada ID ${row.tipo_jornada_id} no encontrada (proceso "${row.nombre}")` });
                    hasErr = true;
                }
                if (!hasErr) validRows.push(row);
            }

            const existingRows = await sgc_procesos.findAll({ where: { centro_id: centroId, estatus: 1 }, attributes: ["id"], raw: true });
            const existingIds = new Set(existingRows.map((r) => r.id));
            const excelIds = new Set(validRows.filter((r) => r.id).map((r) => r.id));

            const [matRows, projRows] = await Promise.all([
                sgc_proceso_matriculas.findAll({
                    where: { proceso_id: { [Op.in]: [...existingIds] }, estatus: 1 },
                    attributes: [[sequelize.fn("DISTINCT", sequelize.col("proceso_id")), "proceso_id"]],
                    raw: true,
                }),
                projects_processes.findAll({
                    where: { process_id: { [Op.in]: [...existingIds] } },
                    attributes: [[sequelize.fn("DISTINCT", sequelize.col("process_id")), "process_id"]],
                    raw: true,
                }),
            ]);
            const protectedIds = new Set([...matRows.map((r) => r.proceso_id), ...projRows.map((r) => r.process_id)]);

            let created = 0, updated = 0, deleted = 0;
            const warnings = [];

            for (const existing of existingRows) {
                if (!excelIds.has(existing.id)) {
                    if (protectedIds.has(existing.id)) {
                        warnings.push({ id: existing.id, message: `Proceso ID ${existing.id} está protegido (tiene matrículas o proyectos) y no fue eliminado` });
                    } else {
                        await sgc_procesos.update({ estatus: 0 }, { where: { id: existing.id } });
                        deleted++;
                    }
                }
            }

            for (const row of validRows) {
                try {
                    if (row.id && existingIds.has(row.id)) {
                        const { id, ...data } = row;
                        await sgc_procesos.update(data, { where: { id } });
                        updated++;
                    } else {
                        await sgc_procesos.create({
                            ...row, id: undefined, centro_id: centroId,
                            estatus: 1,
                        });
                        created++;
                    }
                } catch (err) {
                    errors.push({ row: null, message: `Error en proceso "${row.nombre}": ${err.message}` });
                }
            }

            await user_logs.create({
                user_id: req.user_id,
                log: `Importó procesos por Excel en centro ${centroId} (${created} creados, ${updated} actualizados, ${deleted} eliminados, ${warnings.length} protegidos)`,
            });

            res.status(200).json({ ok: true, created, updated, deleted, warnings, errors, processed: created + updated });
        } catch (e) {
            next(e);
        }
    }
);
