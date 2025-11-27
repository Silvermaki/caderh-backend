import { Router } from "express";
import { router as authApi } from './auth/auth.api.js';
import { router as adminApi } from './admin/admin.api.js';

export const router = Router();

router.use("/auth", authApi);
router.use("/admin", adminApi);

router.get('/', async (req, res) => {
    res.send("CADERH API server");
});