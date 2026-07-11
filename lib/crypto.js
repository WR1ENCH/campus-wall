// ===== lib/crypto.js - 密码哈希/加密/Token签名 =====
const crypto = require('crypto');

const SALT_LEN = 16;
const ITERATIONS = 100000;

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hash] = storedHash.split(':');
  const inputHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(inputHash, 'hex'));
}

// AES-256-CBC 实名信息加密
if (!process.env.CERT_ENC_SECRET) {
  console.error('[SECURITY] ⚠️ 未设置环境变量 CERT_ENC_SECRET，已使用随机密钥启动。');
  console.error('[SECURITY]    重启后已加密的实名数据将无法解密！请在 .env 中配置 CERT_ENC_SECRET。');
  console.error('[SECURITY]    生成密钥: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}
const CERT_ENC_KEY = crypto.createHash('sha256')
  .update(process.env.CERT_ENC_SECRET || crypto.randomBytes(32).toString('hex'))
  .digest();

function encryptCert(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', CERT_ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

function decryptCert(cipherText) {
  if (typeof cipherText !== 'string' || !cipherText.includes(':')) return null;
  const [ivHex, encHex] = cipherText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', CERT_ENC_KEY, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (e) {}
  const LEGACY_KEY = crypto.createHash('sha256').update('campus-wall-cert-secret-2024').digest();
  if (!CERT_ENC_KEY.equals(LEGACY_KEY)) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', LEGACY_KEY, iv);
      return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch (e) {}
  }
  return null;
}

// Token 签名
const TOKEN_SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64');
  return data + '.' + hmac;
}

function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64');
  const sigBuf = Buffer.from(sig, 'base64');
  const expBuf = Buffer.from(expectedSig, 'base64');
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try { return JSON.parse(Buffer.from(data, 'base64').toString()); } catch { return null; }
}

function makeToken(admin) {
  return signToken({ id: admin.id, name: admin.name, role: admin.role, loginAt: Date.now() });
}

function makeUserToken(user) {
  return signToken({ id: user.id, nickname: user.nickname, loginAt: Date.now() });
}

function verifyUserToken(token) {
  const session = verifySignedToken(token);
  if (!session || !session.id || !session.loginAt) return null;
  if (Date.now() - session.loginAt > 7 * 24 * 3600 * 1000) return null;
  return session;
}

function getDisplayZhixueStatus(user) {
  const status = user.zhixueStatus || null;
  if (status === 'approved' && !user.zhixueReviewedBy) return null;
  return status;
}

module.exports = {
  hashPassword, verifyPassword,
  encryptCert, decryptCert,
  signToken, verifySignedToken,
  makeToken, makeUserToken, verifyUserToken,
  getDisplayZhixueStatus
};
