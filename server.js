const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const svgCaptcha = require('svg-captcha');
const { check: checkSensitive, reload: reloadSensitive, getStats: getSensitiveStats, WHITELIST_FILE, saveWhitelist } = require('./sensitiveWords');
const { check: checkBullyingNames, addName: addBullyingName, removeName: removeBullyingName, getAll: getAllBullyingNames, reload: reloadBullyingNames } = require('./bullyingNames');

// ===== 崩溃保护 =====
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught Exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH] Unhandled Rejection:', reason);
});

// 智学网自动登录模块（需 Playwright / Chromium）
let loginZhixue = null;
try {
  const zhixueModule = require('./zhixue');
  loginZhixue = zhixueModule.loginZhixue;
  console.log('[zhixue] 智学网模块加载成功');
} catch (e) {
  console.warn('[zhixue] 智学网模块未加载（缺失 Playwright 或 zhixue.js）：', e.message);
}

// ===== 密码哈希工具（SHA-256 + 随机盐，无需外部依赖）=====
const SALT_LEN = 16;
const ITERATIONS = 100000; // PBKDF2 迭代次数，防暴力

/**
 * 生成密码哈希
 * @param {string} password 明文密码
 * @returns {string} salt:hash 格式的哈希串
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

/**
 * 验证密码
 * @param {string} password 用户输入的明文密码
 * @param {string} storedHash 存储的 salt:hash 串
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hash] = storedHash.split(':');
  const inputHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(inputHash, 'hex'));
}

/**
 * 获取安全的同学认证展示状态（已废弃——统一使用 getSafeCertStatus）
 * 校验：approved 必须有审核记录（zhixueReviewedBy），否则降级
 * @param {object} user 用户对象
 * @returns {string|null} 'approved' | 'pending' | 'rejected' | null
 */
function getDisplayZhixueStatus(user) {
  const status = user.zhixueStatus || null;
  if (status === 'approved' && !user.zhixueReviewedBy) {
    return null;
  }
  return status;
}

// ===== 实名信息对称加密（AES-256-CBC）=====
// 密钥从环境变量读取，不存在则每次启动随机生成（重启后密文失效，可接受）
const CERT_ENC_KEY = crypto.createHash('sha256')
  .update(process.env.CERT_ENC_SECRET || 'campus-wall-cert-secret-2024')
  .digest(); // 32字节 key

/**
 * 加密实名信息
 * @param {string} plainText 明文（姓名/班级）
 * @returns {string} iv:ciphertext (hex)
 */
function encryptCert(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', CERT_ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

/**
 * 解密实名信息
 * @param {string} cipherText iv:ciphertext (hex)
 * @returns {string|null}
 */
function decryptCert(cipherText) {
  if (!cipherText || !cipherText.includes(':')) return null;
  try {
    const [ivHex, encHex] = cipherText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', CERT_ENC_KEY, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch (e) {
    return null;
  }
}

const app = express();
app.set('trust proxy', true); // 信任代理，从 X-Forwarded-For 读取真实客户端IP
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedbacks.json');
const BULLYING_FILE = path.join(DATA_DIR, 'bullying.json');
const LOGS_FILE = path.join(DATA_DIR, 'login_logs.json');
const CREDIT_LOGS_FILE = path.join(DATA_DIR, 'credit_logs.json');
const CREDIT_CARDS_FILE = path.join(DATA_DIR, 'credit_cards.json');
const QA_FILE = path.join(DATA_DIR, 'qa_questions.json');
const QA_ANSWERS_FILE = path.join(DATA_DIR, 'qa_answers.json');
const PICKUP_AUCTION_FILE = path.join(DATA_DIR, 'pickup_auctions.json');
const PICKUP_REPORT_FILE = path.join(DATA_DIR, 'pickup_reports.json');

// 获取真实客户端IP（支持反向代理/WAF穿透）
function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket.remoteAddress || '-';
}

// 中间件
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// 全局输入过滤：禁止特殊字符（对 JSON body 和 URL query 生效）
const SPECIAL_CHAR_REGEX = /[~!@#$%^&*()+=\[\]{}|\\;:'",./<>?`]/;
function sanitizeString(val) {
  if (typeof val === 'string') return val.replace(/[~!@#$%^&*()+=\[\]{}|\\;:'",./<>?`]/g, '');
  if (Array.isArray(val)) return val.map(sanitizeString);
  if (val && typeof val === 'object') {
    const cleaned = {};
    for (const k in val) cleaned[k] = sanitizeString(val[k]);
    return cleaned;
  }
  return val;
}
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    // 排除包含 base64、富文本/Markdown 或特殊格式的字段不过滤
    const { avatar, manualImages, manualEmail, challenge, prefix, nonce, images, content, title, text, body, reason, answer, question, description, ...rest } = req.body;
    req.body = {
      ...sanitizeString(rest),
      ...(avatar !== undefined ? { avatar } : {}),
      ...(manualImages !== undefined ? { manualImages } : {}),
      ...(manualEmail !== undefined ? { manualEmail } : {}),
      ...(challenge !== undefined ? { challenge } : {}),
      ...(prefix !== undefined ? { prefix } : {}),
      ...(nonce !== undefined ? { nonce } : {}),
      ...(images !== undefined ? { images } : {}),
      ...(content !== undefined ? { content } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(text !== undefined ? { text } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(reason !== undefined ? { reason } : {}),
      ...(answer !== undefined ? { answer } : {}),
      ...(question !== undefined ? { question } : {}),
      ...(description !== undefined ? { description } : {})
    };
  }
  next();
});

app.use(express.static(__dirname)); // 静态文件服务

const CONTENT_MAX_LENGTH = 400; // 帖子/评论字数上限

// ===== 数据读写 =====
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readPosts() {
  try {
    ensureDir();
    if (!fs.existsSync(POSTS_FILE)) {
      fs.writeFileSync(POSTS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取帖子失败:', e);
    return [];
  }
}

function writePosts(posts) {
  try {
    ensureDir();
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入帖子失败:', e);
  }
}

function readAdmins() {
  try {
    ensureDir();
    if (!fs.existsSync(ADMINS_FILE)) {
      return []; // 不自动创建，等待首次设置
    }
    return JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取管理员失败:', e);
    return [];
  }
}

function hasAdmins() { return db.readAdmins().length > 0; }

function writeAdmins(admins) {
  try {
    ensureDir();
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入管理员失败:', e);
  }
}

// ===== 管理员认证中间件 =====
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.json({ ok: false, msg: '未登录，请先登录', code: 'NOT_LOGIN' });
  try {
    const session = JSON.parse(Buffer.from(token, 'base64').toString());
    if (!session.id || !session.loginAt) {
      return res.json({ ok: false, msg: '登录信息无效', code: 'INVALID_TOKEN' });
    }
    // token 有效期 24 小时
    if (Date.now() - session.loginAt > 24 * 3600 * 1000) {
      return res.json({ ok: false, msg: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });
    }
    req.admin = session;
    next();
  } catch {
    return res.json({ ok: false, msg: '登录信息无效', code: 'INVALID_TOKEN' });
  }
}

function requireSuper(req, res, next) {
  if (req.admin.role !== 'super') {
    return res.json({ ok: false, msg: '权限不足，仅超级管理员可用', code: 'FORBIDDEN' });
  }
  next();
}

// 生成 token
function makeToken(admin) {
  return Buffer.from(JSON.stringify({
    id: admin.id,
    name: admin.name,
    role: admin.role,
    loginAt: Date.now()
  })).toString('base64');
}

// ===== 初始化接口 =====

// 检查是否需要初始化（是否存在管理员）
app.get('/api/admin/check-init', (req, res) => {
  res.json({ ok: true, data: { needInit: !hasAdmins() } });
});

// 创建首个管理员（仅在没有任何管理员时可用）
app.post('/api/admin/init', (req, res) => {
  // 如果已有管理员，拒绝初始化
  if (hasAdmins()) {
    return res.json({ ok: false, msg: '系统已初始化，请直接登录', code: 'ALREADY_INIT' });
  }

  const { id, password, name } = req.body;

  // 验证账号格式（3-20位字母、数字、下划线）
  if (!id || !/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
    return res.json({ ok: false, msg: '账号格式：3-20位字母、数字、下划线', code: 'INVALID_ID' });
  }

  // 验证密码（至少6位）
  if (!password || password.length < 6) {
    return res.json({ ok: false, msg: '密码至少6位', code: 'INVALID_PWD' });
  }

  // 验证昵称
  if (!name || name.trim().length === 0) {
    return res.json({ ok: false, msg: '请输入管理员昵称', code: 'INVALID_NAME' });
  }

  // 创建首个超级管理员
  const newAdmin = {
    id: id.trim(),
    password: hashPassword(password),
    name: name.trim(),
    role: 'super',
    createdAt: new Date().toISOString()
  };

  writeAdmins([newAdmin]);

  console.log(`✅ 首个管理员已创建: ${id}`);

  res.json({
    ok: true,
    data: {
      token: makeToken(newAdmin),
      id: newAdmin.id,
      name: newAdmin.name,
      role: newAdmin.role
    }
  });
});

// ===== 管理员 API =====

// 登录
app.post('/api/admin/login', (req, res) => {
  const { id, password } = req.body;
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'] || '-';

  if (!id || !password) {
    addLoginLog('admin', null, false, ip, ua);
    return res.json({ ok: false, msg: '请输入账号和密码' });
  }

  const admins = readAdmins();
  const admin = admins.find(a => a.id === id);
  if (!admin || !verifyPassword(password, admin.password)) {
    addLoginLog('admin', id, false, ip, ua);
    return res.json({ ok: false, msg: '账号或密码错误' });
  }

  addLoginLog('admin', admin.name, true, ip, ua);
  res.json({
    ok: true,
    data: {
      token: makeToken(admin),
      id: admin.id,
      name: admin.name,
      role: admin.role
    }
  });
});

// 修改密码（需输入旧密码确认）
app.post('/api/admin/change-pwd', requireAdmin, (req, res) => {
  const { oldPwd, newPwd } = req.body;
  if (!oldPwd || !newPwd) return res.json({ ok: false, msg: '请填写完整' });
  if (newPwd.length < 6) return res.json({ ok: false, msg: '新密码至少6位' });

  const admins = readAdmins();
  const idx = admins.findIndex(a => a.id === req.admin.id);
  if (idx === -1) return res.json({ ok: false, msg: '管理员不存在' });

  // 验证旧密码
  if (!verifyPassword(oldPwd, admins[idx].password)) {
    return res.json({ ok: false, msg: '旧密码错误' });
  }

  // 更新密码
  admins[idx].password = hashPassword(newPwd);
  writeAdmins(admins);

  res.json({ ok: true, msg: '密码修改成功，请重新登录' });
});

// 验证当前登录状态
app.get('/api/admin/me', requireAdmin, (req, res) => {
  const admins = readAdmins();
  const admin = admins.find(a => a.id === req.admin.id);
  if (!admin) return res.json({ ok: false, msg: '管理员不存在', code: 'NOT_FOUND' });
  res.json({ ok: true, data: { id: admin.id, name: admin.name, role: admin.role } });
});

// 获取登录记录
app.get('/api/admin/login-logs', requireAdmin, (req, res) => {
  const logs = readLogs();
  res.json({ ok: true, data: logs });
});

// 获取管理员列表（仅超级管理员）
app.get('/api/admin/list', requireAdmin, requireSuper, (req, res) => {
  const admins = readAdmins();
  res.json({
    ok: true,
    data: admins.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      createdAt: a.createdAt
    }))
  });
});

// 添加管理员（仅超级管理员）
app.post('/api/admin/add', requireAdmin, requireSuper, (req, res) => {
  const { id, password, name, role } = req.body;
  if (!id || !password || !name) {
    return res.json({ ok: false, msg: '账号、密码、昵称均为必填项' });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
    return res.json({ ok: false, msg: '账号仅支持 3-20 位字母、数字、下划线' });
  }
  if (password.length < 6) {
    return res.json({ ok: false, msg: '密码至少 6 位' });
  }
  if (!['super', 'admin'].includes(role)) {
    return res.json({ ok: false, msg: '角色仅支持 super（最高管理员）或 admin（管理员）' });
  }

  const admins = readAdmins();
  if (admins.find(a => a.id === id)) {
    return res.json({ ok: false, msg: '账号已存在' });
  }

  admins.push({
    id,
    password: hashPassword(password),
    name,
    role,
    createdAt: new Date().toISOString()
  });
  writeAdmins(admins);
  res.json({ ok: true, data: { id, name, role, createdAt: new Date().toISOString() } });
});

// 删除管理员（仅超级管理员，不能删除自己）
app.delete('/api/admin/:id', requireAdmin, requireSuper, (req, res) => {
  const { id } = req.params;
  if (id === 'wr1Ench') {
    return res.json({ ok: false, msg: '禁止删除最高管理员账号' });
  }
  if (id === req.admin.id) {
    return res.json({ ok: false, msg: '不能删除自己' });
  }

  let admins = readAdmins();
  const before = admins.length;
  admins = admins.filter(a => a.id !== id);
  if (admins.length === before) {
    return res.json({ ok: false, msg: '管理员不存在' });
  }
  writeAdmins(admins);
  res.json({ ok: true });
});

// 修改管理员信息（仅超级管理员）
app.put('/api/admin/:id', requireAdmin, requireSuper, (req, res) => {
  const { id } = req.params;
  const { password, name, role } = req.body;

  const admins = readAdmins();
  const admin = admins.find(a => a.id === id);
  if (!admin) return res.json({ ok: false, msg: '管理员不存在' });

  if (password !== undefined) {
    if (password.length < 6) return res.json({ ok: false, msg: '密码至少 6 位' });
    admin.password = hashPassword(password);
  }
  if (name !== undefined) admin.name = name;
  if (role !== undefined) {
    if (!['super', 'admin'].includes(role)) return res.json({ ok: false, msg: '角色无效' });
    if (id === 'wr1Ench' && role !== 'super') return res.json({ ok: false, msg: '禁止修改最高管理员角色' });
    admin.role = role;
  }

  writeAdmins(admins);
  res.json({ ok: true, data: { id: admin.id, name: admin.name, role: admin.role } });
});

// ===== 通用工具函数 =====
function hasSpecialChars(str) {
  return /[<>\"'&]/.test(str);
}

// 解析 datetime-local 格式（支持 YYYY-MM-DDTHH:mm 或 YYYY-MM-DDTHHmm）
function parseLocalDateTime(str) {
  if (!str) return null;
  // 支持标准格式 YYYY-MM-DDTHH:mm 和非标准格式 YYYY-MM-DDTHHmm
  let match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  // 兼容没有冒号的格式
  match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  return null;
}

// ===== 用户数据读写 =====
function readUsers() {
  try {
    ensureDir();
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取用户失败:', e);
    return [];
  }
}

function writeUsers(users) {
  try {
    ensureDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入用户失败:', e);
  }
}

// ===== 浏览器信任令牌 =====
const TRUST_TOKENS_FILE = path.join(DATA_DIR, 'trust_tokens.json');

function readTrustTokens() {
  try {
    ensureDir();
    if (!fs.existsSync(TRUST_TOKENS_FILE)) {
      fs.writeFileSync(TRUST_TOKENS_FILE, '{}', 'utf-8');
      return {};
    }
    return JSON.parse(fs.readFileSync(TRUST_TOKENS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取信任令牌失败:', e);
    return {};
  }
}

function writeTrustTokens(tokens) {
  try {
    ensureDir();
    fs.writeFileSync(TRUST_TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入信任令牌失败:', e);
  }
}

function readLogs() {
  try {
    ensureDir();
    if (!fs.existsSync(LOGS_FILE)) {
      fs.writeFileSync(LOGS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取登录记录失败:', e);
    return [];
  }
}

function writeLogs(logs) {
  try {
    ensureDir();
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入登录记录失败:', e);
  }
}

function addLoginLog(type, account, success, ip, ua) {
  const logs = readLogs();
  logs.unshift({
    id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    type,
    account: account || '未登录用户',
    success,
    ip: ip || '-',
    ua: ua || '-',
    time: new Date().toISOString()
  });
  if (logs.length > 500) logs.splice(500);
  writeLogs(logs);
}

// 生成用户 token
function makeUserToken(user) {
  return Buffer.from(JSON.stringify({
    id: user.id,
    nickname: user.nickname,
    loginAt: Date.now()
  })).toString('base64');
}

// 验证用户 token
function verifyUserToken(token) {
  try {
    const session = JSON.parse(Buffer.from(token, 'base64').toString());
    if (!session.id || !session.loginAt) return null;
    if (Date.now() - session.loginAt > 7 * 24 * 3600 * 1000) return null; // 7天有效期
    return session;
  } catch {
    return null;
  }
}

// ===== 人机验证（SVG 验证码）=====
const captchaStore = new Map();
// 发帖频率限制（5分钟内最多发3篇，超出需验证码）
const postRateLimit = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of postRateLimit) {
    const filtered = timestamps.filter(ts => now - ts < 600000);
    if (filtered.length === 0) {
      postRateLimit.delete(userId);
    } else {
      postRateLimit.set(userId, filtered);
    }
  }
}, 60000);

// 每分钟清理过期验证码（5分钟超时）
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of captchaStore) {
    if (now - entry.t > 300000) captchaStore.delete(id);
  }
}, 60000);

// 每天清理超过60天的已删除通知
setInterval(() => {
  const notices = readNotices();
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const before = new Date(cutoff).toISOString();
  const remaining = notices.filter(n => {
    if (!n.deleted) return true;
    if (!n.deletedAt) return false;
    return new Date(n.deletedAt) > new Date(before);
  });
  if (remaining.length !== notices.length) {
    writeNotices(remaining);
    console.log('[通知清理] 已清理超过60天的已删除通知');
  }
}, 60 * 60 * 1000);

// 生成验证码
app.get('/api/captcha', (req, res) => {
  const captcha = svgCaptcha.create({ fontSize: 50, width: 150, height: 50, noise: 2 });
  const id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  captchaStore.set(id, { text: captcha.text.toLowerCase(), t: Date.now() });
  res.json({ ok: true, data: { id, svg: captcha.data } });
});

// ===== 用户 API =====

// 注册
app.post('/api/user/register', (req, res) => {
  const { username, password, nickname, captchaId, captchaText } = req.body;
  if (!username || !password || !nickname) {
    return res.json({ ok: false, msg: '账号、密码、昵称均为必填项' });
  }
  // 验证码校验
  const entry = captchaStore.get(captchaId);
  if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
    return res.json({ ok: false, msg: '验证码错误' });
  }
  captchaStore.delete(captchaId); // 一次性使用
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    return res.json({ ok: false, msg: '账号需 3-16 位字母、数字、下划线' });
  }
  if (password.length < 6) {
    return res.json({ ok: false, msg: '密码至少 6 位' });
  }
  if (nickname.length < 2 || nickname.length > 12) {
    return res.json({ ok: false, msg: '昵称需 2-12 个字符' });
  }

  const users = readUsers();
  if (users.find(u => u.username === username)) {
    return res.json({ ok: false, msg: '账号已被注册' });
  }

  const ip = getClientIP(req);
  const newUser = {
    id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    username,
    password: hashPassword(password),
    nickname,
    avatar: null,
    regIp: ip,
    createdAt: new Date().toISOString(),
    status: 'active',
    postCount: 0,
    bindAdminId: null,
    bindAdminRole: null
  };
  users.push(newUser);
  writeUsers(users);

  res.json({
    ok: true,
    data: {
      token: makeUserToken(newUser),
      id: newUser.id,
      username: newUser.username,
      nickname: newUser.nickname,
      avatar: newUser.avatar,
      zhixueStatus: null // 新用户未认证
    }
  });
});

// 登录
app.post('/api/user/login', (req, res) => {
  const { username, password, captchaId, captchaText } = req.body;
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'] || '-';

  if (!username || !password) {
    addLoginLog('user', null, false, ip, ua);
    return res.json({ ok: false, msg: '请输入账号和密码' });
  }
  // 验证码校验
  const entry = captchaStore.get(captchaId);
  if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
    return res.json({ ok: false, msg: '验证码错误' });
  }
  captchaStore.delete(captchaId); // 一次性使用

  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user || !verifyPassword(password, user.password)) {
    addLoginLog('user', username, false, ip, ua);
    return res.json({ ok: false, msg: '账号或密码错误' });
  }
  // 自动解封：如果 banUntil 已过期
  if (user.status === 'banned' && user.banUntil) {
    if (new Date(user.banUntil) <= new Date()) {
      user.status = 'active';
      user.banUntil = null;
      user.banDays = null;
      writeUsers(users);
    }
  }
  const isBanned = user.status === 'banned';
  addLoginLog('user', user.nickname, !isBanned, ip, ua);
  res.json({
    ok: true,
    banned: isBanned,
    banInfo: isBanned ? {
      banned: true,
      permanent: !user.banUntil,
      days: user.banDays || null,
      until: user.banUntil || null
    } : null,
    data: {
      token: makeUserToken(user),
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      zhixueStatus: getDisplayZhixueStatus(user)
    }
  });
});

