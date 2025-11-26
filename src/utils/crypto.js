import cryptoRef from 'crypto';

const algorithm = 'aes-256-cbc';
const key = cryptoRef.randomBytes(32);
const iv = cryptoRef.randomBytes(16);

function encrypt(text) {
    var cipher = cryptoRef.createCipheriv(algorithm, Buffer.from(process.env.CRYPTO_PW_KEY), process.env.CRYPTO_PW_IV)
    var crypted = cipher.update(text, 'utf8', 'hex')
    crypted += cipher.final('hex');
    return crypted;
}

function decrypt(text) {
    var decipher = cryptoRef.createDecipheriv(algorithm, Buffer.from(process.env.CRYPTO_PW_KEY), process.env.CRYPTO_PW_IV)
    var dec = decipher.update(text, 'hex', 'utf8')
    dec += decipher.final('utf8');
    return dec;
}

function encryptPassword(text) {
    var cipher = cryptoRef.createCipheriv(algorithm, Buffer.from(process.env.CRYPTO_PW_KEY), process.env.CRYPTO_PW_IV)
    var crypted = cipher.update(text, 'utf8', 'hex')
    crypted += cipher.final('hex');
    return crypted;
}

function decryptPassword(text) {
    var decipher = cryptoRef.createDecipheriv(algorithm, Buffer.from(process.env.CRYPTO_PW_KEY), process.env.CRYPTO_PW_IV)
    var dec = decipher.update(text, 'hex', 'utf8')
    dec += decipher.final('utf8');
    return dec;
}


function generateRecoveryCode(size) {
    var result = '';
    var characters = '0123456789';
    for (var i = 0; i < size; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

export const crypto = {
    encrypt,
    decrypt,
    encryptPassword,
    decryptPassword,
    generateRecoveryCode
}