import express from 'express';
import 'dotenv/config';
import { router } from './api/api.js';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ limit: "50mb", extended: false }));
app.use(bodyParser.json({ limit: "50mb" }));
app.options("*", cors());

app.use("/api", router);

app.use('/files', express.static(path.join(__dirname, '/files')));

app.get("/download/:file(*)", (req, res) => {
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
    console.log(`${new Date().toLocaleString()} - ${err.name}: ${err.message}`);
    res.status(500).json({ message: "Internal Server Error" });
});

app.listen(process.env.PORT, '127.0.0.1', () => {
    console.log(`${new Date().toLocaleString()} - Server is running at http://127.0.0.1:${process.env.PORT}`);
});

process.on('uncaughtException', function (err) {
    console.log(`${new Date().toLocaleString()} - Uncaught Exception - ${err.name}: ${err.message}`);
});