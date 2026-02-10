import { Router } from "express";
import path from "path";
import fs from "fs";
import { sequelize, users, user_logs, financing_sources, projects, project_financing_sources, project_donations, project_expenses, project_files, project_beneficiaries, project_logs } from "../../utils/sequelize.js";
import { projectFileUpload, buildProjectFilePath } from "../../utils/upload.js";
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

// List projects
router.get("/projects", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { limit, offset, sort, desc, search, status } = req.query;
            if (!limit || limit > 100) return res.status(400).json({ message: "Faltan campos requeridos" });

            const VALID_STATUSES = ["ACTIVE", "ARCHIVED"];
            const statusFilter = VALID_STATUSES.includes(status) ? status : "ACTIVE";

            const where = {
                project_status: statusFilter,
                ...(search
                    ? { [Op.or]: { name: { [Op.iLike]: `%${search}%` }, description: { [Op.iLike]: `%${search}%` } } }
                    : {}),
            };

            const result = await projects.findAndCountAll({
                attributes: [
                    "id", "name", "description", "objectives", "start_date", "end_date", "accomplishments", "project_status", "created_dt",
                    [sequelize.literal(`(
                        COALESCE((SELECT SUM(amount) FROM caderh.project_financing_sources WHERE project_id = "projects".id), 0) +
                        COALESCE((SELECT SUM(amount) FROM caderh.project_donations WHERE project_id = "projects".id AND donation_type = 'CASH'), 0)
                    )`), "financed_amount"],
                    [sequelize.literal(`(
                        COALESCE((SELECT SUM(amount) FROM caderh.project_expenses WHERE project_id = "projects".id), 0)
                    )`), "total_expenses"],
                ],
                where,
                order: sort ? [[sort, desc]] : undefined,
                limit: Number(limit),
                offset: Number(offset ?? 0),
            });

            res.status(200).json({ data: result.rows, count: result.count });
        } catch (e) {
            next(e);
        }
    }
);

// Delete project (soft delete)
router.delete("/projects/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const project = await projects.findOne({ where: { id } });
            if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
            await projects.update({ project_status: 'DELETED' }, { where: { id } });
            await user_logs.create({
                user_id: req.user_id,
                log: `Eliminó proyecto ID: ${id}, NOMBRE: ${project.name}`,
            });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Get single project with financial totals
router.get("/projects/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const project = await projects.findOne({
                where: { id },
                attributes: [
                    "id", "name", "description", "objectives", "start_date", "end_date", "accomplishments", "project_status", "created_dt",
                    [sequelize.literal(`(
                        COALESCE((SELECT SUM(amount) FROM caderh.project_financing_sources WHERE project_id = "projects".id), 0) +
                        COALESCE((SELECT SUM(amount) FROM caderh.project_donations WHERE project_id = "projects".id AND donation_type = 'CASH'), 0)
                    )`), "financed_amount"],
                    [sequelize.literal(`(
                        COALESCE((SELECT SUM(amount) FROM caderh.project_expenses WHERE project_id = "projects".id), 0)
                    )`), "total_expenses"],
                ],
            });
            if (!project || project.project_status === 'DELETED') {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }
            res.status(200).json({ data: project });
        } catch (e) {
            next(e);
        }
    }
);