// 智学网账号登录（通过已认证的智学账号登录校园墙）
app.post('/api/user/zhixue-login', (req, res) => {
  const { zhixueUsername, password, captchaId, captchaText } = req.body;
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'] || '-';

  // 验证码校验
  const entry = captchaStore.get(captchaId);
  if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
    return res.json({ ok: false, msg: '验证码错误' });
  }
  captchaStore.delete(captchaId); // 一次性使用

  if (!zhixueUsername || !password) {
    addLoginLog('user', null, false, ip, ua);
    return res.json({ ok: false, msg: '请输入绑定的智学网账号和密码' });
  }

  const users = readUsers();
  let user = users.find(u => u.zhixueUsername === zhixueUsername && (u.zhixueStatus === 'approved' || u.zhixueStatus === 'pending_confirm'));
  // 防御：approved 必须有审核记录
  if (user && user.zhixueStatus === 'approved' && !user.zhixueReviewedBy) {
    console.warn('[zhixue-login] 用户', user.id, '状态为 approved 但缺少审核记录，拒绝登录');
    user = null;
  }
  if (!user) {
    addLoginLog('user', zhixueUsername, false, ip, ua);
    return res.json({ ok: false, msg: '当前账号可能错误或者未绑定校园墙账号' });
  }
  if (!verifyPassword(password, user.password)) {
    addLoginLog('user', zhixueUsername, false, ip, ua);
    return res.json({ ok: false, msg: '当前密码错误' });
  }
  // 自动解封
  if (user.status === 'banned' && user.banUntil) {
    if (new Date(user.banUntil) <= new Date()) {
      user.status = 'active';
      user.banUntil = null;
      user.banDays = null;
      writeUsers(users);
    }
  }
  const isBanned = user.status === 'banned';
  addLoginLog('user', user.nickname, !isBanned, ip, ua);
  res.json({
    ok: true,
    banned: isBanned,
    banInfo: isBanned ? {
      banned: true,
      permanent: !user.banUntil,
      days: user.banDays || null,
      until: user.banUntil || null
    } : null,
    data: {
      token: makeUserToken(user),
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      zhixueStatus: 'approved'
    }
  });
});
;

// ===== 浏览器信任自动登录 =====
// 信任此浏览器：登录成功后客户端生成 trustToken，调用此接口登记
app.post('/api/user/trust-browser', (req, res) => {
  const auth = verifyUserToken(req.headers['x-user-token']);
  if (!auth) return res.json({ ok: false, msg: '未登录' });
  const { trustToken } = req.body;
  if (!trustToken) return res.json({ ok: false, msg: '缺少信任令牌' });
  const users = readUsers();
  const user = users.find(u => u.id === auth.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  const tokens = readTrustTokens();
  tokens[trustToken] = { userId: user.id, createdAt: Date.now(), lastUsedAt: Date.now() };
  writeTrustTokens(tokens);
  res.json({ ok: true });
});

// 自动登录：页面加载时检查 trustToken 是否有效
app.post('/api/user/auto-login', (req, res) => {
  const { trustToken } = req.body;
  if (!trustToken) return res.json({ ok: false, msg: '缺少信任令牌' });
  const tokens = readTrustTokens();
  const entry = tokens[trustToken];
  if (!entry) return res.json({ ok: false, msg: '令牌无效或已撤销' });
  const users = readUsers();
  const user = users.find(u => u.id === entry.userId);
  if (!user) { delete tokens[trustToken]; writeTrustTokens(tokens); return res.json({ ok: false, msg: '用户不存在' }); }
  if (user.status === 'banned') {
    return res.json({ ok: false, msg: '该账号已被封禁', banned: true });
  }
  entry.lastUsedAt = Date.now();
  writeTrustTokens(tokens);
  res.json({ ok: true, data: { token: makeUserToken(user), id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, credit: user.credit || 0, zhixueStatus: getDisplayZhixueStatus(user) } });
});

// 撤销信任（用户退出时清除）
app.post('/api/user/revoke-trust', (req, res) => {
  const { trustToken } = req.body;
  if (!trustToken) return res.json({ ok: false, msg: '缺少信任令牌' });
  const tokens = readTrustTokens();
  delete tokens[trustToken];
  writeTrustTokens(tokens);
  res.json({ ok: true });
});

// ===== 二维码登录 =====
const qrCodeStore = new Map();
const QR_CODE_TTL = 5 * 60 * 1000; // 5分钟有效期

// 启动时恢复已持久化的二维码
try {
  const fs = require('fs');
  const qrDbPath = require('path').join(__dirname, 'data', 'qrcodes.json');
  if (fs.existsSync(qrDbPath)) {
    const raw = fs.readFileSync(qrDbPath, 'utf8');
    const arr = JSON.parse(raw);
    arr.forEach(entry => qrCodeStore.set(entry.token, entry.data));
    console.log('[qrcode] 已恢复 ' + qrCodeStore.size + ' 个二维码令牌');
  }
} catch(e) {
  console.warn('[qrcode] 恢复失败（首次运行可忽略）:', e.message);
}

function persistQrCodes() {
  try {
    const fs = require('fs');
    const qrDbPath = require('path').join(__dirname, 'data', 'qrcodes.json');
    const arr = [];
    for (const [token, data] of qrCodeStore) {
      arr.push({ token, data });
    }
    fs.writeFileSync(qrDbPath, JSON.stringify(arr, null, 2), 'utf8');
  } catch(e) {
    console.warn('[qrcode] 持久化失败:', e.message);
  }
}

// 生成二维码（网页端调用）
app.get('/api/user/qrcode/generate', (req, res) => {
  const { userToken } = req.query;
  let linkedUser = null;
  if (userToken) {
    const session = verifyUserToken(userToken);
    if (session) {
      const users = readUsers();
      linkedUser = users.find(u => u.id === session.id);
    }
  }
  const qrToken = crypto.randomBytes(16).toString('hex');
  qrCodeStore.set(qrToken, {
    userId: linkedUser ? linkedUser.id : null,
    linkedUser: linkedUser || null,
    createdAt: Date.now(),
    status: 'pending',
    userAgent: req.headers['user-agent']
  });
  persistQrCodes();
  cleanupQrCodes();
  console.log('[qrcode] 生成二维码 token=' + qrToken.slice(0,12) + '... linked=' + (linkedUser ? linkedUser.nickname : '无') + ' store_size=' + qrCodeStore.size);
  res.json({ ok: true, qrToken, expiresIn: QR_CODE_TTL });
});

// 小程序扫码（扫描二维码）→ 自动确认登录
app.get('/api/user/qrcode/scan', (req, res) => {
  const { token } = req.query;
  const qr = qrCodeStore.get(token);
  console.log('[qrcode] 扫码 token=' + (token ? token.slice(0,12) + '...' : 'MISSING') + ' found=' + !!qr + ' store_size=' + qrCodeStore.size);
  if (!token) return res.json({ ok: false, msg: '缺少二维码令牌' });
  if (!qr) return res.json({ ok: false, msg: '二维码已失效' });
  if (Date.now() - qr.createdAt > QR_CODE_TTL) {
    qr.status = 'expired';
    persistQrCodes();
    return res.json({ ok: false, msg: '二维码已失效' });
  }
  // 生成用户会话
  let sessionUser;
  if (qr.linkedUser) {
    // 有关联用户：使用该用户的信息
    sessionUser = {
      id: qr.linkedUser.id,
      nickname: qr.linkedUser.nickname,
      avatar: qr.linkedUser.avatar || '🙋',
      token: makeUserToken(qr.linkedUser),
      username: qr.linkedUser.username || ''
    };
    // 更新该用户的 token（刷新有效期）
    const allUsers = readUsers();
    const idx = allUsers.findIndex(u => u.id === qr.linkedUser.id);
    if (idx >= 0) {
      allUsers[idx].token = sessionUser.token;
      writeUsers(allUsers);
    }
  } else {
    // 无关联用户：创建新用户
    sessionUser = {
      id: 'mp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      nickname: '用户' + Math.random().toString(36).slice(2, 6).toUpperCase(),
      avatar: '🙋',
      token: crypto.randomBytes(24).toString('hex')
    };
    const allUsers = readUsers();
    allUsers.push({
      id: sessionUser.id,
      nickname: sessionUser.nickname,
      avatar: sessionUser.avatar,
      token: sessionUser.token,
      password: '',
      createdAt: new Date().toISOString()
    });
    writeUsers(allUsers);
  }
  qr.status = 'confirmed';
  qr.sessionUser = sessionUser;
  persistQrCodes();
  console.log('[qrcode] 扫码成功', sessionUser.nickname, 'token=' + sessionUser.token.slice(0,12) + '...');
  res.json({ ok: true, scanned: true });
});

// 小程序查询状态
app.get('/api/user/qrcode/status', (req, res) => {
  const { qrToken } = req.query;
  const qr = qrCodeStore.get(qrToken);
  console.log('[qrcode] 状态查询 token=' + (qrToken ? qrToken.slice(0,12) + '...' : 'MISSING') + ' found=' + !!qr + ' status=' + (qr ? qr.status : 'N/A'));
  if (!qrToken) return res.json({ ok: false, msg: '缺少二维码令牌' });
  if (!qr) return res.json({ ok: false, msg: '二维码已失效' });
  if (Date.now() - qr.createdAt > QR_CODE_TTL) {
    qr.status = 'expired';
    persistQrCodes();
    return res.json({ ok: false, msg: '二维码已失效' });
  }
  if (qr.status === 'confirmed') {
    // 返回用户信息给小程序
    if (qr.sessionUser) {
      qrCodeStore.delete(qrToken);
      persistQrCodes();
      return res.json({ ok: true, confirmed: true, user: qr.sessionUser });
    }
    const users = readUsers();
    const user = users.find(u => u.id === qr.userId);
    if (user) {
      qrCodeStore.delete(qrToken);
      persistQrCodes();
      return res.json({ ok: true, confirmed: true, user: { id: user.id, nickname: user.nickname, avatar: user.avatar, token: user.token } });
    }
  }
  if (qr.status === 'scanned') {
    return res.json({ ok: true, scanned: true, userId: qr.userId });
  }
  res.json({ ok: true, pending: true });
});

// 小程序确认登录
app.post('/api/user/qrcode/confirm', (req, res) => {
  const { qrToken, userId } = req.body;
  if (!qrToken) return res.json({ ok: false, msg: '缺少二维码令牌' });
  const qr = qrCodeStore.get(qrToken);
  if (!qr) return res.json({ ok: false, msg: '二维码已失效' });
  if (Date.now() - qr.createdAt > QR_CODE_TTL) {
    qr.status = 'expired';
    return res.json({ ok: false, msg: '二维码已失效' });
  }
  if (qr.status !== 'scanned') return res.json({ ok: false, msg: '等待扫码确认' });
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  qr.status = 'confirmed';
  qr.userId = user.id;
  res.json({ ok: true });
});

// 清理过期二维码
function cleanupQrCodes() {
  const now = Date.now();
  let changed = false;
  for (const [token, qr] of qrCodeStore) {
    if (now - qr.createdAt > QR_CODE_TTL) {
      qr.status = 'expired';
      qrCodeStore.delete(token);
      changed = true;
    }
  }
  if (changed) persistQrCodes();
}
setInterval(cleanupQrCodes, 60000);

// 找回密码（通过已认证的智学网账号）
app.post('/api/user/forgot-password', (req, res) => {
  const { zhixueUsername, newPassword, confirmPassword } = req.body;

  if (!zhixueUsername) {
    return res.json({ ok: false, msg: '请输入绑定的智学网账号' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.json({ ok: false, msg: '新密码至少 6 位' });
  }
  if (newPassword !== confirmPassword) {
    return res.json({ ok: false, msg: '两次输入的新密码不一致' });
  }

  const users = readUsers();
  const userIndex = users.findIndex(u => u.zhixueUsername === zhixueUsername && u.zhixueStatus === 'approved');
  if (userIndex === -1) {
    return res.json({ ok: false, msg: '该智学网账号未认证或不存在' });
  }

  users[userIndex].password = hashPassword(newPassword);
  writeUsers(users);

  res.json({ ok: true, msg: '密码重置成功，请使用新密码登录' });
});

// 验证当前用户登录状态
app.get('/api/user/me', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });
  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole, credit: user.credit || 0, checkinToday: user.lastCheckinDate === new Date().toISOString().slice(0, 10), checkinStreak: user.checkinStreak || 0, zhixueStatus: getDisplayZhixueStatus(user), zhixueUsername: user.zhixueUsername || null } });
});

// ===== 签到 =====
const CHECKIN_REWARD = 100; // 每日签到奖励 100 Credit

// 获取签到状态
app.get('/api/user/checkin-status', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  const today = new Date().toISOString().slice(0, 10);
  res.json({
    ok: true,
    data: {
      checkedIn: user.lastCheckinDate === today,
      streak: user.checkinStreak || 0,
      reward: CHECKIN_REWARD
    }
  });
});

// 签到
app.post('/api/user/checkin', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const users = readUsers();
  const idx = users.findIndex(u => u.id === session.id);
  if (idx === -1) return res.json({ ok: false, msg: '用户不存在' });

  const user = users[idx];
  const today = new Date().toISOString().slice(0, 10);

  // 今天已签到
  if (user.lastCheckinDate === today) {
    return res.json({ ok: false, msg: '今天已签到，明天再来吧' });
  }

  // 判断是否连续签到
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (user.lastCheckinDate === yesterday) {
    user.checkinStreak = (user.checkinStreak || 0) + 1;
  } else {
    user.checkinStreak = 1; // 断签，重新开始
  }

  user.lastCheckinDate = today;
  user.credit = (user.credit || 0) + CHECKIN_REWARD;
  writeUsers(users);

  // 记录流水
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: session.id,
    amount: CHECKIN_REWARD,
    reason: '每日签到（连续 ' + user.checkinStreak + ' 天）',
    createdAt: new Date().toISOString()
  });
  writeCreditLogs(logs);

  res.json({
    ok: true,
    data: {
      reward: CHECKIN_REWARD,
      streak: user.checkinStreak,
      credit: user.credit
    }
  });
});

// 获取当前用户的 Credit 流水
app.get('/api/user/credit-logs', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const logs = readCreditLogs();
  const userLogs = logs.filter(l => l.userId === session.id).reverse();
  res.json({ ok: true, data: userLogs });
});

// 兑换卡密（含频率限制）
const redeemRateLimit = new Map();
app.post('/api/user/redeem-credit', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  // 频率限制：每人每分钟最多 5 次
  const now = Date.now();
  const rlKey = session.id;
  let rl = redeemRateLimit.get(rlKey);
  if (!rl || now - rl.window > 60000) {
    rl = { window: now, count: 0 };
    redeemRateLimit.set(rlKey, rl);
  }
  rl.count++;
  if (rl.count > 5) return res.json({ ok: false, msg: '操作太频繁，请稍后再试' });

  const { code } = req.body;
  if (!code || !code.trim()) return res.json({ ok: false, msg: '请输入卡密' });

  const cleanCode = code.trim().toUpperCase();
  // 格式验证：CW-XXXX-XXXX-X（12位字母数字+4个分隔符）
  if (!/^CW-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cleanCode)) {
    return res.json({ ok: false, msg: '卡密格式不正确' });
  }
  // 校验码验证（Luhn mod N）
  const codePart = cleanCode.replace(/-/g, '').slice(2); // 去掉 "CW-" 前缀
  if (!luhnModN(codePart)) {
    return res.json({ ok: false, msg: '卡密无效（校验码不匹配）' });
  }

  const cards = readCreditCards();
  const card = cards.find(c => c.code === cleanCode);

  if (!card) return res.json({ ok: false, msg: '卡密不存在' });
  if (card.status !== 'unused') return res.json({ ok: false, msg: '该卡密已被使用' });

  // 更新卡密状态
  card.status = 'used';
  card.usedBy = session.id;
  card.usedAt = new Date().toISOString();
  writeCreditCards(cards);

  // 给用户加 credit
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
  users[userIndex].credit = (users[userIndex].credit || 0) + card.value;
  writeUsers(users);

  // 记录流水
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: session.id,
    amount: card.value,
    reason: '卡密兑换：' + cleanCode,
    createdAt: new Date().toISOString()
  });
  writeCreditLogs(logs);

  res.json({ ok: true, data: { value: card.value, balance: users[userIndex].credit } });
});

// 更新当前用户资料（昵称、头像）
app.patch('/api/user/me', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
  const user = users[userIndex];
  if (user.status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });

  const { nickname, avatar } = req.body;
  let updated = false;

  // 更新昵称
  if (nickname !== undefined) {
    if (nickname.length < 2 || nickname.length > 12) {
      return res.json({ ok: false, msg: '昵称需 2-12 个字符' });
    }
    user.nickname = nickname;
    updated = true;
  }

  // 更新头像（base64 data URL）
  if (avatar !== undefined) {
    // 验证头像格式和大小
    if (typeof avatar !== 'string') {
      return res.json({ ok: false, msg: '头像数据格式错误' });
    }
    // 检查是否为图片 data URL
    if (!/^data:image\/.*;base64,/.test(avatar)) {
      return res.json({ ok: false, msg: '头像仅支持图片格式' });
    }
    const base64Data = avatar.split(',')[1];
    if (!base64Data) {
      return res.json({ ok: false, msg: '头像数据不完整' });
    }
    // 计算 base64 数据大小（约等于原文件的 4/3）
    if (base64Data.length > 700000) { // 对应约 500KB 的 JPG 文件
      return res.json({ ok: false, msg: '头像图片太大，请压缩到 500KB 以内' });
    }
    // 可选：验证 base64 有效性
    try {
      Buffer.from(base64Data, 'base64');
    } catch (e) {
      return res.json({ ok: false, msg: '头像数据格式无效' });
    }
    user.avatar = avatar;
    updated = true;
  }

  if (!updated) {
    return res.json({ ok: false, msg: '未提供可更新的字段' });
  }

  users[userIndex] = user;
  writeUsers(users);
  res.json({ ok: true, data: { id: user.id, nickname: user.nickname, avatar: user.avatar } });
});

// 绑定管理员账号
app.post('/api/user/bind-admin', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
  const user = users[userIndex];
  if (user.status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });

  const { password, adminId, adminPassword } = req.body;
  if (!password || !adminId || !adminPassword) {
    return res.json({ ok: false, msg: '请填写完整信息' });
  }

  // 验证用户密码
  if (!verifyPassword(password, user.password)) {
    return res.json({ ok: false, msg: '账号密码错误，绑定失败' });
  }

  // 查找管理员账号
  const admins = readAdmins();
  const admin = admins.find(a => a.id === adminId);
  if (!admin || !verifyPassword(adminPassword, admin.password)) {
    return res.json({ ok: false, msg: '管理员账号或密码错误，绑定失败' });
  }

  // 绑定
  users[userIndex].bindAdminId = admin.id;
  users[userIndex].bindAdminRole = admin.role;
  writeUsers(users);

  res.json({ ok: true, data: { bindAdminId: admin.id, bindAdminRole: admin.role } });
});

// 解绑管理员账号
app.delete('/api/user/bind-admin', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });

  users[userIndex].bindAdminId = null;
  users[userIndex].bindAdminRole = null;
  writeUsers(users);

  res.json({ ok: true });
});

// ===== 同学认证 =====

// 提交同学认证（智学认证 或 手动认证）
app.post('/api/user/bind-zhixue', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
  if (users[userIndex].status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });

  // 如果状态是已认证，需要先解除才能重新提交
  if (users[userIndex].zhixueStatus === 'approved') {
    return res.json({ ok: false, msg: '账号已认证，如需修改请联系管理员' });
  }

  const { type } = req.body;

  if (type === 'zhixue') {
    // 智学认证：账号 + 密码
    const { zhixueUsername, zhixuePassword } = req.body;
    if (!zhixueUsername) return res.json({ ok: false, msg: '请填写绑定的智学网账号' });
    if (!zhixuePassword) return res.json({ ok: false, msg: '请填写智学网密码' });

    // 唯一性检查：已认证（approved）的智学账号不允许被其他校园墙账号重复绑定
    const existingUser = users.find(u =>
      u.zhixueUsername === zhixueUsername &&
      u.zhixueStatus === 'approved' &&
      u.id !== users[userIndex].id
    );
    if (existingUser) {
      return res.json({ ok: false, msg: '该智学网账号已被其他账号绑定' });
    }

    users[userIndex].zhixueCertType = 'zhixue';
    users[userIndex].zhixueUsername = zhixueUsername;
    users[userIndex].zhixuePassword = zhixuePassword;
    users[userIndex].zhixueManualNote = null;
    users[userIndex].zhixueManualImages = null;

  } else if (type === 'manual') {
    // 手动认证：姓名 + 邮箱 + 说明 + 图片
    const { manualName, manualEmail, manualNote, manualImages } = req.body;
    if (!manualName || !manualName.trim()) return res.json({ ok: false, msg: '请填写姓名' });
    if (!manualEmail || !manualEmail.trim()) return res.json({ ok: false, msg: '请填写邮箱' });
    if (!manualNote || !manualNote.trim()) return res.json({ ok: false, msg: '请填写认证说明' });
    if (!manualImages || !Array.isArray(manualImages) || manualImages.length === 0) {
      return res.json({ ok: false, msg: '请至少上传一张证明图片' });
    }
    if (manualImages.length > 3) return res.json({ ok: false, msg: '最多上传3张图片' });
    // 验证图片格式与大小（base64 data URL）
    // 修正被 express.json() 破坏的 data URL（data:image/jpeg;base64 → dataimagejpegbase64）
    for (let i = 0; i < manualImages.length; i++) {
      const img = manualImages[i];
      let fixed = img;
      // 匹配 dataimagejpegbase64, 或 dataimage/jpegbase64, 等各种变体
      const m = img.match(/^dataimage\/?(jpeg|jpg|png|gif|webp|svg\xml)base64,/i)
              || img.match(/^data:image\/?(jpeg|jpg|png|gif|webp|svg\xml);base64,/i);
      if (m) {
        fixed = 'data:image/' + m[1] + ';base64,' + img.slice(m[0].length);
      } else if (!/^data:image\//i.test(img)) {
        return res.json({ ok: false, msg: '只允许上传图片文件' });
      }
      manualImages[i] = fixed;
      const base64Data = fixed.split(',')[1] || '';
      const sizeBytes = Math.ceil(base64Data.length * 3 / 4);
      if (sizeBytes > 10 * 1024 * 1024) {
        return res.json({ ok: false, msg: '单张图片不能超过 10MB' });
      }
    }

    users[userIndex].zhixueCertType = 'manual';
    users[userIndex].zhixueUsername = null;
    users[userIndex].zhixuePassword = null;
    users[userIndex].zhixueManualName = manualName.trim();
    users[userIndex].zhixueManualEmail = manualEmail.trim();
    users[userIndex].zhixueManualNote = manualNote.trim();
    users[userIndex].zhixueManualImages = manualImages;

  } else {
    return res.json({ ok: false, msg: '无效的认证类型' });
  }

  users[userIndex].zhixueStatus = 'pending';
  users[userIndex].zhixueSubmittedAt = new Date().toISOString();
  users[userIndex].zhixueReviewedAt = null;
  users[userIndex].zhixueReviewedBy = null;
  writeUsers(users);

  res.json({ ok: true, msg: '提交成功，请等待管理员审核', data: { type, status: 'pending' } });
});

