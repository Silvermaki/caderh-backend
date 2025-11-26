import { Router } from "express";
import { crypto } from "../../utils/crypto.js";
import { users } from "../../utils/sequelize.js";
import { mailer } from "../../utils/mailer.js";
import { verify_token } from "../../utils/token.js";
import jwt from "jsonwebtoken";

export const router = Router();

router.get('/', (req, res) => {
    res.send("CADERH AUTH API");
});

router.post('/login',
    async (req, res, next) => {
        try {
            const { email, password } = req.body;
            console.log(email);
            console.log(password);
            if (email && password) {
                const user = await users.findOne({
                    where: {
                        email: email,
                        password: crypto.encryptPassword(password),
                        disabled: false
                    }
                });
                if (user) {
                    let userData = user.toJSON();
                    var token = jwt.sign({ id: userData.id, role: userData.role }, process.env.JWT_KEY);
                    res.status(200).json({
                        session: token,
                        email: userData.email,
                        name: userData.name,
                        role: userData.role,
                        first_login: userData.first_login
                    })
                } else {
                    res.status(400).json({ message: 'Incorrect username or password' });
                }
            } else {
                res.status(400).json({ message: 'Incorrect username or password' });
            }
        } catch (e) {
            next(e);
        }
    }
);

router.post('/new-pass', verify_token,
    async (req, res, next) => {
        try {
            const { password } = req.body;
            if (password) {
                await users.update({
                    password: crypto.encryptPassword(password),
                    first_login: false,
                    verification_code: null
                }, {
                    where: { id: req.user_id }
                });
                res.status(200).json({ ok: true });
            } else {
                res.status(400).json({ message: 'Wrong password format' });
            }
        } catch (e) {
            next(e);
        }
    }
);

router.post('/recover',
    async (req, res, next) => {
        try {
            const { email } = req.body;
            console.log(email);
            if (email) {
                const user = await users.findOne({
                    where: {
                        email: email,
                        disabled: false
                    }
                });
                if (user) {
                    let userData = user.toJSON();
                    const verificationCode = crypto.generateRecoveryCode(6);
                    await users.update({
                        verification_code: verificationCode
                    }, {
                        where: { id: userData.id }
                    });
                    await mailer.sendRecoveryCode(email, userData.name, verificationCode);
                }
            }
            res.status(200).json({ ok: true });
        } catch (e) {
            next(e);
        }
    }
);

router.post('/recover_verify',
    async (req, res, next) => {
        try {
            const { email, code } = req.body;
            if (email && code) {
                const user = await users.findOne({
                    where: {
                        email: email,
                        verification_code: code,
                        disabled: false
                    }
                });
                if (user) {
                    let userData = user.toJSON();
                    res.status(200).json({ id: crypto.encrypt(userData.id) });
                } else {
                    res.status(400).json({ message: "Código de verificación incorrecto" });
                }
            } else {
                res.status(400).json({ message: "Faltan campos requeridos" });
            }
        } catch (e) {
            next(e);
        }
    }
);

router.post('/recover_password',
    async (req, res, next) => {
        try {
            const { id, password } = req.body;
            if (id && password) {
                await users.update({
                    password: crypto.encryptPassword(password),
                    verification_code: null
                }, {
                    where: { id: crypto.decrypt(id) }
                });
                res.status(200).json();
            } else {
                res.status(400).json({ message: "Faltan campos requeridos" });
            }
        } catch (e) {
            next(e);
        }
    }
);

router.post('/resend_verification_email',
    async (req, res, next) => {
        try {
            const { email } = req.body;
            if (email) {
                const user = await users.findOne({
                    where: {
                        email: email,
                        disabled: false
                    }
                });
                if (user) {
                    let userData = user.toJSON();
                    if (userData.verification_code) {
                        await mailer.sendRecoveryCode(email, userData.name, userData.verification_code);
                    }
                }
            }
            res.status(200).json();
        } catch (e) {
            next(e);
        }
    }
);