import { Router } from "express";
import { router as authApi } from './auth/auth.api.js';

export const router = Router();

router.use("/auth", authApi);

router.get('/', async (req, res) => {
    res.send("CADERH API server");
});