// 解绑同学认证
app.delete('/api/user/bind-zhixue', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });

  users[userIndex].zhixueCertType = null;
  users[userIndex].zhixueUsername = null;
  users[userIndex].zhixuePassword = null;
  users[userIndex].zhixueManualName = null;
  users[userIndex].zhixueManualEmail = null;
  users[userIndex].zhixueManualNote = null;
  users[userIndex].zhixueManualImages = null;
  users[userIndex].zhixueStatus = null;
  users[userIndex].zhixueSubmittedAt = null;
  users[userIndex].zhixueReviewedAt = null;
  users[userIndex].zhixueReviewedBy = null;
  writeUsers(users);

  res.json({ ok: true });
});

// 获取当前用户同学认证信息（用于前端展示）
app.get('/api/user/me/zhixue-info', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });

  if (!user.zhixueUsername && !user.zhixueManualNote) {
    return res.json({ ok: true, data: null });
  }

  // 校验：status=approved 必须有 reviewedBy（管理员审核记录），否则降级为 pending
  let displayStatus = user.zhixueStatus || 'pending';
  if (displayStatus === 'approved' && !user.zhixueReviewedBy) {
    displayStatus = 'pending';
    console.warn('[zhixue-info] 用户', user.id, '状态为 approved 但缺少审核记录，降级为 pending');
  }

  const realName = decryptCert ? decryptCert(user.certRealName) : null;
  const className = user.certClassName ? (decryptCert ? decryptCert(user.certClassName) : null) : null;
  // 未通过审核或被驳回时，返回编辑所需的预填数据
  let editData = null;
  if (displayStatus !== 'approved' && displayStatus !== 'pending_confirm') {
    editData = {
      certType: user.zhixueCertType || 'zhixue',
      zhixueUsername: user.zhixueUsername || null,
      manualName: user.zhixueManualName || null,
      manualEmail: user.zhixueManualEmail || null,
      manualNote: user.zhixueManualNote || null,
      manualImages: user.zhixueManualImages || null
    };
  }
  res.json({
    ok: true,
    data: {
      type: user.zhixueCertType || 'zhixue',
      zhixueUsername: user.zhixueUsername,
      status: displayStatus,
      submittedAt: user.zhixueSubmittedAt || null,
      realName: ((displayStatus === 'approved' || displayStatus === 'pending_confirm') && realName) ? realName : null,
      className: (displayStatus === 'pending_confirm' && className) ? className : null,
      rejectReason: displayStatus === 'rejected' ? (user.zhixueRejectReason || null) : null,
      rejectedAt: displayStatus === 'rejected' ? (user.zhixueRejectedAt || null) : null,
      editData
    }
  });
});

// ===== 管理员同学认证审核 =====

// 获取待审核列表（仅管理员）
app.get('/api/admin/zhixue-pending', requireAdmin, (req, res) => {
  const users = readUsers();
  const pending = users.filter(u => u.zhixueStatus === 'pending');
  const list = pending.map(u => ({
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    certType: u.zhixueCertType || 'zhixue',
    zhixueUsername: u.zhixueUsername,
    zhixuePassword: u.zhixuePassword || '',
    manualNote: u.zhixueManualNote || '',
    manualImages: u.zhixueManualImages || [],
    submittedAt: u.zhixueSubmittedAt
  }));
  res.json({ ok: true, data: list });
});

// 审核同学认证（通过/拒绝）
app.put('/api/admin/zhixue/:userId/review', requireAdmin, (req, res) => {
  const { action, realName, className, rejectReason } = req.body; // action: approve | reject
  if (!['approve', 'reject'].includes(action)) {
    return res.json({ ok: false, msg: '无效的操作' });
  }

  // 拒绝时必须填写原因
  if (action === 'reject') {
    if (!rejectReason || !rejectReason.trim()) {
      return res.json({ ok: false, msg: '请填写驳回原因' });
    }
  }

  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === req.params.userId);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });

  const now = new Date().toISOString();

  if (action === 'reject') {
    users[userIndex].zhixueStatus = 'rejected';
    users[userIndex].zhixueRejectReason = rejectReason.trim();
    users[userIndex].zhixueRejectedAt = now;
    users[userIndex].zhixueReviewedAt = now;
    users[userIndex].zhixueReviewedBy = req.admin.id;
    writeUsers(users);
    return res.json({ ok: true, msg: '已拒绝该申请' });
  }

  // === approve 流程 ===
  // 通过时：智学认证必须填写姓名；手动认证有 manualName 兜底，管理员可不填
  const u = users[userIndex];
  const isManual = u.zhixueCertType === 'manual';
  const hasManualName = u.zhixueManualName;
  if (!isManual && !hasManualName && (!realName || !realName.trim())) {
    return res.json({ ok: false, msg: '请填写学生姓名' });
  }

  // 智学认证 → pending_confirm（等待用户确认）
  // 手动认证 → approved（直接通过）
  users[userIndex].zhixueStatus = isManual ? 'approved' : 'pending_confirm';
  users[userIndex].zhixueReviewedAt = now;
  users[userIndex].zhixueReviewedBy = req.admin.id;
  users[userIndex].zhixuePassword = null;
  users[userIndex].zhixueRejectReason = null;
  users[userIndex].zhixueRejectedAt = null;

  // 加密存储姓名班级（pending_confirm 时也存，供用户确认时展示）
  const nameToStore = (realName && realName.trim())
    ? realName.trim()
    : (u.zhixueManualName || null);
  if (nameToStore) {
    users[userIndex].certRealName = encryptCert(nameToStore);
  }
  users[userIndex].certClassName = className && className.trim() ? encryptCert(className.trim()) : null;

  if (isManual) {
    // 手动认证直接通过，奖励 Credits
    users[userIndex].credit = (users[userIndex].credit || 0) + 300;
  }

  writeUsers(users);

  if (isManual) {
    return res.json({ ok: true, msg: '已通过审核' });
  } else {
    return res.json({ ok: true, msg: '审核通过，等待用户确认信息', pendingConfirm: true });
  }
});

// 用户确认智学认证信息（pending_confirm → approved）
app.post('/api/user/confirm-zhixue', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
  if (users[userIndex].status === 'banned') return res.json({ ok: false, msg: '账号已被禁用', code: 'BANNED' });
  if (users[userIndex].zhixueStatus !== 'pending_confirm') {
    return res.json({ ok: false, msg: '当前无需确认认证信息' });
  }

  users[userIndex].zhixueStatus = 'approved';
  users[userIndex].zhixueConfirmedAt = new Date().toISOString();
  // 奖励 Credits（确认时才发放）
  users[userIndex].credit = (users[userIndex].credit || 0) + 300;
  writeUsers(users);

  res.json({ ok: true, msg: '认证信息已确认，欢迎！' });
});

// 用户否认智学认证信息（pending_confirm → rejected）
app.post('/api/user/deny-zhixue', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });
  if (users[userIndex].zhixueStatus !== 'pending_confirm') {
    return res.json({ ok: false, msg: '当前无需确认认证信息' });
  }

  users[userIndex].zhixueStatus = 'rejected';
  users[userIndex].zhixueRejectReason = '你确认提交的信息并非本人，请重新填写正确的信息';
  users[userIndex].zhixueRejectedAt = new Date().toISOString();
  users[userIndex].certRealName = null;
  users[userIndex].certClassName = null;
  writeUsers(users);

  res.json({ ok: true, msg: '已标记为未通过，请重新提交认证信息' });
});

// 获取所有同学认证记录（仅管理员，按状态分组）
app.get('/api/admin/zhixue-records', requireAdmin, (req, res) => {
  const users = readUsers();
  const records = users
    .filter(u => u.zhixueStatus && ['pending', 'approved', 'rejected', 'pending_confirm'].includes(u.zhixueStatus))
    .map(u => ({
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      certType: u.zhixueCertType || 'zhixue',
      zhixueUsername: u.zhixueUsername,
      zhixuePassword: u.zhixuePassword || '',
      zhixueManualName: u.zhixueManualName,
      status: u.zhixueStatus,
      rejectReason: u.zhixueRejectReason || null,
      submittedAt: u.zhixueSubmittedAt,
      reviewedAt: u.zhixueReviewedAt,
      reviewedBy: u.zhixueReviewedBy
    }))
    .sort((a, b) => {
      const ta = a.submittedAt || a.reviewedAt || '';
      const tb = b.submittedAt || b.reviewedAt || '';
      return tb.localeCompare(ta); // 最新的在前
    });
  res.json({ ok: true, data: records });
});

// 重置认证记录为待审核（管理员撤销通过/恢复被驳回的记录）
app.post('/api/admin/zhixue/:userId/reset', requireAdmin, (req, res) => {
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === req.params.userId);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });

  const u = users[userIndex];
  if (!u.zhixueStatus || !['approved', 'rejected', 'pending_confirm'].includes(u.zhixueStatus)) {
    return res.json({ ok: false, msg: '该用户当前状态无需重置' });
  }

  u.zhixueStatus = 'pending';
  u.zhixueReviewedAt = null;
  u.zhixueReviewedBy = null;
  u.zhixueRejectReason = null;
  u.zhixueRejectedAt = null;
  u.certRealName = null;
  u.certClassName = null;
  u.zhixuePassword = u._origPassword || null; // 保留密码以便重新审核
  writeUsers(users);

  res.json({ ok: true, msg: '已重置为待审核状态' });
});

// 获取指定用户公开信息（通过用户ID）
app.get('/api/users/:id', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.status === 'banned') return res.json({ ok: false, msg: '该账号已被禁用', code: 'BANNED' });
  // 不返回密码等敏感信息
  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, createdAt: user.createdAt, postCount: user.postCount || 0, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole } });
});

// 获取用户完整详情（仅管理员）
app.post('/api/admin/user/:id/detail', requireAdmin, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 读取帖子
  const posts = readPosts();
  const userPosts = posts.filter(p => p.userId === user.id || p.author === user.nickname);

  // 读取举报记录
  const reports = readReports();
  const userReports = reports.filter(r =>
    r.reportedBy === user.id || r.reporterName === user.nickname ||
    r.postAuthor === user.nickname
  );

  // 构建返回数据（排除 password）
  const { password, ...safeUser } = user;
  res.json({
    ok: true,
    data: {
      ...safeUser,
      postCount: userPosts.length,
      posts: userPosts.map(p => ({
        id: p.id,
        content: p.content,
        type: p.type || '日常',
        time: p.time,
        likes: (p.likes || []).length,
        commentsCount: (p.comments || []).length,
        sensitive: p.sensitive || false
      })),
      reports: userReports.map(r => ({
        id: r.id,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
        handledBy: r.handledBy || null,
        handledAt: r.handledAt || null,
        action: r.action || null
      }))
    }
  });
});

// 批量删除用户（仅管理员）
app.post('/api/admin/users/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.json({ ok: false, msg: '请指定要删除的用户' });
  }
  let users = readUsers();
  let posts = readPosts();
  let deletedCount = 0;
  let deletedPostCount = 0;

  users = users.filter(u => {
    if (ids.includes(u.id)) {
      deletedCount++;
      const before = posts.length;
      posts = posts.filter(p => p.userId !== u.id && p.author !== u.nickname);
      deletedPostCount += before - posts.length;
      return false;
    }
    return true;
  });

  writeUsers(users);
  writePosts(posts);
  res.json({ ok: true, deleted: deletedCount, deletedPosts: deletedPostCount });
});

// ===== 卡密管理（仅超级管理员）=====
// 每日创建数量限制
const cardCreateLimits = new Map();
const CARD_DAILY_LIMIT = 100; // 每天最多创建 100 张

// 创建卡密
app.post('/api/admin/credit-cards/create', requireAdmin, requireSuper, (req, res) => {
  const { count, value } = req.body;
  const num = parseInt(count) || 1;
  const val = parseInt(value) || 10;
  if (num < 1 || num > 100) return res.json({ ok: false, msg: '数量范围 1~100' });
  if (val < 1) return res.json({ ok: false, msg: '面值至少为 1 Credit' });

  // 每日限额检查
  const today = new Date().toISOString().slice(0, 10);
  const key = req.admin.id + '|' + today;
  const used = cardCreateLimits.get(key) || 0;
  if (used + num > CARD_DAILY_LIMIT) {
    return res.json({ ok: false, msg: '今日创建已达上限（' + CARD_DAILY_LIMIT + ' 张），请明天再试' });
  }
  cardCreateLimits.set(key, used + num);

  const cards = readCreditCards();
  const now = new Date().toISOString();
  const newCards = [];
  for (let i = 0; i < num; i++) {
    newCards.push({
      code: generateCardCode(cards.concat(newCards)),
      value: val,
      status: 'unused',
      createdBy: req.admin.id,
      createdAt: now,
      usedBy: null,
      usedAt: null
    });
  }
  const all = cards.concat(newCards);
  writeCreditCards(all);

  // 审计日志
  console.warn('[AUDIT] 超级管理员 ' + req.admin.id + ' 创建了 ' + num + ' 张卡密，每张 ' + val + ' Credit');

  res.json({ ok: true, data: { count: num, value: val, cards: newCards.map(c => c.code) } });
});

// 查询所有卡密
app.get('/api/admin/credit-cards', requireAdmin, requireSuper, (req, res) => {
  const cards = readCreditCards();
  const users = readUsers();
  const list = cards.reverse().map(c => ({
    ...c,
    usedByNickname: c.usedBy ? (users.find(u => u.id === c.usedBy)?.nickname || '未知') : null
  }));
  res.json({ ok: true, data: list });
});

// ===== Credit 管理（仅超级管理员）=====

// 获取 Credit 总览数据
app.get('/api/admin/credit/overview', requireAdmin, requireSuper, (req, res) => {
  // 卡密统计
  const cards = readCreditCards();
  const totalRedeemed = cards.filter(c => c.status === 'used').reduce((s, c) => s + c.value, 0); // 已兑换
  // 用户持有总量
  const users = readUsers();
  const inCirculation = users.reduce((s, u) => s + (u.credit || 0), 0);
  // 管理员扣除总量
  const logs = readCreditLogs();
  const totalDeducted = logs.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);

  // 近 7 天每日数据
  const chart = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const dayStr = day.toISOString().slice(0, 10);
    const label = i === 0 ? '今天' : (day.getMonth() + 1) + '/' + day.getDate();
    const dayLogs = logs.filter(l => l.createdAt && l.createdAt.startsWith(dayStr));
    chart.push({
      label,
      issued: dayLogs.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0),
      redeemed: dayLogs.reduce((s, l) => s + (l.amount < 0 ? Math.abs(l.amount) : 0), 0)
    });
  }

  res.json({
    ok: true,
    data: { totalRedeemed, inCirculation, totalDeducted, chart }
  });
});

// 搜索用户（按用户名或昵称）
app.get('/api/admin/credit/search-user', requireAdmin, requireSuper, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ ok: true, data: [] });
  const users = readUsers();
  const matches = users.filter(u =>
    (u.username && u.username.toLowerCase().includes(q)) ||
    (u.nickname && u.nickname.toLowerCase().includes(q))
  ).slice(0, 20).map(u => ({
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    credit: u.credit || 0
  }));
  res.json({ ok: true, data: matches });
});

// 赠送 Credit 给指定用户
app.post('/api/admin/credit/grant', requireAdmin, requireSuper, (req, res) => {
  const { userId, amount, reason } = req.body;
  const num = parseInt(amount);
  if (!userId) return res.json({ ok: false, msg: '请指定用户' });
  if (!num || num < 1 || num > 10000) return res.json({ ok: false, msg: '赠送数量范围 1~10000' });

  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.json({ ok: false, msg: '用户不存在' });

  users[idx].credit = (users[idx].credit || 0) + num;
  writeUsers(users);

  // 记录流水
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId,
    amount: num,
    reason: '管理员赠送：' + (reason || '无备注') + '（经办人：' + req.admin.id + '）',
    createdAt: new Date().toISOString()
  });
  writeCreditLogs(logs);

  // 审计日志
  console.warn('[AUDIT] 管理员 ' + req.admin.id + ' 赠送 ' + num + ' Credit 给用户 ' + userId);

  res.json({ ok: true, data: { credit: users[idx].credit } });
});

// 扣除用户 Credit
app.post('/api/admin/credit/deduct', requireAdmin, requireSuper, (req, res) => {
  const { userId, amount, reason } = req.body;
  const num = parseInt(amount);
  if (!userId) return res.json({ ok: false, msg: '请指定用户' });
  if (!num || num < 1 || num > 10000) return res.json({ ok: false, msg: '扣除数量范围 1~10000' });

  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.json({ ok: false, msg: '用户不存在' });

  const current = users[idx].credit || 0;
  if (current < num) return res.json({ ok: false, msg: '用户 Credit 余额不足，当前仅 ' + current });

  users[idx].credit = current - num;
  writeUsers(users);

  // 记录流水（负数表示扣除）
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId,
    amount: -num,
    reason: '管理员扣除：' + (reason || '无备注') + '（经办人：' + req.admin.id + '）',
    createdAt: new Date().toISOString()
  });
  writeCreditLogs(logs);

  // 审计日志
  console.warn('[AUDIT] 管理员 ' + req.admin.id + ' 扣除用户 ' + userId + ' 的 ' + num + ' Credit');

  res.json({ ok: true, data: { credit: users[idx].credit } });
});

// 获取指定用户发布帖子
app.get('/api/users/:id/posts', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.status === 'banned') return res.json({ ok: false, msg: '该账号已被禁用', code: 'BANNED' });
  const posts = readPosts();
  const userPosts = posts.filter(p => !p.deleted && (p.userId === user.id || p.author === user.nickname));
  res.json({ ok: true, data: userPosts });
});

// 获取用户列表（仅管理员）
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readUsers();
  const posts = readPosts();
  const list = users.map(u => ({
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    avatar: u.avatar,
    regIp: u.regIp || '-',
    createdAt: u.createdAt,
    status: u.status,
    postCount: posts.filter(p => p.author === u.nickname || p.userId === u.id).length
  }));
  res.json({ ok: true, data: list });
});

// 封禁/解封用户（仅管理员，支持 banDays: 0=永久, >0=天数）
app.put('/api/admin/user/:id/status', requireAdmin, (req, res) => {
  const { status, banDays } = req.body;
  if (!['active', 'banned'].includes(status)) {
    return res.json({ ok: false, msg: '状态无效' });
  }
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  user.status = status;
  if (status === 'banned') {
    if (banDays !== undefined && banDays !== null) {
      const days = parseInt(banDays);
      if (isNaN(days) || days < 0) return res.json({ ok: false, msg: '天数无效' });
      if (days === 0) {
        user.banUntil = null; // 永久
        user.banDays = null;
      } else {
        const until = new Date();
        until.setDate(until.getDate() + days);
        user.banUntil = until.toISOString();
        user.banDays = days;
      }
    }
  } else {
    // 解封时清除封禁信息
    user.banUntil = null;
    user.banDays = null;
  }
  writeUsers(users);
  res.json({ ok: true });
});

// 删除用户（仅管理员）—— 用户账号物理删除，其内容软删除保留
app.delete('/api/admin/user/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 软删除该用户的所有帖子
  const posts = readPosts();
  const now = new Date().toISOString();
  let softDeleted = 0;
  posts.forEach(p => {
    if (!p.deleted && (p.userId === userId || p.author === user.nickname)) {
      p.deleted = true;
      p.deletedAt = now;
      p.deletedBy = 'system';
      softDeleted++;
    }
  });
  writePosts(posts);

  // 再删除用户账号
  const updated = users.filter(u => u.id !== userId);
  writeUsers(updated);

  res.json({ ok: true, deletedPosts: softDeleted });
});

// 重置用户密码（仅管理员）—— 生成随机密码返回给管理员
app.post('/api/admin/user/:id/reset-password', requireAdmin, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 生成 8 位随机密码
  const newPassword = Math.random().toString(36).slice(2, 10);
  user.password = hashPassword(newPassword);
  writeUsers(users);

  res.json({ ok: true, data: { password: newPassword } });
});

// 获取用户完整详情（仅管理员）
app.get('/api/admin/user/:id/detail', requireAdmin, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 不返回密码；解密实名信息
  const { password, certRealName, certClassName, ...safeUser } = user;
  safeUser.certRealNameDecrypted  = decryptCert(certRealName)  || null;
  safeUser.certClassNameDecrypted = decryptCert(certClassName) || null;

  // 帖子
  const posts = readPosts();
  const userPosts = posts.filter(p => p.userId === user.id || p.author === user.nickname)
    .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
    .slice(0, 20)
    .map(p => ({ id: p.id, content: p.content, type: p.type, time: p.time, likes: p.likes || 0, commentsCount: p.commentsCount || 0 }));

  // 举报记录
  const reports = readReports();
  const userReports = reports.filter(r => r.targetUserId === user.id || r.targetAuthor === user.nickname)
    .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
    .slice(0, 20)
    .map(r => ({ id: r.id, time: r.time, reason: r.reason, type: r.type, status: r.status }));

  res.json({
    ok: true,
    data: {
      ...safeUser,
      postCount: userPosts.length,
      posts: userPosts,
      reports: userReports
    }
  });
});

