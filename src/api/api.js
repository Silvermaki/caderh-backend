import { Router } from "express";
import { router as authApi } from './auth/auth.api.js';
import { router as adminApi } from './admin/admin.api.js';
import { router as supervisorApi } from './supervisor/supervisor.api.js';

export const router = Router();

router.use("/auth", authApi);
router.use("/admin", adminApi);
router.use("/supervisor", supervisorApi);

router.get('/', async (req, res) => {
    res.send("CADERH API server");
});