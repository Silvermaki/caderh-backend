import jwt from "jsonwebtoken";
import { projects_agents } from "./sequelize.js";

export const verify_token = (req, res, next) => {
    if (req.headers['authorization']) {
        var token = req.headers['authorization'].replace("Bearer ", "");
        if (!token) {
            return res.status(403).send({ auth: false, title: "Unauthorized", message: "Forbidden" });
        }
        jwt.verify(token, process.env.JWT_KEY, function (err, decoded) {
            if (err) {
                return res.status(403).send({ auth: false, title: "Unauthorized", message: "Forbidden" });
            }
            req.user_id = decoded.id;
            req.user_role = decoded.role;
            next();
        });
    } else {
        return res.status(403).send({ auth: false, title: "Unauthorized", message: "Forbidden" });
    }
};

export const is_admin = (req, res, next) => {
    if (req.user_role === 'ADMIN') {
        next();
    } else {
        return res.status(403).send({ auth: false, title: "Unauthorized", message: "Forbidden" });
    }
}

export const is_supervisor = (req, res, next) => {
    if (req.user_role === 'MANAGER' || req.user_role === 'ADMIN') {
        next();
    } else {
        return res.status(403).send({ auth: false, title: "Unauthorized", message: "Forbidden" });
    }
}

export const is_authenticated = (req, res, next) => {
    if (req.user_role === 'ADMIN' || req.user_role === 'MANAGER' || req.user_role === 'USER') {
        next();
    } else {
        return res.status(403).send({ auth: false, title: "Unauthorized", message: "Forbidden" });
    }
}

export const check_project_assignment = async (req, res, project) => {
    if (req.user_role === 'ADMIN' || req.user_role === 'MANAGER') return true;
    if (req.user_role === 'USER') {
        const assignment = await projects_agents.findOne({
            where: { project_id: project.id, agent_id: req.user_id }
        });
        if (assignment) return true;
    }
    res.status(403).json({ message: "No tienes permiso para modificar este proyecto" });
    return false;
}