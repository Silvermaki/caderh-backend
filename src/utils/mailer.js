import { createTransport } from 'nodemailer';

const transporter = createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAILUSER,
        pass: process.env.EMAILPW
    }
});

async function sendRecoveryCode(to, name, code) {
    try {
        const options = {
            from: `"CADERH" <${process.env.EMAILUSER}>`,
            to: to,
            subject: 'Código de Verificación',
            html: `Estimado ${name},<br>Tu código de verificación para el sistema estadístico de CADERH es:<br><b>${code}</b>`,
        }
        return await transporter.sendMail(options);
    } catch (error) {
        console.log("Error sending email", error);
        return;
    }
}

async function sendAccountEmail(to, name, pw, role) {
    try {
        const options = {
            from: `"CADERH" <${process.env.EMAILUSER}>`,
            to: to,
            subject: 'Credenciales de Acceso',
            html: `Estimado ${name},<br>Tus credenciales bajo el rol de <b>${role}</b> para el sistema estadístico de CADERH son:<br>Url: <a href='https://${process.env.SITE_URL}'>https://${process.env.SITE_URL}</a><br>Usuario: <b>${to}</b><br>Contraseña: <b>${pw}</b>`,
        }
        return await transporter.sendMail(options);
    } catch (error) {
        console.log("Error sending email", error);
        return;
    }

}

export const mailer = {
    sendRecoveryCode,
    sendAccountEmail
}