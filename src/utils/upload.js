import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".jpg", ".jpeg", ".png"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function projectFileStorage() {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            const projectId = req.params.projectId;
            const dest = path.join(__dirname, "../files/projects", projectId);
            fs.mkdirSync(dest, { recursive: true });
            cb(null, dest);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const safeExt = ALLOWED_EXTENSIONS.includes(ext) ? ext : ".bin";
            cb(null, crypto.randomUUID() + safeExt);
        },
    });
}

function fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        cb(new Error("Tipo de archivo no permitido. Permitidos: pdf, docx, xlsx, jpg, png"));
        return;
    }
    cb(null, true);
}

export const projectFileUpload = multer({
    storage: projectFileStorage(),
    fileFilter,
    limits: { fileSize: MAX_FILE_SIZE },
});
