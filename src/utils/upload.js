import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".jpg", ".jpeg", ".png"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        cb(new Error("Tipo de archivo no permitido. Permitidos: pdf, docx, xlsx, jpg, png"));
        return;
    }
    cb(null, true);
}

export const projectFileUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE },
});

export const instructorFileUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE },
});

export function buildInstructorFilePath(instructorId, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : ".bin";
    return path.join("instructors", String(instructorId), "cv" + safeExt);
}

export const studentFileUpload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE },
});

export function buildStudentFilePath(studentId, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : ".bin";
    return path.join("students", String(studentId), "cv" + safeExt);
}

export function sanitizeFilename(name) {
    return name.replace(/[/\\?%*:|"<>]/g, "_").replace(/\.\./g, "");
}

export function buildProjectFilePath(projectId, desiredName, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : ".bin";
    const base = sanitizeFilename(desiredName?.trim() || path.basename(originalName, ext) || "file");
    const filePath = path.join(__dirname, "../files/projects", projectId, base + safeExt);
    if (fs.existsSync(filePath)) {
        const uniqueBase = base + "_" + crypto.randomUUID().slice(0, 8);
        return path.join("projects", projectId, uniqueBase + safeExt);
    }
    return path.join("projects", projectId, base + safeExt);
}
