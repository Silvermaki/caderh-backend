import { Router } from "express";
import { sequelize, user_logs, sgc_areas, sgc_departamentos, sgc_municipios, sgc_centros, sgc_instructors, sgc_estudiantes, sgc_cursos, sgc_nivel_escolaridads } from "../../utils/sequelize.js";
import { verify_token, is_supervisor, is_authenticated } from "../../utils/token.js";
import { Op } from "sequelize";
import { instructorFileUpload, buildInstructorFilePath } from "../../utils/upload.js";
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

// ─── Estudiantes CRUD ────────────────────────────────────────────────────────

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
                    "id", "identidad", "nombres", "apellidos", "email", "telefono", "celular", "sexo", "estado_civil", "estatus", "created_at",
                    "departamento_id", "municipio_id", "fecha_nacimiento", "sangre", "vive", "numero_dep", "direccion",
                    [sequelize.literal(`(SELECT d.nombre FROM centros.departamentos d WHERE d.id = "estudiantes".departamento_id)`), "departamento_nombre"],
                    [sequelize.literal(`(SELECT m.nombre FROM centros.municipios m WHERE m.id = "estudiantes".municipio_id)`), "municipio_nombre"],
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
            const { identidad, nombres, apellidos, departamento_id, municipio_id, email, telefono, celular, sexo, estado_civil, fecha_nacimiento, sangre, vive, numero_dep, direccion } = req.body;

            if (!identidad || !nombres || !apellidos || !departamento_id || !municipio_id || !sexo || !estado_civil || !sangre || !vive || !numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const estudiante = await sgc_estudiantes.create({
                centro_id: centroId, identidad: identidad.trim(), nombres: nombres.trim(), apellidos: apellidos.trim(),
                departamento_id, municipio_id, email: email?.trim() || null, telefono: telefono?.trim() || null,
                celular: celular?.trim() || null, sexo, estado_civil, fecha_nacimiento: fecha_nacimiento || null,
                sangre, vive, numero_dep, direccion: direccion?.trim() || null, estatus: 1,
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
            const { id, identidad, nombres, apellidos, departamento_id, municipio_id, email, telefono, celular, sexo, estado_civil, fecha_nacimiento, sangre, vive, numero_dep, direccion } = req.body;

            if (!id || !identidad || !nombres || !apellidos || !departamento_id || !municipio_id || !sexo || !estado_civil || !sangre || !vive || !numero_dep) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }

            const estudiante = await sgc_estudiantes.findOne({ where: { id, centro_id: centroId } });
            if (!estudiante) return res.status(404).json({ message: "Estudiante no encontrado" });

            await sgc_estudiantes.update({
                identidad: identidad.trim(), nombres: nombres.trim(), apellidos: apellidos.trim(),
                departamento_id, municipio_id, email: email?.trim() || null, telefono: telefono?.trim() || null,
                celular: celular?.trim() || null, sexo, estado_civil, fecha_nacimiento: fecha_nacimiento || null,
                sangre, vive, numero_dep, direccion: direccion?.trim() || null,
            }, { where: { id, centro_id: centroId } });

            await user_logs.create({ user_id: req.user_id, log: `Actualizó estudiante ID: ${id}, CENTRO: ${centroId}` });
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
