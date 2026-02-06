import { Router } from "express";
import { crypto } from "../../utils/crypto.js";
import { users, user_logs } from "../../utils/sequelize.js";
import { mailer } from "../../utils/mailer.js";
import { verify_token, is_supervisor } from "../../utils/token.js";
import { Op } from 'sequelize';
export const router = Router();

router.get('/', (req, res) => {
    res.send("CADERH SUPERVISOR API");
});

router.post('/test', verify_token, is_supervisor,
    async (req, res, next) => {
        try {
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);