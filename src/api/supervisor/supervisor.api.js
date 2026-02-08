import { Router } from "express";
import path from "path";
import fs from "fs";
import { users, user_logs, financing_sources, projects, project_financing_sources, project_donations, project_expenses, project_files } from "../../utils/sequelize.js";
import { projectFileUpload } from "../../utils/upload.js";
import { verify_token, is_supervisor } from "../../utils/token.js";
import { Op } from "sequelize";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

// --- Project Wizard ---

// Step 1: Create project
router.post("/project/wizard/step1", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { name, description, objectives, start_date, end_date } = req.body;
            if (!name || !description || !objectives || !start_date || !end_date) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }
            if (typeof name !== "string" || name.trim().length < 2) {
                return res.status(400).json({ message: "Nombre inválido" });
            }
            const start = new Date(start_date);
            const end = new Date(end_date);
            if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
                return res.status(400).json({ message: "Fechas inválidas" });
            }

            const project = await projects.create({
                name: name.trim(),
                description: description.trim(),
                objectives: objectives.trim(),
                start_date,
                end_date,
            });

            await user_logs.create({
                user_id: req.user_id,
                log: `Creó proyecto ID: ${project.id}, NOMBRE: ${project.name}`,
            });

            res.status(200).json({ project_id: project.id });
        } catch (e) {
            next(e);
        }
    }
);

// Step 1: Update project
router.put("/project/wizard/step1/:projectId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const { name, description, objectives, start_date, end_date } = req.body;
            if (!name || !description || !objectives || !start_date || !end_date) {
                return res.status(400).json({ message: "Faltan campos requeridos" });
            }
            if (typeof name !== "string" || name.trim().length < 2) {
                return res.status(400).json({ message: "Nombre inválido" });
            }
            const start = new Date(start_date);
            const end = new Date(end_date);
            if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
                return res.status(400).json({ message: "Fechas inválidas" });
            }

            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }

            await projects.update(
                { name: name.trim(), description: description.trim(), objectives: objectives.trim(), start_date, end_date },
                { where: { id: projectId } }
            );

            await user_logs.create({
                user_id: req.user_id,
                log: `Actualizó proyecto ID: ${projectId}, NOMBRE: ${name}`,
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Step 2: Financing sources (replace all)
router.put("/project/wizard/step2/:projectId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const { items } = req.body ?? {};
            const arr = Array.isArray(items) ? items : [];

            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }

            for (const i of arr) {
                if (!i.financing_source_id || (typeof i.amount !== "number" && typeof i.amount !== "string")) {
                    return res.status(400).json({ message: "Cada item debe tener financing_source_id y amount" });
                }
                const srcExists = await financing_sources.findOne({ where: { id: i.financing_source_id } });
                if (!srcExists) {
                    return res.status(400).json({ message: `Fuente de financiamiento no encontrada: ${i.financing_source_id}` });
                }
            }

            await project_financing_sources.destroy({ where: { project_id: projectId } });
            if (arr.length > 0) {
                await project_financing_sources.bulkCreate(
                    arr.map((i) => ({
                        project_id: projectId,
                        financing_source_id: i.financing_source_id,
                        amount: Number(i.amount),
                        description: (i.description ?? "").toString(),
                    }))
                );
            }

            await user_logs.create({
                user_id: req.user_id,
                log: `Actualizó fuentes de financiamiento del proyecto ID: ${projectId}`,
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Step 3: Donations (replace all)
router.put("/project/wizard/step3/:projectId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const { items } = req.body ?? {};
            const arr = Array.isArray(items) ? items : [];
            const VALID_TYPES = ["CASH", "SUPPLY"];

            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }

            for (const i of arr) {
                if ((typeof i.amount !== "number" && typeof i.amount !== "string") || !VALID_TYPES.includes(i.donation_type)) {
                    return res.status(400).json({ message: "Cada item debe tener amount y donation_type (CASH o SUPPLY)" });
                }
            }

            await project_donations.destroy({ where: { project_id: projectId } });
            if (arr.length > 0) {
                await project_donations.bulkCreate(
                    arr.map((i) => ({
                        project_id: projectId,
                        amount: Number(i.amount),
                        description: (i.description ?? "").toString(),
                        donation_type: i.donation_type,
                    }))
                );
            }

            await user_logs.create({
                user_id: req.user_id,
                log: `Actualizó donaciones del proyecto ID: ${projectId}`,
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Step 4: Expenses (replace all)
router.put("/project/wizard/step4/:projectId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const { items } = req.body ?? {};
            const arr = Array.isArray(items) ? items : [];

            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }

            for (const i of arr) {
                if (typeof i.amount !== "number" && typeof i.amount !== "string") {
                    return res.status(400).json({ message: "Cada item debe tener amount" });
                }
            }

            await project_expenses.destroy({ where: { project_id: projectId } });
            if (arr.length > 0) {
                await project_expenses.bulkCreate(
                    arr.map((i) => ({
                        project_id: projectId,
                        amount: Number(i.amount),
                        description: (i.description ?? "").toString(),
                    }))
                );
            }

            await user_logs.create({
                user_id: req.user_id,
                log: `Actualizó gastos del proyecto ID: ${projectId}`,
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Step 5: Upload one file
router.post("/project/wizard/step5/:projectId", verify_token, is_supervisor,
    (req, res, next) => {
        projectFileUpload.single("file")(req, res, (err) => {
            if (err) {
                const msg = err.code === "LIMIT_FILE_SIZE" ? "Archivo excede el tamaño máximo de 10MB" : (err.message || "Error al subir archivo");
                return res.status(400).json({ message: msg });
            }
            next();
        });
    },
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const description = req.body?.description ?? "";

            if (!req.file) {
                return res.status(400).json({ message: "Falta el archivo" });
            }

            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }

            const filename = req.file.filename;
            const relativePath = path.join("projects", projectId, filename);

            await project_files.create({
                project_id: projectId,
                file: relativePath,
                description: description.toString().trim() || filename,
            });

            await user_logs.create({
                user_id: req.user_id,
                log: `Subió archivo al proyecto ID: ${projectId}, archivo: ${filename}`,
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Step 5: Delete one file
router.delete("/project/wizard/step5/:projectId/:fileId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId, fileId } = req.params;

            const pf = await project_files.findOne({ where: { id: fileId, project_id: projectId } });
            if (!pf) {
                return res.status(404).json({ message: "Archivo no encontrado" });
            }

            const fullPath = path.join(__dirname, "../files", pf.file);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }

            await project_files.destroy({ where: { id: fileId } });

            await user_logs.create({
                user_id: req.user_id,
                log: `Eliminó archivo del proyecto ID: ${projectId}, archivo ID: ${fileId}`,
            });

            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);