// PATCH accomplishments (update logros without full edit)
router.patch("/projects/:id/accomplishments", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { accomplishments } = req.body;
            const project = await projects.findOne({ where: { id } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }
            let accomplishmentsArr = [];
            if (Array.isArray(accomplishments)) {
                accomplishmentsArr = accomplishments
                    .filter((a) => a && typeof a.text === "string" && typeof a.completed === "boolean")
                    .map((a) => ({ text: String(a.text).trim(), completed: Boolean(a.completed) }));
            }
            await projects.update({ accomplishments: accomplishmentsArr }, { where: { id } });
            await user_logs.create({
                user_id: req.user_id,
                log: `Actualizó logros del proyecto ID: ${id}`,
            });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Archive project
router.patch("/projects/:id/archive", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const project = await projects.findOne({ where: { id } });
            if (!project || project.project_status === 'DELETED') {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }
            await projects.update({ project_status: 'ARCHIVED' }, { where: { id } });
            await user_logs.create({
                user_id: req.user_id,
                log: `Archivó proyecto ID: ${id}, NOMBRE: ${project.name}`,
            });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// --- Project Wizard ---

// Step 1: Create or update project (project_id opcional: si viene, actualiza; si no, crea)
router.post("/project/wizard/step1", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { project_id, name, description, objectives, start_date, end_date, accomplishments } = req.body;
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

            let accomplishmentsArr = [];
            if (Array.isArray(accomplishments)) {
                accomplishmentsArr = accomplishments
                    .filter((a) => a && typeof a.text === "string" && typeof a.completed === "boolean")
                    .map((a) => ({ text: String(a.text).trim(), completed: Boolean(a.completed) }));
            }

            const payload = {
                name: name.trim(),
                description: description.trim(),
                objectives: objectives.trim(),
                start_date,
                end_date,
                accomplishments: accomplishmentsArr,
            };

            if (project_id && String(project_id).trim()) {
                const project = await projects.findOne({ where: { id: project_id } });
                if (!project) {
                    return res.status(404).json({ message: "Proyecto no encontrado" });
                }
                await projects.update(payload, { where: { id: project_id } });
                await user_logs.create({
                    user_id: req.user_id,
                    log: `Actualizó proyecto ID: ${project_id}, NOMBRE: ${payload.name}`,
                });
                return res.status(200).json({ project_id: project_id });
            }

            const project = await projects.create({ ...payload, project_status: 'ACTIVE' });
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

// Step 2: Get financing sources
router.get("/project/wizard/step2/:projectId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }
            const rows = await project_financing_sources.findAll({ where: { project_id: projectId } });
            const sourceIds = [...new Set(rows.map((r) => r.financing_source_id))];
            const sources = sourceIds.length > 0
                ? await financing_sources.findAll({ where: { id: { [Op.in]: sourceIds } }, attributes: ["id", "name"] })
                : [];
            const sourceMap = Object.fromEntries(sources.map((s) => [s.id, s.name]));
            const data = rows.map((r) => ({
                id: r.id,
                financing_source_id: r.financing_source_id,
                amount: r.amount,
                description: r.description,
                financing_source_name: sourceMap[r.financing_source_id] ?? null,
            }));
            res.status(200).json({ data });
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

// Step 3: Get donations
router.get("/project/wizard/step3/:projectId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }
            const data = await project_donations.findAll({
                where: { project_id: projectId },
                attributes: ["id", "amount", "description", "donation_type", "created_dt"],
            });
            res.status(200).json({ data });
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

// Step 4: Get expenses
router.get("/project/wizard/step4/:projectId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }
            const data = await project_expenses.findAll({
                where: { project_id: projectId },
                attributes: ["id", "amount", "description"],
            });
            res.status(200).json({ data });
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

// Step 5: Get files
router.get("/project/wizard/step5/:projectId", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }
            const data = await project_files.findAll({
                where: { project_id: projectId },
                attributes: ["id", "file", "description", "created_dt"],
            });
            res.status(200).json({ data });
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
            const customFilename = req.body?.filename?.trim() || null;

            if (!req.file) {
                return res.status(400).json({ message: "Falta el archivo" });
            }

            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) {
                return res.status(404).json({ message: "Proyecto no encontrado" });
            }

            const relativePath = buildProjectFilePath(projectId, customFilename, req.file.originalname);
            const fullPath = path.join(__dirname, "../../files", relativePath);
            const destDir = path.dirname(fullPath);
            fs.mkdirSync(destDir, { recursive: true });
            fs.writeFileSync(fullPath, req.file.buffer);

            const displayName = path.basename(relativePath);

            const pf = await project_files.create({
                project_id: projectId,
                file: relativePath,
                description: description.toString().trim() || displayName,
            });

            await user_logs.create({
                user_id: req.user_id,
                log: `Subió archivo al proyecto ID: ${projectId}, archivo: ${displayName}`,
            });

            res.status(200).json({ ok: true, file_id: pf.id });
        } catch (e) {
            next(e);
        }
    }
);

// Download file (for project detail)
router.get("/project/:projectId/file/:fileId/download", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId, fileId } = req.params;
            const pf = await project_files.findOne({ where: { id: fileId, project_id: projectId } });
            if (!pf) return res.status(404).json({ message: "Archivo no encontrado" });
            const fullPath = path.join(__dirname, "../../files", pf.file);
            if (!fs.existsSync(fullPath)) return res.status(404).json({ message: "Archivo no encontrado en disco" });
            const filename = path.basename(pf.file);
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.sendFile(path.resolve(fullPath));
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

            const fullPath = path.join(__dirname, "../../files", pf.file);
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

// --- Project Detail: Single-item CRUD ---

// Add single financing source
router.post("/project/:projectId/financing-source", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const { financing_source_id, amount, description } = req.body ?? {};
            if (!financing_source_id || (typeof amount !== "number" && typeof amount !== "string")) {
                return res.status(400).json({ message: "Se requieren financing_source_id y amount" });
            }
            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
            const srcExists = await financing_sources.findOne({ where: { id: financing_source_id } });
            if (!srcExists) return res.status(400).json({ message: "Fuente de financiamiento no encontrada" });
            const row = await project_financing_sources.create({
                project_id: projectId,
                financing_source_id,
                amount: Number(amount),
                description: (description ?? "").toString(),
            });
            await user_logs.create({
                user_id: req.user_id,
                log: `Agregó fuente de financiamiento al proyecto ID: ${projectId}`,
            });
            res.status(201).json({ ok: true, id: row.id });
        } catch (e) {
            next(e);
        }
    }
);

// Delete single financing source
router.delete("/project/:projectId/financing-source/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId, id } = req.params;
            const row = await project_financing_sources.findOne({ where: { id, project_id: projectId } });
            if (!row) return res.status(404).json({ message: "Fuente no encontrada" });
            await project_financing_sources.destroy({ where: { id } });
            await user_logs.create({
                user_id: req.user_id,
                log: `Eliminó fuente de financiamiento del proyecto ID: ${projectId}`,
            });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Add single donation
router.post("/project/:projectId/donation", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const { amount, donation_type, description } = req.body ?? {};
            const VALID_TYPES = ["CASH", "SUPPLY"];
            if ((typeof amount !== "number" && typeof amount !== "string") || !VALID_TYPES.includes(donation_type)) {
                return res.status(400).json({ message: "Se requieren amount y donation_type (CASH o SUPPLY)" });
            }
            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
            const row = await project_donations.create({
                project_id: projectId,
                amount: Number(amount),
                description: (description ?? "").toString(),
                donation_type,
            });
            await user_logs.create({
                user_id: req.user_id,
                log: `Agregó donación al proyecto ID: ${projectId}`,
            });
            res.status(201).json({ ok: true, id: row.id });
        } catch (e) {
            next(e);
        }
    }
);

