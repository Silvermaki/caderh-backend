import express from 'express';
import 'dotenv/config';
import { router } from './api/api.js';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { verify_token } from './utils/token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// CORS restringido por entorno: CORS_ORIGINS es una lista separada por comas
// (en prod, el dominio del frontend; en dev, localhost). Si no está definida,
// solo se permite localhost:3000 para no quedar abierto por accidente.
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        // Permite peticiones sin Origin (curl, Power BI, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origen no permitido por CORS'));
    },
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: false }));
app.use(bodyParser.json({ limit: "50mb" }));
app.options("*", cors(corsOptions));

app.use("/api", router);

// Archivos: requieren token. El frontend descarga vía endpoints de la API
// (fetch + Authorization); estas rutas quedan protegidas igual.
app.use('/files', verify_token, express.static(path.join(__dirname, '/files')));

app.get("/download/:file(*)", verify_token, (req, res) => {
    let file = req.params.file;
    var fileLocation = path.join("./files", file);
    if (/\.\.\//g.test(file)) {
        res
            .status(500)
            .send({
                title: "Internal Server Error",
                message: "Internal Server Error",
            });
    } else {
        res.download(fileLocation, file);
    }
});

app.use((err, req, res, next) => {
    if (err && err.message === 'Origen no permitido por CORS') {
        return res.status(403).json({ message: "Origen no permitido" });
    }
    console.log(`${new Date().toLocaleString()} - ${err.name}: ${err.message}`);
    res.status(500).json({ message: "Internal Server Error" });
});

app.listen(process.env.PORT, '127.0.0.1', () => {
    console.log(`${new Date().toLocaleString()} - Server is running at http://127.0.0.1:${process.env.PORT}`);
});

process.on('uncaughtException', function (err) {
    console.log(`${new Date().toLocaleString()} - Uncaught Exception - ${err.name}: ${err.message}`);
});
