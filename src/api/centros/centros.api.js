import { Router } from "express";
import { sequelize, user_logs, sgc_areas, sgc_departamentos, sgc_municipios, sgc_centros, sgc_instructors, sgc_estudiantes, sgc_cursos, sgc_nivel_escolaridads } from "../../utils/sequelize.js";
import { verify_token, is_supervisor, is_authenticated } from "../../utils/token.js";
import { Op } from "sequelize";
import { instructorFileUpload, buildInstructorFilePath, studentFileUpload, buildStudentFilePath } from "../../utils/upload.js";
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
                identidad: "N/A", departamento_id: 0, municipio_id: 0, sexo: "N/A", estado_civil: "N/A",
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
                identidad: "N/A", departamento_id: 0, municipio_id: 0, sexo: "N/A", estado_civil: "N/A",
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
                    "id", "centro_id", "identidad", "nombres", "apellidos", "email", "telefono", "celular", "sexo", "pdf",
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

router.post("/centros/:centroId/estudiantes", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const centroId = Number(req.params.centroId);
            const b = req.body;

            if (!b.identidad || !b.nombres || !b.apellidos || !b.departamento_id || !b.municipio_id || !b.sexo || !b.estado_civil || !b.vive || !b.numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const estudiante = await sgc_estudiantes.create({
                centro_id: centroId, identidad: b.identidad.trim(), nombres: b.nombres.trim(), apellidos: b.apellidos.trim(),
                departamento_id: b.departamento_id, municipio_id: b.municipio_id,
                email: b.email?.trim() || null, telefono: b.telefono?.trim() || null, celular: b.celular?.trim() || null,
                sexo: b.sexo, estado_civil: b.estado_civil, fecha_nacimiento: b.fecha_nacimiento || null,
                sangre: "N/A", vive: b.vive, numero_dep: b.numero_dep, direccion: b.direccion?.trim() || null,
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
                return res.status(400).json({ message: "Ya existe un estudiante con esta identidad en este centro" });
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

            if (!b.id || !b.identidad || !b.nombres || !b.apellidos || !b.departamento_id || !b.municipio_id || !b.sexo || !b.estado_civil || !b.vive || !b.numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const estudiante = await sgc_estudiantes.findOne({ where: { id: b.id, centro_id: centroId } });
            if (!estudiante) return res.status(404).json({ message: "Estudiante no encontrado" });

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
                return res.status(400).json({ message: "Ya existe un estudiante con esta identidad en este centro" });
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

            if (!codigo || !nombre || !codigo_programa || !total_horas || !objetivo) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const curso = await sgc_cursos.create({
                centro_id: centroId, codigo: Number(codigo), nombre: nombre.trim(), codigo_programa: codigo_programa.trim(),
                total_horas: total_horas.toString().trim(), taller: taller ?? 1, objetivo: objetivo.trim(),
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

            if (!id || !codigo || !nombre || !codigo_programa || !total_horas || !objetivo) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const curso = await sgc_cursos.findOne({ where: { id, centro_id: centroId } });
            if (!curso) return res.status(404).json({ message: "Curso no encontrado" });

            await sgc_cursos.update({
                codigo: Number(codigo), nombre: nombre.trim(), codigo_programa: codigo_programa.trim(),
                total_horas: total_horas.toString().trim(), taller: taller ?? 1, objetivo: objetivo.trim(),
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
                    "id", "centro_id", "identidad", "nombres", "apellidos", "sexo", "celular", "email", "pdf",
                    [sequelize.literal(`(SELECT c.nombre FROM centros.centros c WHERE c.id = "estudiantes".centro_id)`), "centro_nombre"],
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
            if (!b.centro_id || !b.identidad || !b.nombres || !b.apellidos || !b.departamento_id || !b.municipio_id || !b.sexo || !b.estado_civil || !b.vive || !b.numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const centro = await sgc_centros.findOne({ where: { id: b.centro_id } });
            if (!centro) return res.status(404).json({ message: "Centro no encontrado" });

            const student = await sgc_estudiantes.create({
                centro_id: b.centro_id, sangre: "N/A", estatus: 1, ...buildStudentBody(b),
            });

            await user_logs.create({ user_id: req.user_id, log: `Creó estudiante ID: ${student.id}, CENTRO: ${b.centro_id}` });
            res.status(201).json({ ok: true, id: student.id });
        } catch (e) {
            if (e.name === "SequelizeUniqueConstraintError") {
                return res.status(400).json({ message: "Ya existe un estudiante con esta identidad en este centro" });
            }
            next(e);
        }
    }
);

router.put("/students", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const b = req.body;
            if (!b.id || !b.identidad || !b.nombres || !b.apellidos || !b.departamento_id || !b.municipio_id || !b.sexo || !b.estado_civil || !b.vive || !b.numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const student = await sgc_estudiantes.findOne({ where: { id: b.id, estatus: 1 } });
            if (!student) return res.status(404).json({ message: "Estudiante no encontrado" });

            await sgc_estudiantes.update(buildStudentBody(b), { where: { id: b.id } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó estudiante ID: ${b.id}` });
            res.status(200).json({ ok: true });
        } catch (e) {
            if (e.name === "SequelizeUniqueConstraintError") {
                return res.status(400).json({ message: "Ya existe un estudiante con esta identidad en este centro" });
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
