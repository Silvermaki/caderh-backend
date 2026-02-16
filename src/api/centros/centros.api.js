import { Router } from "express";
import { sequelize, user_logs, sgc_areas, sgc_departamentos, sgc_municipios, sgc_centros } from "../../utils/sequelize.js";
import { verify_token, is_supervisor, is_authenticated } from "../../utils/token.js";
import { Op } from "sequelize";

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
            const { limit, offset, sort, desc, search, estatus } = req.query;
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