// 发帖时更新用户 postCount
function incUserPostCount(nickname) {
  const users = readUsers();
  const user = users.find(u => u.nickname === nickname);
  if (user) {
    user.postCount = (user.postCount || 0) + 1;
    writeUsers(users);
  }
}

// 获取所有帖子
app.get('/api/posts', (req, res) => {
  const posts = readPosts();
  // 过滤已删除的帖子（普通用户不可见）
  const activePosts = posts.filter(p => !p.deleted);
  const users = readUsers();
  // 为每个帖子附加作者的管理员角色信息
  const postsWithAdmin = activePosts.map(p => {
    if (p.userId) {
      const author = users.find(u => u.id === p.userId);
      if (author) {
        // 认证状态校验：approved 必须有审核记录
        let zhixueStatus = author.zhixueStatus || null;
        if (zhixueStatus === 'approved' && !author.zhixueReviewedBy) {
          zhixueStatus = null;
        }
        return {
          ...p,
          authorAdminRole: author.bindAdminRole || null,
          authorBindAdminId: author.bindAdminId || null,
          authorZhixueStatus: zhixueStatus,
          authorZhixueCertType: author.zhixueCertType || null
        };
      }
    }
    return p;
  });
  res.json({ ok: true, data: postsWithAdmin });
});

// 获取单个帖子（用于详情页）
app.get('/api/posts/:id', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  if (post.deleted) return res.json({ ok: false, msg: '帖子已被删除' });
  // 过滤已删除的评论
  if (post.comments) {
    post.comments = post.comments.filter(c => !c.deleted);
  }
  if (post.userId) {
    const users = readUsers();
    const author = users.find(u => u.id === post.userId);
    if (author) {
      let zhixueStatus = author.zhixueStatus || null;
      if (zhixueStatus === 'approved' && !author.zhixueReviewedBy) {
        zhixueStatus = null;
      }
      return res.json({ ok: true, data: { ...post, authorAdminRole: author.bindAdminRole || null, authorBindAdminId: author.bindAdminId || null, authorZhixueStatus: zhixueStatus, authorZhixueCertType: author.zhixueCertType || null } });
    }
  }
  res.json({ ok: true, data: post });
});

  // 发布新帖子
app.post('/api/posts', (req, res) => {
  const { type, content, avatar, author, userId, captchaId, captchaText, sensitiveForce } = req.body;

  
// 发帖频率检测（5分钟内最多3篇，超出需验证码）
if (userId) {
  const now = Date.now();
  const timestamps = postRateLimit.get(userId) || [];
  const recentPosts = timestamps.filter(ts => now - ts < 300000);
  if (recentPosts.length >= 3) {
    const entry = captchaStore.get(captchaId);
    if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
      return res.json({ ok: false, needCaptcha: true, msg: '发帖频率过高，请先验证' });
    }
    // 验证码通过，清除限制，重新计时
    postRateLimit.delete(userId);
    captchaStore.delete(captchaId);
  }
  // 记录本次发帖
  postRateLimit.set(userId, [...recentPosts.slice(-19), now]); // 保留最近20条
}
if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '内容不能为空' });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return res.json({ ok: false, msg: '内容不能超过 ' + CONTENT_MAX_LENGTH + ' 字' });
  }
  if (!type) {
    return res.json({ ok: false, msg: '请选择类型' });
  }

  // 敏感词检测（sensitiveForce=true 时跳过检查，但后续仍会生成举报）
  const sensitiveWords = checkSensitive(content);
  const hasSensitive = sensitiveWords.length > 0;

  // 有敏感词且用户未确认 → 不保存，返回警告
  if (hasSensitive && !sensitiveForce) {
    return res.json({
      ok: false,
      warning: true,
      warningMsg: '内容包含敏感词，请修改后重试'
    });
  }

  // 霸凌保护姓名检测（始终阻止，不支持 force 绕过）
  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({
      ok: false,
      bullying: true,
      warningMsg: '内容涉及受保护人员姓名，无法发送'
    });
  }

  const posts = readPosts();

  // 如果有 userId，查询用户是否绑定了管理员
  let authorAdminRole = null;
  let authorBindAdminId = null;
  if (userId) {
    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      authorAdminRole = user.bindAdminRole || null;
      authorBindAdminId = user.bindAdminId || null;
    }
  }

  const newPost = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    content: content.trim(),
    avatar: avatar || '🙈',
    author: author || '匿名',
    userId: userId || null,
    time: new Date().toISOString(),
    likes: 0,
    comments: 0,
    commentsCount: 0,
    liked: false,
    rotate: (Math.random() - 0.5) * 8,
    zIndex: Math.floor(Math.random() * 5) + 1,
    authorAdminRole: authorAdminRole,
    authorBindAdminId: authorBindAdminId
  };

  posts.unshift(newPost);
  writePosts(posts);

  // 敏感词命中：自动生成举报记录挂到后台
  if (hasSensitive) {
    const reports = readReports();
    reports.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'sensitive_post',
      targetId: newPost.id,
      postId: newPost.id,
      reason: '系统自动检测：内容包含敏感词 [' + sensitiveWords.join(', ') + ']',
      reportedBy: userId || null,
      reporterName: author || '匿名',
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    writeReports(reports);
  }

  // 更新注册用户的发贴数
  if (userId && author) {
    incUserPostCount(author);
  }

  res.json({
    ok: true,
    data: newPost,
    warning: false,
    warningMsg: undefined
  });
});

// 点赞 / 取消点赞
app.post('/api/posts/:id/like', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);

  if (!post) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }

  post.liked = !post.liked;
  post.likes += post.liked ? 1 : -1;
  post.likes = Math.max(0, post.likes);

  writePosts(posts);

  res.json({ ok: true, data: { liked: post.liked, likes: post.likes } });
});

// 获取帖子评论
app.get('/api/posts/:id/comments', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }
  const comments = post.comments || [];
  res.json({ ok: true, data: comments });
});

// 发表评论
app.post('/api/posts/:id/comments', (req, res) => {
  const { content, author, avatar, userId } = req.body;
  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '评论内容不能为空' });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return res.json({ ok: false, msg: '评论不能超过 ' + CONTENT_MAX_LENGTH + ' 字' });
  }
  // 敏感词检测（sensitiveForce=true 时跳过检查，后续仍会生成举报）
  const sensitiveForce = req.body.sensitiveForce === true;
  const sensitiveWords = checkSensitive(content);
  const hasSensitive = sensitiveWords.length > 0;

  // 有敏感词且用户未确认 → 不保存，返回警告
  if (hasSensitive && !sensitiveForce) {
    return res.json({
      ok: false,
      warning: true,
      warningMsg: '内容包含敏感词，请修改后重试'
    });
  }

  // 霸凌保护姓名检测（始终阻止）
  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({
      ok: false,
      bullying: true,
      warningMsg: '内容涉及受保护人员姓名，无法发送'
    });
  }

  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }
  if (!post.comments) post.comments = [];
  const newComment = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    content: content.trim(),
    author: author || '匿名',
    avatar: avatar || '🙈',
    userId: userId || null,
    time: new Date().toISOString(),
    likes: 0,
    liked: false
  };
  post.comments.push(newComment);
  post.commentsCount = post.comments.length;

  // 敏感词命中：自动生成举报记录（仅在 sensitiveForce 时执行）
  if (hasSensitive) {
    const reports = readReports();
    reports.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'sensitive_comment',
      targetId: newComment.id,
      postId: post.id,
      reason: '系统自动检测：评论包含敏感词 [' + sensitiveWords.join(', ') + ']',
      reportedBy: userId || null,
      reporterName: author || '匿名',
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    writeReports(reports);
  }

  writePosts(posts);
  res.json({
    ok: true,
    data: newComment,
    warning: false,
    warningMsg: undefined
  });
});

// 评论点赞
app.post('/api/posts/:postId/comments/:commentId/like', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  const comment = (post.comments || []).find(c => c.id === req.params.commentId);
  if (!comment) return res.json({ ok: false, msg: '评论不存在' });
  comment.liked = !comment.liked;
  comment.likes = (comment.likes || 0) + (comment.liked ? 1 : -1);
  comment.likes = Math.max(0, comment.likes);
  writePosts(posts);
  res.json({ ok: true, data: { liked: comment.liked, likes: comment.likes } });
});

// 删除评论（评论作者或帖子作者可删）—— 改为软删除
app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
  const userId = req.headers['x-user-token'] ? (() => {
    try { return JSON.parse(Buffer.from(req.headers['x-user-token'].split('.')[1], 'base64').toString()).id; } catch { return null; }
  })() : null;
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  const comment = (post.comments || []).find(c => c.id === req.params.commentId);
  if (!comment) return res.json({ ok: false, msg: '评论不存在' });
  if (comment.deleted) return res.json({ ok: false, msg: '评论已被删除' });
  const isCommentAuthor = userId && comment.userId && userId === comment.userId;
  const isPostAuthor = userId && post.userId && userId === post.userId;
  if (!isCommentAuthor && !isPostAuthor) {
    return res.json({ ok: false, msg: '无权删除此评论' });
  }
  comment.deleted = true;
  comment.deletedAt = new Date().toISOString();
  comment.deletedBy = userId === comment.userId ? 'user' : 'post_author';
  // 不减少 commentsCount，保留计数
  writePosts(posts);
  res.json({ ok: true });
});

// 举报评论
app.post('/api/comments/:commentId/report', (req, res) => {
  const { postId, reason } = req.body;
  if (!reason) return res.json({ ok: false, msg: '请填写举报原因' });
  const reports = readReports();
  // 去重
  const existing = reports.find(r => r.targetId === req.params.commentId && r.type === 'comment');
  if (existing) return res.json({ ok: false, msg: '已举报过此评论' });
  reports.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: 'comment',
    targetId: req.params.commentId,
    postId: postId,
    reason,
    status: 'pending',
    time: new Date().toISOString()
  });
  writeReports(reports);
  res.json({ ok: true });
});

// 批量删除评论（管理后台）—— 改为软删除
app.delete('/api/admin/comments/:commentId', requireAdmin, (req, res) => {
  const posts = readPosts();
  let found = false;
  const now = new Date().toISOString();
  posts.forEach(post => {
    const comment = (post.comments || []).find(c => c.id === req.params.commentId);
    if (comment && !comment.deleted) {
      comment.deleted = true;
      comment.deletedAt = now;
      comment.deletedBy = 'admin';
      found = true;
    }
  });
  if (!found) return res.json({ ok: false, msg: '评论不存在或已被删除' });
  writePosts(posts);
  // 同时删除该评论的举报记录
  const reports = readReports();
  const remaining = reports.filter(r => r.targetId !== req.params.commentId || r.type !== 'comment');
  writeReports(remaining);
  res.json({ ok: true });
});

app.post('/api/comments/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ ok: false, msg: '请提供要删除的评论 ID 列表' });
  const posts = readPosts();
  let deletedCount = 0;
  const now = new Date().toISOString();
  posts.forEach(post => {
    (post.comments || []).forEach(c => {
      if (ids.includes(c.id) && !c.deleted) {
        c.deleted = true;
        c.deletedAt = now;
        c.deletedBy = 'admin';
        deletedCount++;
      }
    });
  });
  writePosts(posts);
  // 同时删除相关的举报记录
  const reports = readReports();
  const remainingReports = reports.filter(r => !ids.includes(r.targetId) || r.type !== 'comment');
  writeReports(reports);
  res.json({ ok: true, deleted: deletedCount });
});

// 批量删除帖子 —— 改为软删除
app.post('/api/posts/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ ok: false, msg: '请提供要删除的帖子 ID 列表' });
  }
  const posts = readPosts();
  let deletedCount = 0;
  posts.forEach(p => {
    if (ids.includes(p.id) && !p.deleted) {
      p.deleted = true;
      p.deletedAt = new Date().toISOString();
      p.deletedBy = 'admin';
      deletedCount++;
    }
  });
  writePosts(posts);
  res.json({ ok: true, deleted: deletedCount });
});

// 删除帖子（仅管理员）—— 改为软删除
app.delete('/api/posts/:id', requireAdmin, (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  if (post.deleted) return res.json({ ok: false, msg: '帖子已被删除' });

  post.deleted = true;
  post.deletedAt = new Date().toISOString();
  post.deletedBy = 'admin';
  writePosts(posts);
  res.json({ ok: true });
});

// 用户删除自己发的帖子 —— 改为软删除
app.delete('/api/user/posts/:id', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  if (post.deleted) return res.json({ ok: false, msg: '帖子已被删除' });
  if (post.userId !== session.id) return res.json({ ok: false, msg: '无权删除他人的帖子' });

  post.deleted = true;
  post.deletedAt = new Date().toISOString();
  post.deletedBy = 'user';
  writePosts(posts);
  res.json({ ok: true });
});

// 修改帖子（置顶/修改内容）
app.put('/api/posts/:id', requireAdmin, (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });

  const { content, pinned } = req.body;
  if (content !== undefined) post.content = content;
  if (pinned !== undefined) post.pinned = pinned;

  writePosts(posts);
  res.json({ ok: true, data: post });
});