// Delete single donation
router.delete("/project/:projectId/donation/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId, id } = req.params;
            const row = await project_donations.findOne({ where: { id, project_id: projectId } });
            if (!row) return res.status(404).json({ message: "Donación no encontrada" });
            await project_donations.destroy({ where: { id } });
            await user_logs.create({
                user_id: req.user_id,
                log: `Eliminó donación del proyecto ID: ${projectId}`,
            });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

// Add single expense
router.post("/project/:projectId/expense", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId } = req.params;
            const { amount, description } = req.body ?? {};
            if (typeof amount !== "number" && typeof amount !== "string") {
                return res.status(400).json({ message: "Se requiere amount" });
            }
            const project = await projects.findOne({ where: { id: projectId } });
            if (!project) return res.status(404).json({ message: "Proyecto no encontrado" });
            const row = await project_expenses.create({
                project_id: projectId,
                amount: Number(amount),
                description: (description ?? "").toString(),
            });
            await user_logs.create({
                user_id: req.user_id,
                log: `Agregó gasto al proyecto ID: ${projectId}`,
            });
            res.status(201).json({ ok: true, id: row.id });
        } catch (e) {
            next(e);
        }
    }
);

// Delete single expense
router.delete("/project/:projectId/expense/:id", verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            const { projectId, id } = req.params;
            const row = await project_expenses.findOne({ where: { id, project_id: projectId } });
            if (!row) return res.status(404).json({ message: "Gasto no encontrado" });
            await project_expenses.destroy({ where: { id } });
            await user_logs.create({
                user_id: req.user_id,
                log: `Eliminó gasto del proyecto ID: ${projectId}`,
            });
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);