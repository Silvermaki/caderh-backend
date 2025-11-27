import jwt from "jsonwebtoken";

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