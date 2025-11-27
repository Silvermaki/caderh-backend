import { Router } from "express";
import { crypto } from "../../utils/crypto.js";
import { users } from "../../utils/sequelize.js";
import { mailer } from "../../utils/mailer.js";
import { verify_token, is_admin } from "../../utils/token.js";
import { Op } from 'sequelize';
export const router = Router();

router.get('/', (req, res) => {
    res.send("CADERH ADMIN API");
});

router.post('/user', verify_token, is_admin,
    async (req, res, next) => {
        try {
            const { email, name, role } = req.body;
            if (email && name && role) {
                const user = await users.findOne({
                    where: {
                        email: email,
                        disabled: false
                    }
                });
                if (user) {
                    res.status(400).json({ message: 'Correo electrónico en uso' });
                } else {
                    let newPass = crypto.generatePassword(8);
                    await users.create({
                        email,
                        name,
                        role,
                        password: crypto.encryptPassword(newPass),
                    });
                    await mailer.sendAccountEmail(email, name, newPass, role === 'ADMIN' ? 'Administrador' : 'Agente');
                    res.status(200).json({ ok: true });
                }
            } else {
                res.status(400).json({ message: 'Faltan campos requeridos' });
            }
        } catch (e) {
            next(e);
        }
    }
);

router.get('/user', verify_token, is_admin,
    async (req, res, next) => {
        try {
            const { id } = req.query;
            if (id) {
                const user = await users.findOne({
                    where: {
                        id: id
                    }
                });
                if (user) {
                    res.status(200).json({ data: user });
                } else {
                    res.status(400).json({ message: 'El usuario seleccionado no existe' });
                }
            } else {
                res.status(400).json({ message: 'Faltan campos requeridos' });
            }
        } catch (e) {
            next(e);
        }
    }
);

router.get('/users', verify_token, is_admin,
    async (req, res, next) => {
        try {
            const { limit, offset, sort, desc, search } = req.query;
            if (limit && limit <= 100) {
                const result = await users.findAndCountAll({
                    attributes: ['id', 'email', 'name', 'role', 'disabled', 'first_login', 'created_dt'],
                    where: search ? { [Op.or]: { email: { [Op.iLike]: `%${search}%` }, name: { [Op.iLike]: `%${search}%` } } } : undefined,
                    limit,
                    offset: offset ?? 0
                });
                res.status(200).json({ data: result.rows, count: result.count });
            } else {
                res.status(400).json({ message: 'Faltan campos requeridos' });
            }
        } catch (e) {
            next(e);
        }
    }
);

router.put('/user', verify_token, is_admin,
    async (req, res, next) => {
        try {
            const { id, name, role, disabled } = req.body;
            if (id && name && role && disabled) {
                await users.update({
                    name: name,
                    role: role,
                    disabled: disabled === 'ACTIVE' ? false : true
                }, {
                    where: { id: id }
                });
                res.status(200).json({ ok: true });
            } else {
                res.status(400).json({ message: 'Faltan campos requeridos' });
            }
        } catch (e) {
            next(e);
        }
    }
);