// 统计数据
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const posts = readPosts();
  const now = Date.now();
  const oneDayAgo = now - 86400000;
  const oneWeekAgo = now - 604800000;

  const stats = {
    total: posts.length,
    today: posts.filter(p => new Date(p.time).getTime() >= oneDayAgo).length,
    week: posts.filter(p => new Date(p.time).getTime() >= oneWeekAgo).length,
    totalLikes: posts.reduce((sum, p) => sum + (p.likes || 0), 0),
    byType: {}
  };

  ['日常', '表白', '树洞', '失物招领', '活动'].forEach(t => {
    stats.byType[t] = posts.filter(p => p.type === t).length;
  });

  stats.dailyChart = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    stats.dailyChart.push({
      label: i === 0 ? '今天' : `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
      count: posts.filter(p => {
        const t = new Date(p.time).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length
    });
  }

  res.json({ ok: true, data: stats });
});

// ===== 举报数据读写 =====
function readReports() {
  try {
    ensureDir();
    if (!fs.existsSync(REPORTS_FILE)) {
      fs.writeFileSync(REPORTS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取举报数据失败:', e);
    return [];
  }
}

function writeReports(reports) {
  try {
    ensureDir();
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入举报数据失败:', e);
  }
}



// ===== 用户反馈读写 =====
function readFeedbacks() {
  try {
    ensureDir();
    if (!fs.existsSync(FEEDBACK_FILE)) {
      fs.writeFileSync(FEEDBACK_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取反馈数据失败:', e);
    return [];
  }
}

function writeFeedbacks(feedbacks) {
  try {
    ensureDir();
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbacks, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入反馈数据失败:', e);
  }
}

// ===== 霸凌报告读写 =====
function readBullying() {
  try {
    ensureDir();
    if (!fs.existsSync(BULLYING_FILE)) {
      fs.writeFileSync(BULLYING_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(BULLYING_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取霸凌报告失败:', e);
    return [];
  }
}

function writeBullying(data) {
  try {
    ensureDir();
    fs.writeFileSync(BULLYING_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入霸凌报告失败:', e);
  }
}
// ===== Credit 数据读写 =====
function readCreditLogs() {
  try {
    ensureDir();
    if (!fs.existsSync(CREDIT_LOGS_FILE)) {
      fs.writeFileSync(CREDIT_LOGS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(CREDIT_LOGS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取 Credit 流水失败:', e);
    return [];
  }
}

function writeCreditLogs(logs) {
  try {
    ensureDir();
    fs.writeFileSync(CREDIT_LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入 Credit 流水失败:', e);
  }
}

// ===== 卡密数据读写 =====
function readCreditCards() {
  try {
    ensureDir();
    if (!fs.existsSync(CREDIT_CARDS_FILE)) {
      fs.writeFileSync(CREDIT_CARDS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(CREDIT_CARDS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取卡密失败:', e);
    return [];
  }
}
function writeCreditCards(cards) {
  try {
    ensureDir();
    fs.writeFileSync(CREDIT_CARDS_FILE, JSON.stringify(cards, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入卡密失败:', e);
  }
}
// 生成卡密：CW-XXXX-XXXX-X（含校验码防输错）
// 字母表排除易混淆的 0/O/1/I
const CARD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CARD_MOD = CARD_CHARS.length;

// Luhn mod N 校验：最后一位是校验码
function luhnModN(code) {
  let factor = 2;
  let sum = 0;
  const n = CARD_MOD;
  for (let i = code.length - 2; i >= 0; i--) { // 从倒数第二位开始算
    let val = CARD_CHARS.indexOf(code[i]);
    if (val === -1) return false;
    let add = val * factor;
    sum += Math.floor(add / n) + (add % n);
    factor = factor === 2 ? 1 : 2;
  }
  const expected = (n - (sum % n)) % n;
  const checkChar = code[code.length - 1];
  return CARD_CHARS[expected] === checkChar;
}

function generateCardCode(existingCards) {
  const codeSet = new Set((existingCards || []).map(c => c.code));
  let code;
  let attempts = 0;
  do {
    const raw = [];
    for (let i = 0; i < 11; i++) {
      raw.push(CARD_CHARS[crypto.randomInt(CARD_MOD)]);
    }
    // 算校验码
    let factor = 2;
    let sum = 0;
    const n = CARD_MOD;
    for (let i = raw.length - 1; i >= 0; i--) {
      let val = CARD_CHARS.indexOf(raw[i]);
      let add = val * factor;
      sum += Math.floor(add / n) + (add % n);
      factor = factor === 2 ? 1 : 2;
    }
    const check = CARD_CHARS[(n - (sum % n)) % n];
    const rawCode = raw.join('') + check;
    code = 'CW-' + rawCode.slice(0, 4) + '-' + rawCode.slice(4, 8) + '-' + rawCode.slice(8, 12);
    attempts++;
    if (attempts > 100) break; // 防死循环
  } while (codeSet.has(code));
  return code;
}

// ===== 讨论数据读写 =====
const DISCUSSIONS_FILE = path.join(DATA_DIR, 'discussions.json');
const DISCUSSION_COMMENTS_FILE = path.join(DATA_DIR, 'discussion_comments.json');
const ANNOUNCEMENT_FILE = path.join(DATA_DIR, 'announcement.json');

function readAnnouncement() {
  try {
    ensureDir();
    if (!fs.existsSync(ANNOUNCEMENT_FILE)) return null;
    return JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取公告失败:', e);
    return null;
  }
}

function writeAnnouncement(data) {
  try {
    ensureDir();
    fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入公告失败:', e);
  }
}

function readDiscussions() {
  try {
    ensureDir();
    if (!fs.existsSync(DISCUSSIONS_FILE)) {
      fs.writeFileSync(DISCUSSIONS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(DISCUSSIONS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取讨论话题失败:', e);
    return [];
  }
}

function writeDiscussions(discussions) {
  try {
    ensureDir();
    fs.writeFileSync(DISCUSSIONS_FILE, JSON.stringify(discussions, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入讨论话题失败:', e);
  }
}

function readDiscussionComments() {
  try {
    ensureDir();
    if (!fs.existsSync(DISCUSSION_COMMENTS_FILE)) {
      fs.writeFileSync(DISCUSSION_COMMENTS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(DISCUSSION_COMMENTS_FILE, 'utf-8'));
  } catch (e) {
    console.error('读取讨论评论失败:', e);
    return [];
  }
}

function writeDiscussionComments(comments) {
  try {
    ensureDir();
    fs.writeFileSync(DISCUSSION_COMMENTS_FILE, JSON.stringify(comments, null, 2), 'utf-8');
  } catch (e) {
    console.error('写入讨论评论失败:', e);
  }
}

// ===== 公告 API =====

// 获取当前公告（公开）
app.get('/api/announcement', (req, res) => {
  const announcement = readAnnouncement();
  res.json({ ok: true, data: announcement });
});

// 发布/更新公告（管理员）
app.post('/api/announcement', requireAdmin, (req, res) => {
  const { title, content } = req.body;
  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '公告内容不能为空' });
  }
  const data = {
    title: title ? title.trim() : '公告',
    content: content.trim(),
    publishedAt: new Date().toISOString(),
    publishedBy: req.admin.name
  };
  writeAnnouncement(data);
  res.json({ ok: true, data });
});

// 删除公告（管理员）
app.delete('/api/announcement', requireAdmin, (req, res) => {
  writeAnnouncement(null);
  res.json({ ok: true });
});

// ===== 讨论 API =====

// 获取所有讨论话题（公开）
app.get('/api/discussions', (req, res) => {
  const discussions = readDiscussions();
  const now = new Date();
  const active = discussions
    .filter(d => !d.deleted && (!d.expiresAt || parseLocalDateTime(d.expiresAt) > now))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: active });
});

// 创建讨论话题（管理员，最多3个）
app.post('/api/discussions', requireAdmin, (req, res) => {
  const { title, expiresAt } = req.body;
  if (!title || !title.trim()) {
    return res.json({ ok: false, msg: '话题标题不能为空' });
  }

  const discussions = readDiscussions();
  const now = new Date();
  const active = discussions.filter(d => !d.expiresAt || parseLocalDateTime(d.expiresAt) > now);
  if (active.length >= 3) {
    return res.json({ ok: false, msg: '最多只能设置 3 个讨论话题，请先删除或等待过期' });
  }

  const newDiscussion = {
    id: 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    expiresAt: expiresAt || null, // null 表示无限期
    createdBy: req.admin.id,
    createdAt: new Date().toISOString(),
    commentCount: 0
  };
  discussions.push(newDiscussion);
  writeDiscussions(discussions);
  res.json({ ok: true, data: newDiscussion });
});

// 更新讨论话题（管理员）
app.put('/api/discussions/:id', requireAdmin, (req, res) => {
  const { title, expiresAt } = req.body;
  const discussions = readDiscussions();
  const idx = discussions.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '话题不存在' });

  if (title !== undefined) {
    if (!title.trim()) return res.json({ ok: false, msg: '标题不能为空' });
    discussions[idx].title = title.trim();
  }
  if (expiresAt !== undefined) discussions[idx].expiresAt = expiresAt || null;
  writeDiscussions(discussions);
  res.json({ ok: true, data: discussions[idx] });
});

// 删除讨论话题（管理员）—— 改为软删除
app.delete('/api/discussions/:id', requireAdmin, (req, res) => {
  const discussions = readDiscussions();
  const d = discussions.find(d => d.id === req.params.id);
  if (!d) return res.json({ ok: false, msg: '话题不存在' });
  if (d.deleted) return res.json({ ok: false, msg: '话题已被删除' });
  const now = new Date().toISOString();
  d.deleted = true;
  d.deletedAt = now;
  d.deletedBy = 'admin';
  writeDiscussions(discussions);

  // 同时软删除该话题下的所有评论
  const comments = readDiscussionComments();
  comments.forEach(c => {
    if (c.discussionId === req.params.id && !c.deleted) {
      c.deleted = true;
      c.deletedAt = now;
      c.deletedBy = 'admin';
    }
  });
  writeDiscussionComments(comments);

  res.json({ ok: true });
});

// 获取某个话题的评论（嵌套结构）
app.get('/api/discussions/:id/comments', (req, res) => {
  const comments = readDiscussionComments();
  const discussionComments = comments
    .filter(c => c.discussionId === req.params.id && !c.deleted)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // 构建嵌套结构
  const topLevel = [];
  const byId = {};
  discussionComments.forEach(c => {
    c.replies = [];
    byId[c.id] = c;
  });
  discussionComments.forEach(c => {
    if (c.parentId && byId[c.parentId]) {
      byId[c.parentId].replies.push(c);
    } else {
      topLevel.push(c);
    }
  });

  res.json({ ok: true, data: topLevel });
});

// 发表讨论评论（需登录）
app.post('/api/discussions/:id/comments', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const { content, parentId } = req.body;
  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '评论内容不能为空' });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return res.json({ ok: false, msg: '评论不能超过 ' + CONTENT_MAX_LENGTH + ' 字' });
  }
  if (hasSpecialChars(content)) {
    return res.json({ ok: false, msg: '评论包含特殊字符' });
  }
  // 敏感词检测（sensitiveForce=true 时跳过检查，后续仍会生成举报）
  const sensitiveForce = req.body.sensitiveForce === true;
  const sensitiveWords = checkSensitive(content);
  const hasSensitive = sensitiveWords.length > 0;

  // 有敏感词且用户未确认 → 不保存，返回警告
  if (hasSensitive && !sensitiveForce) {
    return res.json({
      ok: false,
      warning: true,
      warningMsg: '内容包含敏感词，请修改后重试'
    });
  }

  // 霸凌保护姓名检测（始终阻止）
  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({
      ok: false,
      bullying: true,
      warningMsg: '内容涉及受保护人员姓名，无法发送'
    });
  }

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user || user.status === 'banned') {
    return res.json({ ok: false, msg: '账号已被禁用' });
  }

  const discussions = readDiscussions();
  const discussion = discussions.find(d => d.id === req.params.id);
  if (!discussion) return res.json({ ok: false, msg: '话题不存在' });

  const comments = readDiscussionComments();
  const newComment = {
    id: 'dc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    discussionId: req.params.id,
    parentId: parentId || null,
    content: content.trim(),
    author: user.nickname || '匿名',
    avatar: user.avatar || '🙈',
    userId: user.id,
    createdAt: new Date().toISOString(),
    likes: 0,
    liked: false,
    reportCount: 0,
    hidden: false
  };
  comments.push(newComment);
  writeDiscussionComments(comments);

  // 敏感词命中：自动生成举报记录
  if (hasSensitive) {
    const reports = readReports();
    reports.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'sensitive_discussion_comment',
      targetId: newComment.id,
      discussionId: req.params.id,
      reason: '系统自动检测：讨论评论包含敏感词【' + sensitiveWords.join('、') + '】',
      reportedBy: session.id,
      reporterName: session.nickname || '未知',
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    writeReports(reports);
  }

  // 更新话题评论数
  discussion.commentCount = (discussion.commentCount || 0) + 1;
  writeDiscussions(discussions);

  res.json({
    ok: true,
    data: newComment,
    warning: false,
    warningMsg: undefined
  });
});

// 删除讨论评论（发送者或管理员可删）—— 改为软删除
app.delete('/api/discussions/comments/:id', (req, res) => {
  const token = req.headers['x-user-token'];
  const adminToken = req.headers['x-admin-token'];

  let isAdmin = false;
  let userId = null;

  if (adminToken) {
    try {
      const session = JSON.parse(Buffer.from(adminToken, 'base64').toString());
      isAdmin = true;
    } catch {}
  }

  if (token) {
    const session = verifyUserToken(token);
    if (session) userId = session.id;
  }

  if (!isAdmin && !userId) {
    return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  }

  const comments = readDiscussionComments();
  const comment = comments.find(c => c.id === req.params.id);
  if (!comment) return res.json({ ok: false, msg: '评论不存在' });
  if (comment.deleted) return res.json({ ok: false, msg: '评论已被删除' });

  // 检查权限：评论作者、回复作者、管理员
  const isAuthor = userId && comment.userId && userId === comment.userId;
  const isParentAuthor = userId && comment.parentId
    ? (() => { const parent = comments.find(c => c.id === comment.parentId); return parent && parent.userId && parent.userId === userId; })()
    : false;

  if (!isAdmin && !isAuthor && !isParentAuthor) {
    return res.json({ ok: false, msg: '无权删除此评论' });
  }

  const now = new Date().toISOString();
  const byWho = isAdmin ? 'admin' : 'user';
  // 软删除该评论及其所有子回复
  comments.forEach(c => {
    if (c.id === req.params.id || c.parentId === req.params.id) {
      c.deleted = true;
      c.deletedAt = now;
      c.deletedBy = byWho;
    }
  });
  writeDiscussionComments(comments);

  res.json({ ok: true });
});

// 举报讨论评论
app.post('/api/discussions/comments/:id/report', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.json({ ok: false, msg: '请填写举报原因' });
  }

  const commentId = req.params.id;
  const comments = readDiscussionComments();
  const comment = comments.find(c => c.id === commentId);
  if (!comment) return res.json({ ok: false, msg: '评论不存在' });

  // 去重：同一用户只能举报同一条评论一次
  const reports = readReports();
  const alreadyReported = reports.some(r => r.targetId === commentId && r.type === 'discussion_comment' && r.reportedBy === session.id);
  if (alreadyReported) {
    return res.json({ ok: false, msg: '您已经举报过此评论' });
  }

  reports.push({
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: 'discussion_comment',
    targetId: commentId,
    discussionId: comment.discussionId,
    reason: reason.trim(),
    reportedBy: session.id,
    reporterName: session.nickname || '未知',
    createdAt: new Date().toISOString(),
    status: 'pending'
  });
  writeReports(reports);

  // 更新评论举报计数
  comment.reportCount = (comment.reportCount || 0) + 1;
  if (comment.reportCount > 20) {
    comment.hidden = true;
  }
  writeDiscussionComments(comments);

  res.json({ ok: true, data: { reportCount: comment.reportCount, hidden: comment.hidden } });
});

// ===== 举报 API =====

// 提交举报（任意用户，需登录 token）
app.post('/api/posts/:id/report', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.json({ ok: false, msg: '请填写举报原因' });
  }

  const postId = req.params.id;
  const posts = readPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });

  const reports = readReports();

  // 检查该用户是否已举报过此帖（字段名是 reportedBy，不是 userId）
  const alreadyReported = reports.some(
    r => r.postId === postId && r.reportedBy === session.id
  );
  if (alreadyReported) {
    return res.json({ ok: false, msg: '您已经举报过这条帖子了' });
  }

  reports.push({
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    postId,
    postContent: (post.content || '').slice(0, 100),
    postAuthor: post.author || '匿名',
    reportedBy: session.id,
    reporterName: session.nickname || '未知',
    reason: reason.trim(),
    createdAt: new Date().toISOString(),
    status: 'pending' // pending / resolved / ignored
  });

  writeReports(reports);

  // 更新帖子的举报计数
  post.reportCount = (post.reportCount || 0) + 1;
  // 举报数 > 20 自动隐藏
  if (post.reportCount > 20) {
    post.hidden = true;
  }
  writePosts(posts);

  // 举报成功后立即发送 T1 通知
  try {
    const notices = readNotices();
    notices.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: '📮 举报已收到',
      content: '你举报的帖子（' + (post.content || '').slice(0, 50) + '...）已提交给管理员审核。\n\n举报原因：' + reason.trim() + '\n\n我们会尽快处理，感谢你对校园墙环境的维护！',
      author: '系统',
      level: 'T1',
      createdAt: new Date().toISOString()
    });
    writeNotices(notices);
  } catch (e) {
    console.error('发送举报通知失败:', e.message);
  }

  res.json({ ok: true, data: { reportCount: post.reportCount, hidden: !!post.hidden } });
});

// 获取举报列表（仅管理员，支持 status 筛选）
app.get('/api/admin/reports', requireAdmin, (req, res) => {
  const reports = readReports();
  const { status } = req.query;
  const filtered = status ? reports.filter(r => r.status === status) : reports;

  // 按状态排序：pending 优先，再按时间倒序
  filtered.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.json({ ok: true, data: filtered });
});

// 获取所有评论（供管理后台）
app.get('/api/admin/comments', requireAdmin, (req, res) => {
  const posts = readPosts();
  const allComments = [];
  posts.forEach(post => {
    (post.comments || []).forEach(c => {
      allComments.push({
        ...c,
        postId: post.id,
        postAuthor: post.author,
        postContent: post.content.slice(0, 50)
      });
    });
  });
  allComments.sort((a, b) => new Date(b.time) - new Date(a.time));
  res.json({ ok: true, data: allComments });
});

// 处理举报（标记 resolved / ignored，仅管理员）
app.put('/api/admin/reports/:id', requireAdmin, (req, res) => {
  const { status, action } = req.body;
  if (!['resolved', 'ignored'].includes(status)) {
    return res.json({ ok: false, msg: '状态无效' });
  }

  const reports = readReports();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '举报记录不存在' });

  report.status = status;
  report.handledBy = req.admin.id;
  report.handledAt = new Date().toISOString();
  if (action) report.action = action;

  // 如果 action 是 delete_post，同时软删除被举报的帖子
  if (action === 'delete_post' && report.postId) {
    const posts = readPosts();
    const now = new Date().toISOString();
    posts.forEach(p => {
      if (p.id === report.postId && !p.deleted) {
        p.deleted = true;
        p.deletedAt = now;
        p.deletedBy = 'admin';
      }
    });
    writePosts(posts);
  }
  // 如果 action 是 delete_comment，同时软删除被举报的评论
  if (action === 'delete_comment' && report.targetId && report.type === 'comment') {
    const posts = readPosts();
    const now = new Date().toISOString();
    posts.forEach(post => {
      if (post.comments) {
        post.comments.forEach(c => {
          if (c.id === report.targetId && !c.deleted) {
            c.deleted = true;
            c.deletedAt = now;
            c.deletedBy = 'admin';
          }
        });
      }
    });
    writePosts(posts);
  }
  // 如果 action 是 delete_discussion_comment，同时软删除被举报的讨论区评论
  if (action === 'delete_discussion_comment' && report.targetId && report.type === 'discussion_comment') {
    const comments = readDiscussionComments();
    const now = new Date().toISOString();
    comments.forEach(c => {
      if (c.id === report.targetId && !c.deleted) {
        c.deleted = true;
        c.deletedAt = now;
        c.deletedBy = 'admin';
      }
    });
    writeDiscussionComments(comments);
  }

  writeReports(reports);
  res.json({ ok: true });
});

// ===== 封禁举报发送者（管理员）=====
app.post('/api/admin/reports/:id/ban-user', requireAdmin, (req, res) => {
  const { banDays } = req.body;
  const days = banDays !== undefined ? parseInt(banDays) : 0;
  if (isNaN(days) || days < 0) return res.json({ ok: false, msg: '天数无效' });

  const reports = readReports();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '举报记录不存在' });

  const targetUserId = report.reportedBy;
  if (!targetUserId) return res.json({ ok: false, msg: '该举报没有关联用户（匿名举报）' });

  const users = readUsers();
  const user = users.find(u => u.id === targetUserId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  user.status = 'banned';
  if (days === 0) {
    user.banUntil = null;
    user.banDays = null;
  } else {
    const until = new Date();
    until.setDate(until.getDate() + days);
    user.banUntil = until.toISOString();
    user.banDays = days;
  }
  writeUsers(users);

  // 同时标记举报为已处理
  report.status = 'resolved';
  report.handledBy = req.admin.id;
  report.handledAt = new Date().toISOString();
  report.action = 'ban_user';
  writeReports(reports);

  res.json({ ok: true,
    msg: days === 0 ? '已永久封禁该用户' : '已封禁该用户 ' + days + ' 天',
    user: { id: user.id, username: user.username, nickname: user.nickname }
  });
});

// ===== 管理端：查看已删除内容 =====
app.get('/api/admin/deleted-content', requireAdmin, (req, res) => {
  const posts = readPosts();
  const users = readUsers();
  const discussions = readDiscussions();
  const discussionComments = readDiscussionComments();

  // 已删除的帖子（含作者信息）
  const deletedPosts = posts
    .filter(p => p.deleted)
    .map(p => {
      const author = users.find(u => u.id === p.userId);
      return {
        id: p.id,
        content: p.content ? p.content.substring(0, 200) : '',
        type: p.type || '',
        author: p.author || (author ? author.nickname : '未知'),
        userId: p.userId,
        time: p.time || p.createdAt,
        deletedAt: p.deletedAt,
        deletedBy: p.deletedBy,
        likeCount: (p.likes || []).length || p.likes || 0,
        commentCount: (p.comments || []).length || p.commentsCount || 0
      };
    });

  // 已删除的帖子内评论
  const deletedPostComments = [];
  posts.forEach(post => {
    if (post.deleted) return; // 帖子已删，评论随帖子保留即可
    (post.comments || []).forEach(c => {
      if (c.deleted) {
        deletedPostComments.push({
          id: c.id,
          postId: post.id,
          postContent: (post.content || '').substring(0, 100),
          content: (c.content || '').substring(0, 200),
          author: c.author || '未知',
          userId: c.userId,
          time: c.time || c.createdAt,
          deletedAt: c.deletedAt,
          deletedBy: c.deletedBy
        });
      }
    });
  });

  // 已删除的讨论话题
  const deletedDiscussions = discussions
    .filter(d => d.deleted)
    .map(d => ({
      id: d.id,
      title: d.title || '',
      createdBy: d.createdBy || '未知',
      createdAt: d.createdAt,
      deletedAt: d.deletedAt,
      deletedBy: d.deletedBy
    }));

  // 已删除的讨论区评论
  const deletedDiscComments = discussionComments
    .filter(c => c.deleted)
    .map(c => ({
      id: c.id,
      discussionId: c.discussionId,
      content: (c.content || '').substring(0, 200),
      author: c.author || '未知',
      userId: c.userId,
      time: c.createdAt,
      deletedAt: c.deletedAt,
      deletedBy: c.deletedBy
    }));

  res.json({
    ok: true,
    data: {
      posts: deletedPosts,
      postComments: deletedPostComments,
      discussions: deletedDiscussions,
      discussionComments: deletedDiscComments,
      summary: {
        totalDeleted: deletedPosts.length + deletedPostComments.length + deletedDiscussions.length + deletedDiscComments.length
      }
    }
  });
});

// ===== 在线用户统计 =====
const onlineUsers = new Map(); // userId -> lastHeartbeat (timestamp)
const ONLINE_TIMEOUT = 120000; // 2 分钟无心跳视为离线

// 心跳接口（用户登录后定时调用）
app.post('/api/user/heartbeat', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) { onlineUsers.set('anon_' + getClientIP(req), Date.now()); return res.json({ ok: true }); }
  const session = verifyUserToken(token);
  if (!session || !session.id) { onlineUsers.set('anon_' + getClientIP(req), Date.now()); return res.json({ ok: true }); }
  onlineUsers.set(session.id, Date.now());
  res.json({ ok: true });
});

// 统计接口（含今日帖数、在线人数）
app.get('/api/stats', (req, res) => {
  // 清理过期
  const now = Date.now();
  for (const [id, ts] of onlineUsers) {
    if (now - ts > ONLINE_TIMEOUT) onlineUsers.delete(id);
  }
  // 今日帖数
  const posts = readPosts();
  const today = new Date().toISOString().slice(0, 10);
  const todayPosts = posts.filter(p => p.time && p.time.startsWith(today)).length;
  res.json({ ok: true, data: { todayPosts, onlineCount: onlineUsers.size } });
});

// 每分钟清理一次过期心跳
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of onlineUsers) {
    if (now - ts > ONLINE_TIMEOUT) onlineUsers.delete(id);
  }
}, 60000);

// ===== 启动 =====

// ===== 用户反馈提交 =====
app.post('/api/feedback', (req, res) => {
  const { type, description, contact, images } = req.body;
  if (!type || !description) return res.json({ ok: false, msg: '类型和描述不能为空' });
  if (description.length < 10) return res.json({ ok: false, msg: '描述至少10个字' });
  if (description.length > 500) return res.json({ ok: false, msg: '描述最多500字' });

  const feedbacks = readFeedbacks();
  const newFeedback = {
    id: 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    type: type,
    description: description,
    contact: contact || '',
    images: images || [],
    time: new Date().toISOString(),
    status: 'pending',
    handledBy: null,
    handledAt: null,
    handleNote: null
  };
  feedbacks.unshift(newFeedback);
  writeFeedbacks(feedbacks);
  res.json({ ok: true });
});

// ===== 霸凌事件报告提交 =====
app.post('/api/bullying-report', (req, res) => {
  const { reporterRole, victimName, bullyType, description, involved, location, time, contact, anonymous, images } = req.body;
  if (!reporterRole || !['self', 'witness'].includes(reporterRole)) return res.json({ ok: false, msg: '请选择您的身份' });
  if (!bullyType || !description) return res.json({ ok: false, msg: '霸凌类型和描述不能为空' });
  if (description.length < 20) return res.json({ ok: false, msg: '描述至少20个字' });
  if (description.length > 1000) return res.json({ ok: false, msg: '描述最多1000字' });
  if (!anonymous && !contact) return res.json({ ok: false, msg: '实名提交必须填写联系方式' });

  // 尝试获取提交者 userId
  let reporterUserId = null;
  try {
    const token = req.headers['x-user-token'];
    if (token) {
      const session = verifyUserToken(token);
      if (session) reporterUserId = session.id;
    }
  } catch (e) {}

  const reports = readBullying();

  // 自我举报 → 自动将受害者姓名加入保护名单
  if (reporterRole === 'self' && victimName) {
    addBullyingName(victimName);
  }

  const newReport = {
    id: 'bl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    reporterRole: reporterRole,
    victimName: (reporterRole === 'self' && victimName) ? victimName : null,
    bullyType: bullyType,
    description: description,
    involved: involved || '',
    location: location || '',
    incidentTime: time || '',
    contact: anonymous ? '' : (contact || ''),
    anonymous: !!anonymous,
    images: (images || []).slice(0, 3),
    time: new Date().toISOString(),
    status: 'pending',
    handledBy: null,
    handledAt: null,
    handleNote: null,
    userId: reporterUserId // 存储提交者 userId
  };
  reports.unshift(newReport);
  writeBullying(reports);

  // 发送 T1 通知
  if (reporterUserId) {
    try {
      const notices = readNotices();
      notices.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: '🛡️ 霸凌举报已收到',
        content: '你的霸凌事件报告已提交给管理员审核。\n\n我们将尽快核实并处理，请保持联系方式畅通。\n\n感谢你对校园安全的关注！',
        author: '系统',
        level: 'T1',
        createdAt: new Date().toISOString()
      });
      writeNotices(notices);
    } catch (e) {
      console.error('发送霸凌举报通知失败:', e.message);
    }
  }

  res.json({ ok: true, data: { id: newReport.id } });
});

// ===== 获取霸凌报告列表（管理员）=====
app.get('/api/admin/bullying', requireAdmin, (req, res) => {
  const reports = readBullying();
  const { status } = req.query;
  let filtered = reports;
  if (status && status !== 'all') {
    filtered = reports.filter(r => r.status === status);
  }
  const result = filtered.map(r => ({
    id: r.id,
    bullyType: r.bullyType,
    description: r.description,
    involved: r.involved,
    location: r.location,
    incidentTime: r.incidentTime,
    anonymous: !!r.anonymous,
    hasContact: !!(r.contact && r.contact.trim()),
    hasImages: r.images && r.images.length > 0,
    imageCount: r.images ? r.images.length : 0,
    time: r.time,
    status: r.status || 'pending',
    handledBy: r.handledBy,
    handledAt: r.handledAt
  }));
  res.json({ ok: true, data: result });
});

// ===== 处理霸凌报告（管理员）=====
app.post('/api/admin/bullying/:id', requireAdmin, (req, res) => {
  const { status, handleNote } = req.body;
  if (!status || !['pending','processing','resolved'].includes(status)) {
    return res.json({ ok: false, msg: '无效的状态' });
  }
  const reports = readBullying();
  const idx = reports.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '报告不存在' });
  reports[idx].status = status;
  reports[idx].handleNote = handleNote || '';
  reports[idx].handledBy = req.admin.name || req.admin.id;
  reports[idx].handledAt = new Date().toISOString();
  writeBullying(reports);

  // 确认确有霸凌（resolved）→ 发送 T0 通知
  if (status === 'resolved' && reports[idx].userId) {
    try {
      const notices = readNotices();
      notices.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: '🛡️ 霸凌举报已确认处理',
        content: '你提交的霸凌事件报告经管理员核实已确认，相关处理正在进行中。\n\n处理备注：' + (handleNote || '无') + '\n\n如情况仍未改善，请重新提交报告或联系学校相关部门。',
        author: '系统',
        level: 'T0',
        createdAt: new Date().toISOString()
      });
      writeNotices(notices);
    } catch (e) {
      console.error('发送霸凌处理通知失败:', e.message);
    }
  }

  res.json({ ok: true });
});

// ===== 获取单条霸凌报告详情（管理员）=====
app.get('/api/admin/bullying/:id', requireAdmin, (req, res) => {
  const reports = readBullying();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '报告不存在' });
  res.json({ ok: true, data: report });
});

// ===== 获取反馈列表（管理员）=====
app.get('/api/admin/feedbacks', requireAdmin, (req, res) => {
  const feedbacks = readFeedbacks();
  const result = feedbacks.map(f => ({
    id: f.id,
    type: f.type,
    description: f.description,
    contact: f.contact,
    hasImages: f.images && f.images.length > 0,
    imageCount: f.images ? f.images.length : 0,
    time: f.time,
    status: f.status,
    handledBy: f.handledBy,
    handledAt: f.handledAt
  }));
  res.json({ ok: true, data: result });
});

// ===== 获取单条反馈详情（管理员）=====
app.get('/api/admin/feedback/:id', requireAdmin, (req, res) => {
  const feedbacks = readFeedbacks();
  const f = feedbacks.find(x => x.id === req.params.id);
  if (!f) return res.json({ ok: false, msg: '反馈不存在' });
  res.json({ ok: true, data: f });
});

// ===== 处理反馈（管理员）=====
app.post('/api/admin/feedback/:id/handle', requireAdmin, (req, res) => {
  const { status, note } = req.body;
  if (!status || !['pending', 'resolved', 'rejected'].includes(status)) {
    return res.json({ ok: false, msg: '状态无效' });
  }
  const feedbacks = readFeedbacks();
  const idx = feedbacks.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '反馈不存在' });
  feedbacks[idx].status = status;
  feedbacks[idx].handledBy = req.admin.id;
  feedbacks[idx].handledAt = new Date().toISOString();
  feedbacks[idx].handleNote = note || '';
  writeFeedbacks(feedbacks);
  res.json({ ok: true });
});

// ===== 违禁词管理（管理员）=====
const SENSITIVE_CUSTOM_FILE = require('./sensitiveWords').CUSTOM_FILE;

// 获取违禁词列表
app.get('/api/admin/sensitive-words', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      return res.json({ ok: true, data: [] });
    }
    const words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    res.json({ ok: true, data: Array.isArray(words) ? words : [] });
  } catch (e) {
    res.json({ ok: false, msg: '读取失败: ' + e.message });
  }
});

// 添加违禁词
app.post('/api/admin/sensitive-words', requireAdmin, (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') return res.json({ ok: false, msg: '请输入有效词语' });
    const trimmed = word.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '词语不能为空' });
    if (trimmed.length > 50) return res.json({ ok: false, msg: '词语太长，最多50字' });

    let words = [];
    if (fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    }
    if (!Array.isArray(words)) words = [];

    if (words.includes(trimmed)) return res.json({ ok: false, msg: '该违禁词已存在' });

    words.push(trimmed);
    fs.writeFileSync(SENSITIVE_CUSTOM_FILE, JSON.stringify(words, null, 2), 'utf-8');
    reloadSensitive(); // 重新加载词库

    res.json({ ok: true, data: words });
  } catch (e) {
    res.json({ ok: false, msg: '添加失败: ' + e.message });
  }
});

// 删除违禁词
app.delete('/api/admin/sensitive-words/:word', requireAdmin, (req, res) => {
  try {
    const word = decodeURIComponent(req.params.word);
    if (!fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      return res.json({ ok: false, msg: '没有自定义违禁词' });
    }
    let words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    if (!Array.isArray(words)) words = [];

    const idx = words.indexOf(word);
    if (idx === -1) return res.json({ ok: false, msg: '未找到该违禁词' });

    words.splice(idx, 1);
    fs.writeFileSync(SENSITIVE_CUSTOM_FILE, JSON.stringify(words, null, 2), 'utf-8');
    reloadSensitive();

    res.json({ ok: true, data: words });
  } catch (e) {
    res.json({ ok: false, msg: '删除失败: ' + e.message });
  }
});

// 获取违禁词统计
app.get('/api/admin/sensitive-stats', requireAdmin, (req, res) => {
  try {
    const stats = getSensitiveStats();
    res.json({ ok: true, data: stats });
  } catch (e) {
    res.json({ ok: false, msg: '获取统计失败: ' + e.message });
  }
});

// ===== 敏感词白名单管理（管理员）=====

// 获取白名单列表
app.get('/api/admin/sensitive-whitelist', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(WHITELIST_FILE)) return res.json({ ok: true, data: [] });
    const list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
    res.json({ ok: true, data: Array.isArray(list) ? list : [] });
  } catch (e) {
    res.json({ ok: false, msg: '读取白名单失败: ' + e.message });
  }
});

// 添加白名单
app.post('/api/admin/sensitive-whitelist', requireAdmin, (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') return res.json({ ok: false, msg: '请输入有效词语' });
    const trimmed = word.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '词语不能为空' });
    if (trimmed.length > 50) return res.json({ ok: false, msg: '词语太长，最多50字' });

    let list = [];
    if (fs.existsSync(WHITELIST_FILE)) list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
    if (!Array.isArray(list)) list = [];

    if (list.includes(trimmed)) return res.json({ ok: false, msg: '该词已在白名单中' });

    list.push(trimmed);
    saveWhitelist(list);
    reloadSensitive();

    res.json({ ok: true, data: list });
  } catch (e) {
    res.json({ ok: false, msg: '添加失败: ' + e.message });
  }
});

// 删除白名单
app.delete('/api/admin/sensitive-whitelist/:word', requireAdmin, (req, res) => {
  try {
    const word = decodeURIComponent(req.params.word);
    if (!fs.existsSync(WHITELIST_FILE)) return res.json({ ok: false, msg: '白名单为空' });
    let list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
    if (!Array.isArray(list)) list = [];

    const idx = list.indexOf(word);
    if (idx === -1) return res.json({ ok: false, msg: '未找到该白名单词' });

    list.splice(idx, 1);
    saveWhitelist(list);
    reloadSensitive();

    res.json({ ok: true, data: list });
  } catch (e) {
    res.json({ ok: false, msg: '删除失败: ' + e.message });
  }
});

// ===== 霸凌状态管理（管理员）=====

// 获取保护姓名列表
app.get('/api/admin/bullying-names', requireAdmin, (req, res) => {
  try {
    const names = getAllBullyingNames();
    res.json({ ok: true, data: names });
  } catch (e) {
    res.json({ ok: false, msg: '读取失败: ' + e.message });
  }
});

// 手动添加保护姓名
app.post('/api/admin/bullying-names', requireAdmin, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') return res.json({ ok: false, msg: '请输入有效姓名' });
    const trimmed = name.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '姓名不能为空' });
    if (trimmed.length > 30) return res.json({ ok: false, msg: '姓名太长，最多30字' });

    if (addBullyingName(trimmed)) {
      res.json({ ok: true, msg: '添加成功' });
    } else {
      res.json({ ok: false, msg: '该姓名已在保护名单中' });
    }
  } catch (e) {
    res.json({ ok: false, msg: '添加失败: ' + e.message });
  }
});

// 删除保护姓名
app.delete('/api/admin/bullying-names/:name', requireAdmin, (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    if (removeBullyingName(name)) {
      res.json({ ok: true, msg: '删除成功' });
    } else {
      res.json({ ok: false, msg: '未找到该姓名' });
    }
  } catch (e) {
    res.json({ ok: false, msg: '删除失败: ' + e.message });
  }
});

// ===== Q&A 问答系统 =====
function readQAQuestions() {
  try {
    if (!fs.existsSync(QA_FILE)) fs.writeFileSync(QA_FILE, '[]', 'utf-8');
    return JSON.parse(fs.readFileSync(QA_FILE, 'utf-8'));
  } catch { return []; }
}
function writeQAQuestions(data) {
  try { fs.writeFileSync(QA_FILE, JSON.stringify(data, null, 2), 'utf-8'); } catch {}
}
function readQAAnswers() {
  try {
    if (!fs.existsSync(QA_ANSWERS_FILE)) fs.writeFileSync(QA_ANSWERS_FILE, '[]', 'utf-8');
    return JSON.parse(fs.readFileSync(QA_ANSWERS_FILE, 'utf-8'));
  } catch { return []; }
}
function writeQAAnswers(data) {
  try { fs.writeFileSync(QA_ANSWERS_FILE, JSON.stringify(data, null, 2), 'utf-8'); } catch {}
}

// 给用户变更 credit 并记录流水
function changeCredit(userId, amount, reason) {
  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return false;
  users[idx].credit = (users[idx].credit || 0) + amount;
  if (users[idx].credit < 0) users[idx].credit = 0;
  writeUsers(users);
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId,
    amount,
    reason,
    createdAt: new Date().toISOString()
  });
  writeCreditLogs(logs);
  return true;
}

// 结算到期问题
function settleExpiredQuestions() {
  const questions = readQAQuestions();
  const answers = readQAAnswers();
  const now = new Date();
  let changed = false;
  for (const q of questions) {
    if (q.status !== 'open') continue;
    if (!q.deadline) continue;
    if (new Date(q.deadline) > now) continue;
    // 到期，找此问题的所有回答，按赞数分配
    q.status = 'expired';
    changed = true;
    const qAnswers = answers.filter(a => a.questionId === q.id && !a.deleted);
    const totalLikes = qAnswers.reduce((s, a) => s + (a.likes || 0), 0);
    const bounty = q.bounty || 0;
    if (bounty > 0 && qAnswers.length > 0) {
      if (totalLikes === 0) {
        // 无人点赞则平分
        const share = Math.floor(bounty / qAnswers.length);
        for (const a of qAnswers) {
          if (share > 0) changeCredit(a.userId, share, '问题「' + q.title.slice(0, 10) + '...」赞数均分悬赏');
        }
      } else {
        let distributed = 0;
        for (const a of qAnswers) {
          const share = Math.floor(bounty * (a.likes || 0) / totalLikes);
          if (share > 0) {
            changeCredit(a.userId, share, '问题「' + q.title.slice(0, 10) + '...」赞数分配悬赏');
            distributed += share;
          }
        }
        // 余数给赞最多的
        const remainder = bounty - distributed;
        if (remainder > 0) {
          const top = qAnswers.sort((a, b) => (b.likes || 0) - (a.likes || 0))[0];
          changeCredit(top.userId, remainder, '问题悬赏余数奖励');
        }
      }
    }
  }
  if (changed) writeQAQuestions(questions);
}

// 定时每分钟检查到期问题
setInterval(settleExpiredQuestions, 60 * 1000);

// 获取问题列表
app.get('/api/qa/questions', (req, res) => {
  settleExpiredQuestions();
  const questions = readQAQuestions().filter(q => !q.deleted);
  const answers = readQAAnswers();
  const { status, page = 1, limit = 10 } = req.query;
  let list = questions;
  if (status) list = list.filter(q => q.status === status);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const total = list.length;
  const paged = list.slice((page - 1) * limit, page * limit);
  const result = paged.map(q => ({
    ...q,
    answerCount: answers.filter(a => a.questionId === q.id && !a.deleted).length
  }));
  res.json({ ok: true, data: result, total, page: Number(page), limit: Number(limit) });
});

// 获取我的提问
app.get('/api/qa/my-questions', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '未登录' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期' });

  const questions = readQAQuestions().filter(q => q.userId === session.id && !q.deleted);
  const answers = readQAAnswers();
  const result = questions.map(q => {
    const qaList = answers.filter(a => a.questionId === q.id && !a.deleted);
    const remainingBounty = Math.max(0, (q.bounty || 0) - (q.distributedCredits || 0));
    return {
      ...q,
      answerCount: qaList.length,
      remainingBounty,
      answers: qaList.map(a => ({ id: a.id, author: a.author, avatar: a.avatar, content: a.content, likes: a.likes, reward: a.reward || 0, createdAt: a.createdAt }))
    };
  });
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: result });
});

// 获取单个问题详情（含回答）
app.get('/api/qa/questions/:id', (req, res) => {
  settleExpiredQuestions();
  const questions = readQAQuestions();
  const q = questions.find(x => x.id === req.params.id && !x.deleted);
  if (!q) return res.json({ ok: false, msg: '问题不存在' });
  const answers = readQAAnswers().filter(a => a.questionId === q.id && !a.deleted);
  answers.sort((a, b) => {
    if (a.reward && !b.reward) return -1;
    if (!a.reward && b.reward) return 1;
    if (a.accepted) return -1;
    if (b.accepted) return 1;
    return (b.likes || 0) - (a.likes || 0);
  });
  const remainingBounty = Math.max(0, (q.bounty || 0) - (q.distributedCredits || 0));
  res.json({ ok: true, data: { ...q, answers, remainingBounty } });
});

// 发布问题
app.post('/api/qa/questions', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const { title, content, bounty = 0, images = [], sensitiveForce = false } = req.body;
  if (!title || title.trim().length < 2) return res.json({ ok: false, msg: '标题至少2个字' });
  if (title.trim().length > 100) return res.json({ ok: false, msg: '标题最多100个字' });
  if ((content || '').length > 2000) return res.json({ ok: false, msg: '内容最多2000个字' });
  const b = Math.floor(Number(bounty) || 0);
  if (b < 0) return res.json({ ok: false, msg: '悬赏不能为负数' });
  if (!Number.isInteger(b)) return res.json({ ok: false, msg: '悬赏必须为整数' });
  if (images.length > 3) return res.json({ ok: false, msg: '最多上传3张图片' });

  // 敏感词检测
  const checkText = (title.trim() + ' ' + (content || '')).trim();
  const sensitiveWords = checkSensitive(checkText);
  if (sensitiveWords.length > 0 && !sensitiveForce) {
    return res.json({ ok: false, warning: true, warningMsg: '内容包含敏感词，请修改后重试' });
  }
  // 霸凌保护姓名检测（始终阻止）
  const blockedNames = checkBullyingNames(checkText);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '内容涉及受保护人员姓名，无法发送' });
  }

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if ((user.credit || 0) < b) return res.json({ ok: false, msg: 'Credits不足，当前余额：' + (user.credit || 0) });

  // 扣除悬赏 credits
  if (b > 0) {
    user.credit = (user.credit || 0) - b;
    writeUsers(users);
    const logs = readCreditLogs();
    logs.push({
      id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: session.id,
      amount: -b,
      reason: '发布问题悬赏：' + title.slice(0, 20),
      createdAt: new Date().toISOString()
    });
    writeCreditLogs(logs);
  }

  const questions = readQAQuestions();
  const q = {
    id: 'qa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: session.id,
    author: user.nickname,
    avatar: user.avatar || '',
    title: title.trim(),
    content: (content || '').trim(),
    images,
    bounty: b,
    deadline: null,
    status: 'open', // open | accepted | expired | closed
    acceptedAnswerId: null,
    distributedCredits: 0,  // 已发放的悬赏总额
    createdAt: new Date().toISOString(),
    deleted: false
  };
  questions.push(q);
  writeQAQuestions(questions);
  res.json({ ok: true, data: q });
});

// 回答问题
app.post('/api/qa/questions/:id/answers', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const { content, images = [], sensitiveForce = false } = req.body;
  if (!content || content.trim().length < 2) return res.json({ ok: false, msg: '回答至少2个字' });
  if (content.length > 2000) return res.json({ ok: false, msg: '回答最多2000字' });
  if (images.length > 3) return res.json({ ok: false, msg: '最多上传3张图片' });

  // 敏感词检测
  const sensitiveWords = checkSensitive(content);
  if (sensitiveWords.length > 0 && !sensitiveForce) {
    return res.json({ ok: false, warning: true, warningMsg: '内容包含敏感词，请修改后重试' });
  }
  // 霸凌保护姓名检测（始终阻止）
  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '内容涉及受保护人员姓名，无法发送' });
  }

  const questions = readQAQuestions();
  const q = questions.find(x => x.id === req.params.id && !x.deleted);
  if (!q) return res.json({ ok: false, msg: '问题不存在' });
  if (q.status !== 'open') return res.json({ ok: false, msg: '该问题已关闭' });

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 不允许自答
  if (q.userId === session.id) return res.json({ ok: false, msg: '不能回答自己的问题' });

  const answers = readQAAnswers();
  // 每人只能回答一次
  if (answers.find(a => a.questionId === q.id && a.userId === session.id && !a.deleted)) {
    return res.json({ ok: false, msg: '你已回答过此问题' });
  }
  const a = {
    id: 'qa_ans_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    questionId: q.id,
    userId: session.id,
    author: user.nickname,
    avatar: user.avatar || '',
    content: content.trim(),
    images,
    likes: 0,
    likedBy: [],
    accepted: false,
    reward: 0,  // 获得的悬赏Credits
    createdAt: new Date().toISOString(),
    deleted: false
  };
  answers.push(a);
  writeQAAnswers(answers);
  res.json({ ok: true, data: a });
});

// 点赞回答
app.post('/api/qa/answers/:id/like', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const answers = readQAAnswers();
  const idx = answers.findIndex(a => a.id === req.params.id && !a.deleted);
  if (idx === -1) return res.json({ ok: false, msg: '回答不存在' });
  const a = answers[idx];
  if (a.userId === session.id) return res.json({ ok: false, msg: '不能给自己的回答点赞' });
  const likedBy = a.likedBy || [];
  if (likedBy.includes(session.id)) {
    // 取消点赞
    a.likedBy = likedBy.filter(id => id !== session.id);
    a.likes = Math.max(0, (a.likes || 0) - 1);
    writeQAAnswers(answers);
    return res.json({ ok: true, liked: false, likes: a.likes });
  }
  a.likedBy.push(session.id);
  a.likes = (a.likes || 0) + 1;
  writeQAAnswers(answers);
  res.json({ ok: true, liked: true, likes: a.likes });
});

// 采纳回答（提问者专用）
app.post('/api/qa/questions/:qid/accept/:aid', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const questions = readQAQuestions();
  const qIdx = questions.findIndex(x => x.id === req.params.qid && !x.deleted);
  if (qIdx === -1) return res.json({ ok: false, msg: '问题不存在' });
  const q = questions[qIdx];
  if (q.userId !== session.id) return res.json({ ok: false, msg: '只有提问者可以采纳答案' });
  if (q.status !== 'open') return res.json({ ok: false, msg: '该问题已关闭' });

  const answers = readQAAnswers();
  const aIdx = answers.findIndex(a => a.id === req.params.aid && a.questionId === q.id && !a.deleted);
  if (aIdx === -1) return res.json({ ok: false, msg: '回答不存在' });

  // 清除旧采纳
  answers.forEach(a => { if (a.questionId === q.id) a.accepted = false; });
  answers[aIdx].accepted = true;
  q.status = 'accepted';
  q.acceptedAnswerId = req.params.aid;
  // 奖励悬赏 credits
  if (q.bounty > 0) {
    const remaining = q.bounty - (q.distributedCredits || 0);
    if (remaining > 0) {
      changeCredit(answers[aIdx].userId, remaining, '问题「' + q.title.slice(0, 20) + '」被采纳奖励');
      answers[aIdx].reward = (answers[aIdx].reward || 0) + remaining;
      q.distributedCredits = (q.distributedCredits || 0) + remaining;
    }
  }
  writeQAQuestions(questions);
  writeQAAnswers(answers);
  res.json({ ok: true });
});

// 发放悬赏（提问者向多个回答分配 Credits）
app.post('/api/qa/questions/:id/reward', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const { rewards } = req.body; // [{ answerId, amount }]
  if (!Array.isArray(rewards) || rewards.length === 0) return res.json({ ok: false, msg: '请至少选择一个回答' });

  const questions = readQAQuestions();
  const qIdx = questions.findIndex(x => x.id === req.params.id && !x.deleted);
  if (qIdx === -1) return res.json({ ok: false, msg: '问题不存在' });
  const q = questions[qIdx];
  if (q.userId !== session.id) return res.json({ ok: false, msg: '只有提问者可以发放奖励' });
  if (!q.bounty || q.bounty <= 0) return res.json({ ok: false, msg: '该问题未悬赏Credits' });
  if (q.status === 'expired') return res.json({ ok: false, msg: '该问题已到期' });

  const remaining = q.bounty - (q.distributedCredits || 0);
  if (remaining <= 0) return res.json({ ok: false, msg: '悬赏已全部发放完毕' });

  // 校验总和
  const total = rewards.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (total <= 0) return res.json({ ok: false, msg: '发放金额不能为0' });
  if (total > remaining) return res.json({ ok: false, msg: '发放总额超出剩余悬赏（剩余 ' + remaining + ' Credits）' });

  const answers = readQAAnswers();
  for (const r of rewards) {
    const amount = Math.floor(Number(r.amount) || 0);
    if (amount <= 0) continue;
    const aIdx = answers.findIndex(a => a.id === r.answerId && a.questionId === q.id && !a.deleted);
    if (aIdx === -1) continue;
    changeCredit(answers[aIdx].userId, amount, '问题「' + q.title.slice(0, 20) + '」悬赏发放');
    answers[aIdx].reward = (answers[aIdx].reward || 0) + amount;
  }
  q.distributedCredits = (q.distributedCredits || 0) + total;
  writeQAQuestions(questions);
  writeQAAnswers(answers);
  res.json({ ok: true, distributed: total, remaining: q.bounty - q.distributedCredits });
});

// 删除问题（本人或管理员）
app.delete('/api/qa/questions/:id', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const questions = readQAQuestions();
  const idx = questions.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '问题不存在' });
  if (questions[idx].userId !== session.id) return res.json({ ok: false, msg: '无权删除' });
  if (questions[idx].status !== 'closed' && questions[idx].bounty > 0) {
    // 退还未发放的悬赏
    const remain = Math.max(0, questions[idx].bounty - (questions[idx].distributedCredits || 0));
    if (remain > 0) changeCredit(session.id, remain, '删除问题退还剩余悬赏');
  }
  questions[idx].deleted = true;
  writeQAQuestions(questions);
  res.json({ ok: true });
});

// 删除回答（本人）
app.delete('/api/qa/answers/:id', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '未登录' }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '登录已过期' });
  const answers = readQAAnswers();
  const idx = answers.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '回答不存在' });
  if (answers[idx].userId !== session.id) return res.json({ ok: false, msg: '无权删除' });
  answers[idx].deleted = true;
  writeQAAnswers(answers);
  res.json({ ok: true });
});

// 管理员获取问题列表
app.get('/api/admin/qa/questions', requireAdmin, (req, res) => {
  const questions = readQAQuestions();
  const answers = readQAAnswers();
  const list = questions.filter(q => !q.deleted).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: list.map(q => ({ ...q, answerCount: answers.filter(a => a.questionId === q.id && !a.deleted).length })) });
});

// 管理员删除问题
app.delete('/api/admin/qa/questions/:id', requireAdmin, (req, res) => {
  const questions = readQAQuestions();
  const idx = questions.findIndex(q => q.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '问题不存在' });
  if (questions[idx].status === 'open' && questions[idx].bounty > 0) {
    changeCredit(questions[idx].userId, questions[idx].bounty, '管理员删除问题退还悬赏');
  }
  questions[idx].deleted = true;
  writeQAQuestions(questions);
  res.json({ ok: true });
});

// 管理员删除回答
app.delete('/api/admin/qa/answers/:id', requireAdmin, (req, res) => {
  const answers = readQAAnswers();
  const idx = answers.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '回答不存在' });
  answers[idx].deleted = true;
  writeQAAnswers(answers);
  res.json({ ok: true });
});

// ===== 校园墙拍卖系统 =====
const PICKUP_SLOTS = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-23'];
const BASE_BID = 300;
const BID_STEP = 50;

function readPickupAuctions() {
  try {
    if (!fs.existsSync(PICKUP_AUCTION_FILE)) fs.writeFileSync(PICKUP_AUCTION_FILE, '[]', 'utf-8');
    return JSON.parse(fs.readFileSync(PICKUP_AUCTION_FILE, 'utf-8'));
  } catch { return []; }
}
function writePickupAuctions(data) {
  try { fs.writeFileSync(PICKUP_AUCTION_FILE, JSON.stringify(data, null, 2), 'utf-8'); } catch {}
}
function readPickupReports() {
  try {
    ensureDir();
    if (!fs.existsSync(PICKUP_REPORT_FILE)) fs.writeFileSync(PICKUP_REPORT_FILE, '[]', 'utf-8');
    return JSON.parse(fs.readFileSync(PICKUP_REPORT_FILE, 'utf-8'));
  } catch { return []; }
}
function writePickupReports(data) {
  try { fs.writeFileSync(PICKUP_REPORT_FILE, JSON.stringify(data, null, 2), 'utf-8'); } catch {}
}

// 获取或创建今天某个时间槽的拍卖
function getOrCreateAuction(slot, dateStr) {
  let auctions = readPickupAuctions();
  let idx = auctions.findIndex(a => a.slot === slot && a.date === dateStr);
  if (idx === -1) {
    const newAuction = {
      id: 'pau_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      slot, date: dateStr,
      bids: [], status: 'open', createdAt: new Date().toISOString()
    };
    auctions.push(newAuction);
    writePickupAuctions(auctions);
    return newAuction;
  }
  return auctions[idx];
}

// 获取当前正在显示的时段（根据当前时间）
function getCurrentSlot() {
  const h = new Date().getHours();
  if (h < 4) return '00-04';
  if (h < 8) return '04-08';
  if (h < 12) return '08-12';
  if (h < 16) return '12-16';
  if (h < 20) return '16-20';
  return '20-23';
}
function slotLabel(slot) {
  const m = { '00-04':'00:00-04:00', '04-08':'04:00-08:00', '08-12':'08:00-12:00', '12-16':'12:00-16:00', '16-20':'16:00-20:00', '20-23':'20:00-23:00' };
  return m[slot] || slot;
}

// 获取今天日期字符串
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
// 获取明天日期字符串（拍卖投的是第二天时段）
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// 获取所有时段的拍卖状态
app.get('/api/pickup/auctions', (req, res) => {
  const date = req.query.date || tomorrowStr(); // 拍卖投的是第二天的时段
  const auctions = readPickupAuctions();
  // 确保每个时段都有一个拍卖对象
  const result = PICKUP_SLOTS.map(slot => {
    const existing = auctions.find(a => a.slot === slot && a.date === date);
    if (existing) return existing;
    return getOrCreateAuction(slot, date);
  });
  res.json({
    ok: true,
    data: result.map(a => ({
      id: a.id, slot: a.slot, slotLabel: slotLabel(a.slot), date: a.date, status: a.status,
      bids: a.bids.map(b => ({ username: b.anonymous ? '匿名用户' : b.username, amount: b.amount, content: b.content, anonymous: b.anonymous, time: b.time, reviewStatus: b.reviewStatus })),
      currentPrice: a.bids.length > 0 ? Math.max(...a.bids.map(b => b.amount)) : BASE_BID,
      bidderCount: a.bids.length
    }))
  });
});

// 获取当前正在展示的拍卖内容
app.get('/api/pickup/current', (req, res) => {
  const date = todayStr();
  const currentSlot = getCurrentSlot();
  const auctions = readPickupAuctions();
  const auction = auctions.find(a => a.slot === currentSlot && a.date === date);
  if (!auction || auction.bids.length === 0) {
    return res.json({ ok: true, data: null, slot: currentSlot, slotLabel: slotLabel(currentSlot) });
  }
  // 获取所有审核通过且未被标记违规的出价，按金额降序
  const approvedBids = auction.bids
    .filter(b => b.reviewStatus === 'approved')
    .sort((a, b) => b.amount - a.amount);
  if (approvedBids.length === 0) return res.json({ ok: true, data: null, slot: currentSlot, slotLabel: slotLabel(currentSlot) });
  const highestBid = approvedBids[0];
  res.json({
    ok: true,
    slot: currentSlot,
    slotLabel: slotLabel(currentSlot),
    data: {
      bidId: highestBid.id,
      content: highestBid.content,
      anonymous: highestBid.anonymous,
      username: highestBid.anonymous ? '匿名用户' : highestBid.username
    }
  });
});

// 出价
app.post('/api/pickup/bid', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期' });

  const { slot, date, content, anonymous, amount } = req.body;
  if (!slot || !PICKUP_SLOTS.includes(slot)) return res.json({ ok: false, msg: '无效的时间段' });
  if (!content || content.trim().length === 0) return res.json({ ok: false, msg: '请输入展示内容' });
  if (content.length > 100) return res.json({ ok: false, msg: '内容不能超过100字' });
  if (!amount || amount < BASE_BID) return res.json({ ok: false, msg: '出价不能低于 ' + BASE_BID + ' Credits' });
  if (amount % BID_STEP !== 0) return res.json({ ok: false, msg: '出价必须是 ' + BID_STEP + ' 的倍数' });

  // 敏感词检测
  const sensitiveWords = checkSensitive(content);
  if (sensitiveWords.length > 0) {
    return res.json({ ok: false, warning: true, warningMsg: '内容包含敏感词，请修改后重试' });
  }
  // 霸凌保护姓名检测
  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '内容涉及受保护人员姓名，无法发送' });
  }

  const dateStr = date || tomorrowStr(); // 出价投的是第二天的时段
  const auctions = readPickupAuctions();
  const idx = auctions.findIndex(a => a.slot === slot && a.date === dateStr);
  if (idx === -1) return res.json({ ok: false, msg: '该时间槽拍卖尚未初始化' });

  const auction = auctions[idx];
  if (auction.status !== 'open') return res.json({ ok: false, msg: '该时间槽竞拍已结束' });

  const currentPrice = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.amount)) : BASE_BID;
  if (amount < currentPrice + BID_STEP) return res.json({ ok: false, msg: '出价至少为当前最高价 + ' + BID_STEP + ' Credits（当前最高：' + currentPrice + '）' });

  // 检查余额
  const users = readUsers();
  const uIdx = users.findIndex(u => u.id === session.id);
  if (uIdx === -1) return res.json({ ok: false, msg: '用户不存在' });
  const userCredit = users[uIdx].credit || 0;
  if (userCredit < amount) return res.json({ ok: false, msg: '余额不足，当前余额：' + userCredit + ' Credits' });

  // 扣减出价金额（冻结）
  changeCredit(session.id, -amount, '校园墙拍卖出价 - ' + slotLabel(slot) + ' - 出价 ' + amount + ' Credits');
  // 添加到竞价记录，默认待审核
  const bid = {
    id: 'bid_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: session.id, username: session.nickname || session.username,
    amount, content: content.trim(), anonymous: !!anonymous,
    time: new Date().toISOString(),
    reviewStatus: 'pending_review'
  };
  auction.bids.push(bid);
  writePickupAuctions(auctions);

  res.json({ ok: true, msg: '出价成功！内容已提交审核，通过后将在对应时段展示。', bid });
});

// 获取某个时段的出价详情
app.get('/api/pickup/auction-detail/:slot', (req, res) => {
  const date = req.query.date || tomorrowStr(); // 拍卖投的是第二天的时段
  const slot = req.params.slot;
  if (!PICKUP_SLOTS.includes(slot)) return res.json({ ok: false, msg: '无效的时间段' });

  const auctions = readPickupAuctions();
  const auction = auctions.find(a => a.slot === slot && a.date === date);
  if (!auction) return res.json({ ok: true, data: null });

  const currentPrice = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.amount)) : BASE_BID;
  // 对用户隐藏 userId
  const publicBids = auction.bids.map(b => ({
    username: b.anonymous ? '匿名用户' : b.username,
    amount: b.amount,
    time: b.time,
    content: b.content,
    anonymous: b.anonymous,
    reviewStatus: b.reviewStatus || 'pending_review'
  }));
  res.json({
    ok: true,
    data: {
      id: auction.id, slot, slotLabel: slotLabel(slot), date, status: auction.status,
      bids: publicBids,
      currentPrice,
      bidderCount: auction.bids.length,
      basePrice: BASE_BID,
      bidStep: BID_STEP
    }
  });
});

// 获取当前用户在所有时段的出价记录
app.get('/api/pickup/my-bids', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const auctions = readPickupAuctions();
  const myBids = [];
  for (const auction of auctions) {
    for (const bid of auction.bids) {
      if (bid.userId !== session.id) continue;
      const currentPrice = Math.max(...auction.bids.map(b => b.amount));
      myBids.push({
        bidId: bid.id,
        slot: auction.slot,
        slotLabel: slotLabel(auction.slot),
        date: auction.date,
        amount: bid.amount,
        content: bid.content,
        anonymous: bid.anonymous,
        time: bid.time,
        reviewStatus: bid.reviewStatus || 'pending_review',
        isHighest: bid.amount === currentPrice,
        approvalStatus: bid.approvalStatus || (bid.reviewStatus === 'approved' ? 'approved' : (bid.reviewStatus === 'rejected' ? 'rejected' : 'pending'))
      });
    }
  }
  // 按时间倒序
  myBids.sort((a, b) => new Date(b.time) - new Date(a.time));
  res.json({ ok: true, data: myBids });
});

// ===== 管理员：拍卖审核 =====
// 获取所有待审核的出价
app.get('/api/admin/pickup/bids', requireAdmin, (req, res) => {
  const auctions = readPickupAuctions();
  const allBids = [];
  for (const auction of auctions) {
    for (const bid of auction.bids) {
      allBids.push({
        bidId: bid.id, auctionId: auction.id,
        slot: auction.slot, slotLabel: slotLabel(auction.slot),
        date: auction.date, username: bid.username,
        userId: bid.userId, amount: bid.amount,
        content: bid.content, anonymous: bid.anonymous,
        time: bid.time, reviewStatus: bid.reviewStatus || 'pending_review'
      });
    }
  }
  // 待审核的排在最前面
  allBids.sort((a, b) => {
    if ((a.reviewStatus === 'pending_review') !== (b.reviewStatus === 'pending_review')) {
      return a.reviewStatus === 'pending_review' ? -1 : 1;
    }
    return new Date(b.time) - new Date(a.time);
  });
  res.json({ ok: true, data: allBids });
});

// 审核通过/拒绝
app.post('/api/admin/pickup/review/:bidId', requireAdmin, (req, res) => {
  const { action } = req.body; // 'approve' 或 'reject'
  if (!['approve', 'reject'].includes(action)) return res.json({ ok: false, msg: '无效操作' });

  const auctions = readPickupAuctions();
  let found = false;
  for (let ai = 0; ai < auctions.length; ai++) {
    const auction = auctions[ai];
    for (let bi = 0; bi < auction.bids.length; bi++) {
      if (auction.bids[bi].id === req.params.bidId) {
        found = true;
        if (action === 'approve') {
          auction.bids[bi].reviewStatus = 'approved';
          // 自动发送 T0 通知
          const bid = auction.bids[bi];
          const slotLabelStr = slotLabel(auction.slot);
          const notices = readNotices();
          notices.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            title: '🏆 拍卖内容已通过审核',
            content: '你在 ' + auction.date + ' ' + slotLabelStr + ' 时段提交的拍卖内容已通过审核，即将在校园墙拍卖栏展示。\n\n📝 展示内容：' + (bid.content || '(未填写)'),
            author: '系统',
            level: 'T0',
            createdAt: new Date().toISOString()
          });
          writeNotices(notices);
        } else {
          // 拒绝：标记为rejected，退还冻结的credit
          auction.bids[bi].reviewStatus = 'rejected';
          changeCredit(auction.bids[bi].userId, auction.bids[bi].amount, '校园墙拍卖内容审核未通过 - 退还出价 ' + auction.bids[bi].amount + ' Credits');
        }
        writePickupAuctions(auctions);
        return res.json({ ok: true, msg: action === 'approve' ? '已通过审核' : '已拒绝并退还 ' + auction.bids[bi].amount + ' Credits' });
      }
    }
  }
  if (!found) return res.json({ ok: false, msg: '未找到该出价记录' });
});

// ===== 滚动栏展示内容举报 =====

// 获取今天所有时段当前展示的内容（审核通过的最高出价，全部6个时段）
app.get('/api/pickup/today-content', (req, res) => {
  const date = todayStr(); // 展示的是今天的内容（昨天拍卖中标的）
  const auctions = readPickupAuctions();
  const result = [];
  for (const slot of PICKUP_SLOTS) {
    const auction = auctions.find(a => a.slot === slot && a.date === date);
    if (!auction || auction.bids.length === 0) {
      // 该时段无任何出价 → 占位
      result.push({
        bidId: null, slot, slotLabel: slotLabel(slot),
        content: '欢迎来到校园墙 😊', username: '', anonymous: false,
        amount: 0, time: '', placeholder: true
      });
      continue;
    }
    const approvedBids = auction.bids.filter(b => b.reviewStatus === 'approved');
    if (approvedBids.length === 0) {
      // 有时段但无审核通过内容 → 占位
      result.push({
        bidId: null, slot, slotLabel: slotLabel(slot),
        content: '欢迎来到校园墙 😊', username: '', anonymous: false,
        amount: 0, time: '', placeholder: true
      });
      continue;
    }
    const highest = approvedBids.reduce((max, b) => b.amount > max.amount ? b : max, approvedBids[0]);
    result.push({
      bidId: highest.id, slot, slotLabel: slotLabel(slot),
      content: highest.content, username: highest.anonymous ? '匿名用户' : highest.username,
      anonymous: highest.anonymous, amount: highest.amount, time: highest.time,
      placeholder: false
    });
  }
  res.json({ ok: true, data: result });
});

// 用户举报展示内容
app.post('/api/pickup/report-content/:bidId', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const bidId = req.params.bidId;
  const { reason } = req.body;
  const auctions = readPickupAuctions();

  // 查找该出价是否存在
  let foundBid = null;
  let foundAuction = null;
  for (const auction of auctions) {
    const bid = auction.bids.find(b => b.id === bidId);
    if (bid) { foundBid = bid; foundAuction = auction; break; }
  }
  if (!foundBid) return res.json({ ok: false, msg: '未找到该展示内容' });
  if (foundBid.reviewStatus !== 'approved') return res.json({ ok: false, msg: '该内容已不在展示中' });

  // 检查是否已举报
  const reports = readPickupReports();
  const existing = reports.find(r => r.bidId === bidId && r.reporterId === session.id);
  if (existing) return res.json({ ok: false, msg: '你已举报过该内容，请等待处理' });

  // 创建举报记录
  const report = {
    id: 'pr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    bidId,
    auctionId: foundAuction.id,
    slot: foundAuction.slot,
    slotLabel: slotLabel(foundAuction.slot),
    date: foundAuction.date,
    content: foundBid.content,
    username: foundBid.anonymous ? '匿名用户' : foundBid.username,
    userId: foundBid.userId,
    amount: foundBid.amount,
    reason: (reason || '违规内容').trim().slice(0, 200),
    reporterId: session.id,
    reporterName: session.nickname || session.username,
    status: 'pending', // pending / resolved_violation / resolved_dismissed
    time: new Date().toISOString()
  };
  reports.push(report);
  writePickupReports(reports);

  res.json({ ok: true, msg: '举报已提交，管理员将尽快处理' });
});

// 管理员：获取拍卖内容举报列表
app.get('/api/admin/pickup/reports', requireAdmin, (req, res) => {
  const reports = readPickupReports();
  // 按状态排序：pending 排最前
  reports.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.time) - new Date(a.time);
  });
  res.json({ ok: true, data: reports });
});

// 管理员：处理拍卖内容举报
app.post('/api/admin/pickup/report-action/:reportId', requireAdmin, (req, res) => {
  const { action } = req.body; // 'confirm'（确认违规） 或 'dismiss'（驳回举报）
  if (!['confirm', 'dismiss'].includes(action)) return res.json({ ok: false, msg: '无效操作' });

  const reports = readPickupReports();
  const rIdx = reports.findIndex(r => r.id === req.params.reportId);
  if (rIdx === -1) return res.json({ ok: false, msg: '举报不存在' });

  const report = reports[rIdx];
  if (report.status !== 'pending') return res.json({ ok: false, msg: '该举报已处理' });

  if (action === 'dismiss') {
    // 驳回举报：不处理内容，仅标记举报状态
    reports[rIdx].status = 'resolved_dismissed';
    reports[rIdx].resolvedAt = new Date().toISOString();
    reports[rIdx].resolvedBy = req.admin.username;
    writePickupReports(reports);
    return res.json({ ok: true, msg: '举报已驳回' });
  }

  // === 确认违规 ===
  // 1. 找出对应的出价记录
  const auctions = readPickupAuctions();
  let targetBid = null, targetAuction = null, targetAuctionIdx = -1, targetBidIdx = -1;
  for (let ai = 0; ai < auctions.length; ai++) {
    const auction = auctions[ai];
    for (let bi = 0; bi < auction.bids.length; bi++) {
      if (auction.bids[bi].id === report.bidId) {
        targetBid = auction.bids[bi];
        targetAuction = auction;
        targetAuctionIdx = ai;
        targetBidIdx = bi;
        break;
      }
    }
    if (targetBid) break;
  }

  if (!targetBid) return res.json({ ok: false, msg: '出价记录不存在或被删除' });

  // 2. 标记出价为违规
  targetBid.reviewStatus = 'violated';
  targetBid.violatedAt = new Date().toISOString();

  // 3. 封禁用户（不退还 Credits）
  const users = readUsers();
  const uIdx = users.findIndex(u => u.id === targetBid.userId);
  let banMsg = '';
  if (uIdx !== -1 && users[uIdx].status !== 'banned') {
    users[uIdx].status = 'banned';
    users[uIdx].bannedAt = new Date().toISOString();
    users[uIdx].banReason = '校园墙拍卖展示内容违规（举报处理）';
    writeUsers(users);
    banMsg = '，已封禁用户 ' + users[uIdx].username;
  }

  // 4. 查找下一个审核通过的第二高出价
  const approvedBids = targetAuction.bids
    .filter(b => b.reviewStatus === 'approved' && b.id !== report.bidId)
    .sort((a, b) => b.amount - a.amount);
  let replaceMsg = '';
  if (approvedBids.length > 0) {
    // 有下一个审核通过的出价 → 自动替换
    replaceMsg = '，已自动替换为第二出价者内容';
  } else {
    // 没有审核通过的出价 → 将在 /api/pickup/current 中返回 null，前端显示默认文案
    replaceMsg = '，该时段暂无其他审核通过内容';
  }

  writePickupAuctions(auctions);

  // 5. 更新举报状态
  reports[rIdx].status = 'resolved_violation';
  reports[rIdx].resolvedAt = new Date().toISOString();
  reports[rIdx].resolvedBy = req.admin.username;
  writePickupReports(reports);

  res.json({
    ok: true,
    msg: '已确认违规：内容已下架，Credit 不予退还' + banMsg + replaceMsg
  });
});

// 启动时修复异常认证数据：approved 无审核记录 → 降级
function fixCertDataOnStart() {
  try {
    const users = readUsers();
    let changed = false;
    users.forEach(u => {
      if (u.zhixueStatus === 'approved' && !u.zhixueReviewedBy) {
        console.warn('[启动修复] 用户', u.id, '(' + u.nickname + ') 状态为 approved 但缺少审核记录，重置为 null');
        delete u.zhixueStatus;
        changed = true;
      }
      // nully 状态的认证残留数据也清理（有 zhixueUsername/manualNote 但无 status）
      if (!u.zhixueStatus && (u.zhixueUsername || u.zhixueManualNote)) {
        // 有提交数据但状态为空 → 这可能是 bug 导致的残留，设为 pending 以触发审核
        u.zhixueStatus = 'pending';
        changed = true;
      }
    });
    if (changed) writeUsers(users);
  } catch (e) {
    console.error('[启动修复] 认证数据检查失败:', e.message);
  }
}

// ===== 学生会通知 =====
const SC_FILE = path.join(DATA_DIR, 'student_council.json');
const NOTICES_FILE = path.join(DATA_DIR, 'notices.json');

function readSC() {
  try {
    if (!fs.existsSync(SC_FILE)) return null;
    return JSON.parse(fs.readFileSync(SC_FILE, 'utf-8'));
  } catch { return null; }
}

function writeSC(data) {
  fs.writeFileSync(SC_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function readNotices() {
  try {
    if (!fs.existsSync(NOTICES_FILE)) return [];
    let notices = JSON.parse(fs.readFileSync(NOTICES_FILE, 'utf-8'));
    // 自动清理 60 天前的通知
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const before = notices.length;
    notices = notices.filter(n => {
      const t = new Date(n.createdAt).getTime();
      return !isNaN(t) && t >= cutoff;
    });
    if (notices.length < before) writeNotices(notices);
    return notices;
  } catch { return []; }
}

function writeNotices(data) {
  fs.writeFileSync(NOTICES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// 检测是否已初始化
app.get('/api/student-council/check-init', (req, res) => {
  const sc = readSC();
  res.json({ ok: true, data: { needInit: !sc } });
});

// 首次设置学生会账号
app.post('/api/student-council/init', (req, res) => {
  if (readSC()) return res.json({ ok: false, msg: '已初始化，请直接登录' });

  const { id, password, name } = req.body;
  if (!id || !/^[a-zA-Z0-9_]{3,20}$/.test(id))
    return res.json({ ok: false, msg: '账号格式：3-20位字母、数字、下划线' });
  if (!password || password.length < 6)
    return res.json({ ok: false, msg: '密码至少6位' });
  if (!name || !name.trim())
    return res.json({ ok: false, msg: '请输入名称' });

  writeSC({
    id, name: name.trim(),
    password: hashPassword(password),
    createdAt: new Date().toISOString()
  });
  res.json({ ok: true, msg: '学生会账号已创建' });
});

// 学生会登录（支持原学生会账号 + 校园墙用户登录）
app.post('/api/student-council/login', (req, res) => {
  const { id, password, captchaId, captchaText } = req.body;

  // 验证 captcha
  if (captchaId && captchaText) {
    const entry = captchaStore.get(captchaId);
    if (!entry || entry.text !== captchaText.toLowerCase()) {
      return res.json({ ok: false, msg: '验证码错误' });
    }
    captchaStore.delete(captchaId);
  }

  if (!id || !password) return res.json({ ok: false, msg: '请输入账号和密码' });

  // 尝试原学生会账号登录
  const sc = readSC();
  if (sc && sc.id === id) {
    if (!verifyPassword(password, sc.password))
      return res.json({ ok: false, msg: '账号或密码错误' });
    const token = Buffer.from(JSON.stringify({ id: sc.id, loginAt: Date.now() })).toString('base64');
    return res.json({ ok: true, data: { token, name: sc.name, type: 'sc' } });
  }

  // 尝试校园墙用户登录（需 noticePublisher 权限）
  const users = readUsers();
  const user = users.find(u => (u.nickname === id || u.id === id) && u.noticePublisher === true && u.status !== 'banned');
  if (user) {
    if (!verifyPassword(password, user.password)) {
      return res.json({ ok: false, msg: '账号或密码错误' });
    }
    const token = Buffer.from(JSON.stringify({ id: user.id, loginAt: Date.now() })).toString('base64');
    return res.json({ ok: true, data: { token, name: user.nickname, type: 'user' } });
  }

  return res.json({ ok: false, msg: '账号或密码错误' });
});

// 修改密码
app.post('/api/student-council/change-pwd', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '未登录' });
  let session;
  try { session = JSON.parse(Buffer.from(token, 'base64').toString()); } catch { return res.json({ ok: false, msg: '登录已过期' }); }
  // 验证：学生会账号 或 校园墙通知发布者
  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher === true);
  if (!isSC && !isPublisher) return res.json({ ok: false, msg: '登录已过期' });

  const { oldPwd, newPwd } = req.body;
  if (!oldPwd || !newPwd) return res.json({ ok: false, msg: '请填写完整' });
  if (!verifyPassword(oldPwd, sc.password)) return res.json({ ok: false, msg: '旧密码错误' });
  if (newPwd.length < 6) return res.json({ ok: false, msg: '新密码至少6位' });
  if (oldPwd === newPwd) return res.json({ ok: false, msg: '新旧密码不能相同' });

  sc.password = hashPassword(newPwd);
  writeSC(sc);
  res.json({ ok: true, msg: '密码已修改' });
});

// 修改昵称
app.post('/api/student-council/change-name', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '未登录' });
  let session;
  try { session = JSON.parse(Buffer.from(token, 'base64').toString()); } catch { return res.json({ ok: false, msg: '登录已过期' }); }
  // 验证：学生会账号 或 校园墙通知发布者
  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher === true);
  if (!isSC && !isPublisher) return res.json({ ok: false, msg: '登录已过期' });

  const { name } = req.body;
  if (!name || !name.trim()) return res.json({ ok: false, msg: '请输入名称' });

  sc.name = name.trim();
  writeSC(sc);
  // 返回新 token 和新名称
  const newToken = Buffer.from(JSON.stringify({ id: sc.id, loginAt: Date.now() })).toString('base64');
  res.json({ ok: true, msg: '昵称已修改', data: { token: newToken, name: sc.name } });
});

// 获取通知列表（公开，过滤已删除）
app.get('/api/notices', (req, res) => {
  const notices = readNotices();
  const active = notices.filter(n => !n.deleted);
  const list = active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
  res.json({ ok: true, data: list });
});

// 发布通知（需验证token）
app.post('/api/notices', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  let session;
  try { session = JSON.parse(Buffer.from(token, 'base64').toString()); } catch { return res.json({ ok: false, msg: '登录已过期' }); }
  // 验证：学生会账号 或 校园墙通知发布者
  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher === true);
  if (!isSC && !isPublisher) return res.json({ ok: false, msg: '登录已过期' });

  const { title, content, author, level, images } = req.body;
  if (!title || !title.trim()) return res.json({ ok: false, msg: '请填写标题' });
  if (!content || !content.trim()) return res.json({ ok: false, msg: '请填写内容' });

  // 验证图片（base64 data URL，每张≤10MB）
  var validImages = [];
  var maxSize = 10 * 1024 * 1024;
  if (Array.isArray(images)) {
    images.forEach(function(img) {
      if (typeof img === 'string' && img.startsWith('data:') && img.length <= maxSize) {
        validImages.push(img);
      }
    });
  }

  const notices = readNotices();
  notices.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    content: content.trim(),
    author: (author && author.trim()) ? author.trim() : session.name,
    level: level === 'T0' ? 'T0' : 'T1',
    images: validImages.length > 0 ? validImages : undefined,
    createdAt: new Date().toISOString()
  });
  writeNotices(notices);
  res.json({ ok: true, msg: '通知已发布' });
});

// 删除通知（需验证token）—— 软删除，60天后自动清理
app.delete('/api/notices/:id', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  let session;
  try { session = JSON.parse(Buffer.from(token, 'base64').toString()); } catch { return res.json({ ok: false, msg: '登录已过期' }); }

  // 验证：学生会账号 或 校园墙通知发布者
  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher === true && u.status !== 'banned');
  if (!isSC && !isPublisher) {
    // 检查是否存在该用户
    const userExists = users.find(u => u.id === session.id);
    if (!userExists) return res.json({ ok: false, msg: '用户不存在', code: 'USER_NOT_FOUND' });
    return res.json({ ok: false, msg: '无通知发布权限', code: 'NO_PERMISSION' });
  }

  const notices = readNotices();
  const notice = notices.find(n => n.id === req.params.id);
  if (!notice) return res.json({ ok: false, msg: '通知不存在' });
  if (notice.deleted) return res.json({ ok: false, msg: '通知已被删除' });

  notice.deleted = true;
  notice.deletedAt = new Date().toISOString();
  writeNotices(notices);
  res.json({ ok: true, msg: '通知已删除' });
});

// 置顶/取消置顶通知
app.post('/api/notices/:id/pin', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  let session;
  try { session = JSON.parse(Buffer.from(token, 'base64').toString()); } catch { return res.json({ ok: false, msg: '登录已过期' }); }
  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher === true && u.status !== 'banned');
  if (!isSC && !isPublisher) {
    const userExists = users.find(u => u.id === session.id);
    if (!userExists) return res.json({ ok: false, msg: '用户不存在', code: 'USER_NOT_FOUND' });
    return res.json({ ok: false, msg: '无通知发布权限', code: 'NO_PERMISSION' });
  }

  const notices = readNotices();
  const notice = notices.find(n => n.id === req.params.id);
  if (!notice) return res.json({ ok: false, msg: '通知不存在' });
  if (notice.deleted) return res.json({ ok: false, msg: '通知已被删除' });

  notice.pinned = !notice.pinned;
  if (notice.pinned) {
    notice.pinnedAt = new Date().toISOString();
  } else {
    notice.pinnedAt = null;
  }
  notice.updatedAt = new Date().toISOString();
  writeNotices(notices);
  res.json({ ok: true, msg: notice.pinned ? '已置顶' : '已取消置顶', pinned: notice.pinned });
});

// 同步通知到其他平台
app.post('/api/notices/:id/sync', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  let session;
  try { session = JSON.parse(Buffer.from(token, 'base64').toString()); } catch { return res.json({ ok: false, msg: '登录已过期' }); }
  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher === true && u.status !== 'banned');
  if (!isSC && !isPublisher) {
    const userExists = users.find(u => u.id === session.id);
    if (!userExists) return res.json({ ok: false, msg: '用户不存在', code: 'USER_NOT_FOUND' });
    return res.json({ ok: false, msg: '无通知发布权限', code: 'NO_PERMISSION' });
  }

  const notices = readNotices();
  const notice = notices.find(n => n.id === req.params.id);
  if (!notice) return res.json({ ok: false, msg: '通知不存在' });
  if (notice.deleted) return res.json({ ok: false, msg: '通知已被删除' });

  notice.synced = true;
  notice.syncedAt = new Date().toISOString();
  notice.updatedAt = new Date().toISOString();
  writeNotices(notices);
  res.json({ ok: true, msg: '同步成功' });
});

// 修改通知（需验证token）
app.put('/api/notices/:id', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  let session;
  try { session = JSON.parse(Buffer.from(token, 'base64').toString()); } catch { return res.json({ ok: false, msg: '登录已过期' }); }
  // 验证：学生会账号 或 校园墙通知发布者
  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher === true && u.status !== 'banned');
  if (!isSC && !isPublisher) {
    // 检查是否存在该用户
    const userExists = users.find(u => u.id === session.id);
    if (!userExists) return res.json({ ok: false, msg: '用户不存在', code: 'USER_NOT_FOUND' });
    return res.json({ ok: false, msg: '无通知发布权限', code: 'NO_PERMISSION' });
  }

  const { title, content, author, level, images } = req.body;
  if (!title || !title.trim()) return res.json({ ok: false, msg: '请填写标题' });
  if (!content || !content.trim()) return res.json({ ok: false, msg: '请填写内容' });

  var maxSize = 10 * 1024 * 1024;
  var validImages = [];
  if (Array.isArray(images)) {
    images.forEach(function(img) {
      if (typeof img === 'string' && img.startsWith('data:') && img.length <= maxSize) {
        validImages.push(img);
      }
    });
  }

  const notices = readNotices();
  const notice = notices.find(n => n.id === req.params.id);
  if (!notice) return res.json({ ok: false, msg: '通知不存在' });
  if (notice.deleted) return res.json({ ok: false, msg: '通知已被删除' });

  notice.title = title.trim();
  notice.content = content.trim();
  if (author && author.trim()) notice.author = author.trim();
  if (level) notice.level = level === 'T0' ? 'T0' : 'T1';
  if (Array.isArray(images)) {
    notice.images = validImages.length > 0 ? validImages : undefined;
  }
  notice.updatedAt = new Date().toISOString();
  writeNotices(notices);
  res.json({ ok: true, msg: '通知已修改' });
});

// ===== 通知发布账号申请 =====
const APP_FILE = path.join(DATA_DIR, 'notice_applications.json');
const PASSKEY_FILE = path.join(DATA_DIR, 'notice_passkey.json');

function readPasskey() {
  try {
    if (!fs.existsSync(PASSKEY_FILE)) return null;
    return JSON.parse(fs.readFileSync(PASSKEY_FILE, 'utf-8'));
  } catch { return null; }
}

function writePasskey(data) {
  fs.writeFileSync(PASSKEY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function readApps() {
  try {
    if (!fs.existsSync(APP_FILE)) return [];
    return JSON.parse(fs.readFileSync(APP_FILE, 'utf-8'));
  } catch { return []; }
}

function writeApps(data) {
  fs.writeFileSync(APP_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// 提交申请（公开，需 pass-key）
app.post('/api/notice-account/apply', (req, res) => {
  const { name, department, contact, reason, passkey, captchaId, captchaText } = req.body;

  // 验证用户登录
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录校园墙账号', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });

  // 验证 captcha
  const entry = captchaStore.get(captchaId);
  if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
    return res.json({ ok: false, msg: '验证码错误' });
  }
  captchaStore.delete(captchaId);

  if (!name || !name.trim()) return res.json({ ok: false, msg: '请填写申请人姓名' });
  if (!department || !department.trim()) return res.json({ ok: false, msg: '请填写部门/组织' });
  if (!contact || !contact.trim()) return res.json({ ok: false, msg: '请填写联系方式' });
  if (!reason || !reason.trim()) return res.json({ ok: false, msg: '请填写申请理由' });

  const apps = readApps();
  // 每人只能申请一次（除非被驳回）
  const existing = apps.find(a => a.userId === session.id && a.status !== 'rejected');
  if (existing) {
    const hint = existing.status === 'pending' ? '请等待审核结果' : '你的申请已通过';
    return res.json({ ok: false, msg: '你已提交过申请，' + hint });
  }

  // 验证 pass-key（选填）
  const stored = readPasskey();
  const hasValidPasskey = stored && stored.key && passkey && passkey.trim() === stored.key;
  const hasPasskeyInput = passkey && passkey.trim().length > 0;

  if (hasValidPasskey) {
    // 通行码正确 → 自动通过，直接授予通知发布权限
    const users = readUsers();
    const targetUser = users.find(u => u.id === session.id);
    if (targetUser) {
      targetUser.noticePublisher = true;
      targetUser.noticePublisherAddedAt = new Date().toISOString();
      targetUser._noticeAppNotification = {
        status: 'approved',
        message: '你的通知发布申请已通过！你可以使用校园墙账号密码登录 notice.html 管理通知',
        timestamp: new Date().toISOString()
      };
      writeUsers(users);
    }
    apps.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      department: department.trim(),
      contact: contact.trim(),
      reason: reason.trim(),
      status: 'approved', // 自动通过
      userId: session.id,
      userNickname: session.nickname || name.trim(),
      createdAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'system'
    });
    writeApps(apps);
    res.json({ ok: true, msg: '🎉 通行码验证通过，你已获得通知发布权限！' });
  } else if (hasPasskeyInput) {
    // 有通行码但不匹配 → 返回错误
    res.json({ ok: false, msg: '通行码错误，请确认后重新输入' });
  } else {
    // 无通行码 → 提交申请，等待管理员审核
    apps.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name.trim(),
      department: department.trim(),
      contact: contact.trim(),
      reason: reason.trim(),
      status: 'pending',
      userId: session.id,
      userNickname: session.nickname || name.trim(),
      createdAt: new Date().toISOString()
    });
    writeApps(apps);
    res.json({ ok: true, msg: '申请已提交，请等待管理员审核' });
  }
});

// 获取用户的通知申请审核结果通知（读取后清除）
app.get('/api/user/notice-app-notification', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, data: null });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, data: null });

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user || !user._noticeAppNotification) return res.json({ ok: true, data: null });

  const notif = user._noticeAppNotification;
  // 清除通知（一次性读取）
  delete user._noticeAppNotification;
  writeUsers(users);

  res.json({ ok: true, data: notif });
});

// 查看申请列表（仅管理员）
app.get('/api/admin/notice-applications', requireAdmin, (req, res) => {
  const apps = readApps().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: apps });
});

// 审核申请（仅管理员）
app.post('/api/admin/notice-applications/:id/review', requireAdmin, (req, res) => {
  const { action, accountId, accountName, accountPwd } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.json({ ok: false, msg: '无效操作' });

  const apps = readApps();
  const app = apps.find(a => a.id === req.params.id);
  if (!app) return res.json({ ok: false, msg: '申请不存在' });
  if (app.status !== 'pending') return res.json({ ok: false, msg: '该申请已处理' });

  if (action === 'reject') {
    app.status = 'rejected';
    app.reviewedAt = new Date().toISOString();
    app.reviewedBy = req.admin.id;
    writeApps(apps);

    // 存储通知到用户记录
    const users = readUsers();
    const targetUser = users.find(u => u.id === app.userId);
    if (targetUser) {
      targetUser._noticeAppNotification = {
        status: 'rejected',
        message: '你的通知发布申请已被驳回，可以重新提交申请',
        timestamp: new Date().toISOString()
      };
      writeUsers(users);
    }

    return res.json({ ok: true, msg: '已拒绝该申请' });
  }

  // 通过：标记校园墙用户为通知发布者
  const users = readUsers();
  const targetUser = users.find(u => u.id === app.userId);
  if (!targetUser) {
    return res.json({ ok: false, msg: '未找到对应的校园墙用户，请确认该用户已注册' });
  }

  targetUser.noticePublisher = true;
  targetUser.noticePublisherAddedAt = new Date().toISOString();
  targetUser._noticeAppNotification = {
    status: 'approved',
    message: '你的通知发布申请已通过！你可以使用校园墙账号密码登录 notice.html 管理通知',
    timestamp: new Date().toISOString()
  };
  writeUsers(users);

  app.status = 'approved';
  app.reviewedAt = new Date().toISOString();
  app.reviewedBy = req.admin.id;
  writeApps(apps);

  res.json({ ok: true, msg: '已通过，该用户可使用校园墙账号密码登录通知管理页面' });
});

// 获取当前 pass-key（仅管理员）
app.get('/api/admin/notice-passkey', requireAdmin, (req, res) => {
  const stored = readPasskey();
  res.json({ ok: true, data: { hasKey: !!stored && !!stored.key, key: stored ? stored.key : null, createdAt: stored ? stored.createdAt : null } });
});

// 生成/刷新 pass-key（仅管理员）
app.post('/api/admin/notice-passkey', requireAdmin, (req, res) => {
  const { action, key } = req.body;
  if (action === 'clear') {
    writePasskey({});
    return res.json({ ok: true, msg: '通行码已清空，暂停申请' });
  }

  // 自动生成或手动设置
  const newKey = (key && key.trim()) ? key.trim() : Math.random().toString(36).slice(2, 10).toUpperCase();
  writePasskey({ key: newKey, createdAt: new Date().toISOString(), createdBy: req.admin.id });
  res.json({ ok: true, msg: '通行码已生成', data: { key: newKey } });
});

// ===== 通知发布者管理（仅管理员） =====
// 获取所有通知发布者
app.get('/api/admin/notice-publishers', requireAdmin, (req, res) => {
  const users = readUsers();
  const publishers = users
    .filter(u => u.noticePublisher === true)
    .map(u => ({
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      createdAt: u.noticePublisherAddedAt || u.createdAt || '',
      appsCount: (readApps().filter(a => a.userId === u.id && a.status === 'approved').length)
    }));
  res.json({ ok: true, data: publishers });
});

// 移除通知发布者权限
app.post('/api/admin/notice-publishers/remove', requireAdmin, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ ok: false, msg: '请指定用户ID' });
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (!user.noticePublisher) return res.json({ ok: false, msg: '该用户不是通知发布者' });

  user.noticePublisher = false;
  writeUsers(users);
  res.json({ ok: true, msg: '已移除发布权限' });
});

app.listen(PORT, () => {
  fixCertDataOnStart();
  console.log(`\n  📌 校园墙服务已启动`);
  console.log(`  → http://localhost:${PORT}/`);
  console.log(`  → http://localhost:${PORT}/admin.html`);
  console.log(`\n  🔐 超级管理员账号: wr1Ench / cai091226\n`);
});

