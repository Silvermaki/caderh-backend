import { Router } from "express";
import { crypto } from "../../utils/crypto.js";
import { users, user_logs, financing_sources } from "../../utils/sequelize.js";
import { mailer } from "../../utils/mailer.js";
import { verify_token, is_supervisor } from "../../utils/token.js";
import { Op } from 'sequelize';
export const router = Router();


router.post('/test', verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Create financing source
router.post('/financing-source', verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { name, description } = req.body;
            if (!name || !description) {
                return res.status(400).json({ message: 'Faltan campos requeridos' });
            }
            if (typeof name !== 'string' || name.trim().length < 2) {
                return res.status(400).json({ message: 'Nombre inválido' });
            }
            if (typeof description !== 'string' || description.trim().length < 5) {
                return res.status(400).json({ message: 'Descripción inválida' });
            }

            const existing = await financing_sources.findOne({ where: { name: { [Op.iLike]: name.trim() } } });
            if (existing) {
                return res.status(400).json({ message: 'Fuente de financiamiento con este nombre ya existe' });
            }

            const fsrc = await financing_sources.create({
                name: name.trim(),
                description: description.trim()
            });

            await user_logs.create({
                user_id: req.user_id,
                log: `Creó fuente de financiamiento ID: ${fsrc.id}, NOMBRE: ${fsrc.name}`
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Get single financing source
router.get('/financing-source', verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.query;
            if (!id) return res.status(400).json({ message: 'Faltan campos requeridos' });
            const fsrc = await financing_sources.findOne({ where: { id } });
            if (!fsrc) return res.status(400).json({ message: 'Fuente de financiamiento no encontrada' });
            res.status(200).json({ data: fsrc });
        } catch (e) {
            next(e);
        }
    }
);

// List financing sources
router.get('/financing-sources', verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { limit, offset, sort, desc, search } = req.query;
            if (!limit || limit > 100) return res.status(400).json({ message: 'Faltan campos requeridos' });

            const where = search ? { [Op.or]: { name: { [Op.iLike]: `%${search}%` }, description: { [Op.iLike]: `%${search}%` } } } : undefined;

            const result = await financing_sources.findAndCountAll({
                attributes: ['id', 'name', 'description', 'created_dt'],
                where,
                order: sort ? [[sort, desc]] : undefined,
                limit: limit,
                offset: offset ?? 0
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

// Update financing source
router.put('/financing-source', verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id, name, description } = req.body;
            if (!id || !name || !description) return res.status(400).json({ message: 'Faltan campos requeridos' });
            if (typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ message: 'Nombre inválido' });
            if (typeof description !== 'string' || description.trim().length < 5) return res.status(400).json({ message: 'Descripción inválida' });

            const existing = await financing_sources.findOne({ where: { name: { [Op.iLike]: name.trim() }, id: { [Op.ne]: id } } });
            if (existing) return res.status(400).json({ message: 'Otra fuente con este nombre ya existe' });

            await financing_sources.update({ name: name.trim(), description: description.trim() }, { where: { id } });

            await user_logs.create({
                user_id: req.user_id,
                log: `Actualizó fuente de financiamiento ID: ${id}, NOMBRE: ${name}`
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Delete financing source
router.delete('/financing-source', verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.body;
            if (!id) return res.status(400).json({ message: 'Faltan campos requeridos' });
            const fsrc = await financing_sources.findOne({ where: { id } });
            if (!fsrc) return res.status(400).json({ message: 'Fuente de financiamiento no encontrada' });

            await financing_sources.destroy({ where: { id } });

            await user_logs.create({
                user_id: req.user_id,
                log: `Eliminó fuente de financiamiento ID: ${id}, NOMBRE: ${fsrc.name}`
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

router.post('/project', verify_token, is_supervisor, 
    async (req, res, next) => {
        try {
            const { name, description, start_date, end_date } = req.body;
            if (!name || !description || !start_date || !end_date) {
                return res.status(400).json({ message: 'Faltan campos requeridos' });
            }

            await projects.create({
                name: name.trim(),
                description: description.trim(),
                start_date,
                end_date
            });

            await user_logs.create({
                user_id: req.user_id,
                log: `Creó proyecto con parámetros NOMBRE: ${name}, DESCRIPCIÓN: ${description}, FECHA INICIO: ${start_date}, FECHA FIN: ${end_date}`
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
)