import jwt from "jsonwebtoken";

export const verify_token = (req, res, next) => {
    if (req.headers['authorization']) {
        var token = req.headers['authorization'].replace("Bearer ", "");
        if (!token) {
            return res.status(403).send({ auth: false, title: "Forbidden", message: "Forbidden" });
        }
        jwt.verify(token, process.env.JWT_KEY, function (err, decoded) {
            if (err) {
                return res.status(403).send({ auth: false, title: "Forbidden", message: "Forbidden" });
            }
            req.id_user = decoded.id;
            req.user_role = decoded.role;
            req.id_townhall = decoded.id_townhall;
            next();
        });
    } else {
        return res.status(403).send({ auth: false, title: "Unauthorized", message: "Forbidden" });
    }
}