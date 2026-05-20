const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const svgCaptcha = require('svg-captcha');
const { check: checkSensitive, reload: reloadSensitive, getStats: getSensitiveStats } = require('./sensitiveWords');
const { check: checkBullyingNames, addName: addBullyingName, removeName: removeBullyingName, getAll: getAllBullyingNames, reload: reloadBullyingNames } = require('./bullyingNames');

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
    // 排除包含 base64 或特殊格式的字段不过滤
    const { avatar, manualImages, manualEmail, challenge, prefix, nonce, images, ...rest } = req.body;
    req.body = {
      ...sanitizeString(rest),
      ...(avatar !== undefined ? { avatar } : {}),
      ...(manualImages !== undefined ? { manualImages } : {}),
      ...(manualEmail !== undefined ? { manualEmail } : {}),
      ...(challenge !== undefined ? { challenge } : {}),
      ...(prefix !== undefined ? { prefix } : {}),
      ...(nonce !== undefined ? { nonce } : {}),
      ...(images !== undefined ? { images } : {})
    };
  }
  next();
});

// ===== PoW 工作量证明盾（参考 Anubis 设计）=====
const POW_SECRET = crypto.randomBytes(32).toString('hex');
const POW_TTL = 30 * 60 * 1000;
const POW_ENABLED = true;
const POW_DIFFICULTY = 16; // 难度：要求 SHA256 前 N 位为 0（16 ≈ 6万次 ≈ 1-2秒）

// 统计前导零位数
function countLeadingZeroBits(buf) {
  let count = 0;
  for (const byte of buf) {
    if (byte === 0) { count += 8; continue; }
    for (let b = 7; b >= 0; b--) {
      if ((byte >> b) & 1) break;
      count++;
    }
    break;
  }
  return count;
}

// PoW 验证
function powVerify(prefix, nonce, difficulty) {
  const hash = crypto.createHash('sha256').update(prefix + nonce).digest();
  return countLeadingZeroBits(hash) >= difficulty;
}

// 生成 PoW cookie 令牌
function powMakeToken() {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  const sig = crypto.createHmac('sha256', POW_SECRET).update(ts + rand).digest('hex').slice(0, 12);
  return ts + '.' + rand + '.' + sig;
}
function powVerifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [ts, rand, sig] = parts;
  const expected = crypto.createHmac('sha256', POW_SECRET).update(ts + rand).digest('hex').slice(0, 12);
  if (sig !== expected) return false;
  if (Date.now() - parseInt(ts, 36) > 300000) return false; // 5分钟超时
  return true;
}

// PoW 盾中间件
app.use((req, res, next) => {
  if (!POW_ENABLED) return next();
  if (req.path === '/api/__pow_challenge') return next();
  if (req.path === '/favicon.ico') return next();
  if (req.cookies && req.cookies._pow_clearance && powVerifyToken(req.cookies._pow_clearance)) {
    return next();
  }

  const challengePrefix = crypto.randomBytes(16).toString('hex');
  const difficulty = POW_DIFFICULTY;
  const rayId = crypto.randomBytes(4).toString('hex');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>请稍候…</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    background:#f6f6f6;color:#555;
    display:flex;align-items:center;justify-content:center;
    min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    flex-direction:column;
  }
  .wrap{
    background:#fff;border-radius:12px;
    padding:48px 56px 40px;
    box-shadow:0 1px 4px rgba(0,0,0,0.07);
    text-align:center;max-width:460px;
  }
  .shield svg{width:56px;height:56px;display:block;margin:0 auto 20px}
  .title{font-size:16px;font-weight:500;color:#333;margin-bottom:6px;line-height:1.5}
  .desc{font-size:13px;color:#888;line-height:1.6;margin-bottom:4px}
  .pow-info{font-size:11px;color:#aaa;margin-bottom:2px;font-family:monospace}
  .spinner-wrap{margin:24px auto 20px}
  .spinner{width:42px;height:42px;border:4px solid #e8e8e8;border-top-color:#f5a623;border-radius:50%;animation:spin .75s linear infinite;margin:0 auto}
  @keyframes spin{to{transform:rotate(360deg)}}
  .progress-wrap{width:100%;height:6px;background:#eee;border-radius:3px;margin:16px 0 6px;overflow:hidden}
  .progress-bar{height:100%;background:linear-gradient(90deg,#f5a623,#f7c948);border-radius:3px;width:0%;transition:width .3s}
  .status{font-size:13px;color:#888;margin-top:4px}
  .success{color:#22c55e;font-weight:500}
  .fail{color:#ef4444}
  .footer{margin-top:32px;font-size:11px;color:#bbb;text-align:center}
  .footer svg{vertical-align:middle;margin-right:4px}
  .footer a{color:#bbb;text-decoration:none}
  .ray{font-size:10px;color:#ccc;margin-top:4px}
</style>
</head>
<body>
  <div class="wrap">
    <div class="shield">
      <svg viewBox="0 0 56 56" fill="none">
        <path d="M28 4L6 14v12c0 14.5 9.5 28 22 32 12.5-4 22-17.5 22-32V14L28 4z" fill="#e8f0fe" stroke="#4285f4" stroke-width="1.5"/>
        <path d="M24 30l4 4 8-10" stroke="#34a853" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
    </div>

    <div class="title" id="statusText">让我们确保此连接安全</div>
    <div class="desc">正在验证中，请稍候…</div>
    <div class="pow-info">复杂度: 2<sup>${difficulty}</sup> ≈ ${Math.round(Math.pow(2, difficulty)/10000)/100} 万次 SHA256</div>

    <div class="spinner-wrap" id="spinnerWrap">
      <div class="spinner"></div>
      <div class="progress-wrap"><div class="progress-bar" id="progressBar"></div></div>
      <div class="small" id="powStatus" style="font-size:11px;color:#aaa;">计算中…</div>
    </div>

    <div class="status" id="statusDetail"></div>
  </div>

  <div class="footer">
    <svg width="12" height="12" viewBox="0 0 16 16"><path d="M8 1a7 7 0 100 14A7 7 0 008 1z" fill="#ccc"/><path d="M7 5h2v5H7V5zm0-2h2v1H7V3z" fill="#fff"/></svg>
    PoW 防护 by <a href="#">wr1Ench</a>
    <div class="ray">challenge: ${challengePrefix.slice(0,8)} | difficulty: ${difficulty} | ray: ${rayId}</div>
  </div>

<script>
  var prefix = "${challengePrefix}";
  var target = location.href;
  var difficulty = ${difficulty};

  // 使用浏览器原生 Web Crypto API，与 Node.js crypto 完全一致
  var enc = new TextEncoder();

  async function sha256bytes(msg) {
    var buf = enc.encode(msg);
    var hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return new Uint8Array(hashBuf);
  }

  function countLeadingZeros(buf) {
    var count = 0;
    for (var i = 0; i < buf.length; i++) {
      if (buf[i] === 0) { count += 8; continue; }
      for (var b = 7; b >= 0; b--) {
        if ((buf[i] >> b) & 1) break;
        count++;
      }
      break;
    }
    return count;
  }

  var bar = document.getElementById('progressBar');
  var powEl = document.getElementById('powStatus');
  var statusEl = document.getElementById('statusDetail');

  var nonce = 0;
  var maxAttempts = Math.pow(2, difficulty) * 4; // 最多尝试 4 倍期望值
  var started = Date.now();

  (async function solve() {
    while (nonce < maxAttempts) {
      if (nonce % 512 === 0) {
        await new Promise(function(r){ setTimeout(r, 0); });
        var pct = Math.min(100, (nonce / maxAttempts) * 100);
        bar.style.width = pct + '%';
        powEl.textContent = '计算中… ' + nonce.toLocaleString() + ' 次 (' + Math.round(pct) + '%)';
      }

      var test = prefix + nonce;
      var h = await sha256bytes(test);
      if (countLeadingZeros(h) >= difficulty) {
        var elapsed = ((Date.now() - started) / 1000).toFixed(1);
        powEl.textContent = '找到解，耗时 ' + elapsed + ' 秒（尝试 ' + (nonce + 1) + ' 次）';
        bar.style.width = '100%';

        var remaining = Math.max(0, 5000 - (Date.now() - started));
        if (remaining > 0) {
          await new Promise(function(r){ setTimeout(r, remaining); });
        }

        try {
          var resp = await fetch('/api/__pow_challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: prefix, nonce: '' + nonce }),
            credentials: 'same-origin'
          });
          var jr = await resp.json();
          if (jr.ok) {
            statusEl.innerHTML = '<span class="success">✓ 验证通过，正在跳转…</span>';
            setTimeout(function(){ location.href = target; }, 300);
          } else {
            statusEl.innerHTML = '<span class="fail">PoW 验证失败：' + (jr.msg || '未知错误') + '</span>';
          }
        } catch(e) {
          statusEl.innerHTML = '<span class="fail">网络错误，请刷新重试</span>';
        }
        return;
      }
      nonce++;
    }
    statusEl.innerHTML = '<span class="fail">计算超时，请刷新重试</span>';
  })();
</script>
</body>
</html>`;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// PoW 挑战验证 + 颁发 cookie
app.post('/api/__pow_challenge', (req, res) => {
  const { prefix, nonce } = req.body;
  if (!prefix || nonce === undefined) return res.json({ ok: false, msg: '参数不完整' });
  if (typeof prefix !== 'string' || prefix.length !== 32) return res.json({ ok: false, msg: '无效挑战' });
  const n = parseInt(nonce);
  if (isNaN(n) || n < 0 || n > 1000000000) return res.json({ ok: false, msg: 'nonce 超出范围' });
  if (!powVerify(prefix, nonce, POW_DIFFICULTY)) return res.json({ ok: false, msg: 'PoW 验证失败' });

  const token = powMakeToken();
  res.cookie('_pow_clearance', token, { maxAge: POW_TTL, httpOnly: true, sameSite: 'lax', path: '/' });
  res.json({ ok: true });
});

app.use(express.static(__dirname)); // 静态文件服务（放在盾后面）

const CONTENT_MAX_LENGTH = 200; // 帖子/评论字数上限

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

function hasAdmins() {
  return fs.existsSync(ADMINS_FILE) && readAdmins().length > 0;
}

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
  const ip = req.ip || req.headers['x-forwarded-for'] || '-';
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

  const ip = req.ip || req.headers['x-forwarded-for'] || '-';
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
      avatar: newUser.avatar
    }
  });
});

// 登录
app.post('/api/user/login', (req, res) => {
  const { username, password, captchaId, captchaText } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || '-';
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
      avatar: user.avatar
    }
  });
});

// 智学网账号登录（通过已认证的智学账号登录校园墙）
app.post('/api/user/zhixue-login', (req, res) => {
  const { zhixueUsername, password, captchaId, captchaText } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || '-';
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
  const user = users.find(u => u.zhixueUsername === zhixueUsername && u.zhixueStatus === 'approved');
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
      avatar: user.avatar
    }
  });
});
;

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
  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole, credit: user.credit || 0, checkinToday: user.lastCheckinDate === new Date().toISOString().slice(0, 10), checkinStreak: user.checkinStreak || 0 } });
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

  const realName = decryptCert ? decryptCert(user.certRealName) : null;
  res.json({
    ok: true,
    data: {
      type: user.zhixueCertType || 'zhixue',
      zhixueUsername: user.zhixueUsername,
      status: user.zhixueStatus || 'pending',
      submittedAt: user.zhixueSubmittedAt || null,
      realName: (user.zhixueStatus === 'approved' && realName) ? realName : null
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
  const { action, realName, className } = req.body; // action: approve | reject
  if (!['approve', 'reject'].includes(action)) {
    return res.json({ ok: false, msg: '无效的操作' });
  }
  // 通过时：智学认证必须填写姓名；手动认证有 manualName 兜底，管理员可不填
  if (action === 'approve') {
    const u = (readUsers()).find(u => u.id === req.params.userId);
    const isManual = u && u.zhixueCertType === 'manual';
    const hasManualName = u && u.zhixueManualName;
    if (!isManual && !hasManualName && (!realName || !realName.trim())) {
      return res.json({ ok: false, msg: '请填写学生姓名' });
    }
  }
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === req.params.userId);
  if (userIndex === -1) return res.json({ ok: false, msg: '用户不存在' });

  users[userIndex].zhixueStatus = action === 'approve' ? 'approved' : 'rejected';
  users[userIndex].zhixueReviewedAt = new Date().toISOString();
  users[userIndex].zhixueReviewedBy = req.admin.id;

  // 通过后：加密存储姓名班级，隐藏密码
  if (action === 'approve') {
    users[userIndex].zhixuePassword = null;
    // 智学验证：管理员填写的姓名；手动认证：若管理员填了就用管理员的，否则用用户提交的 manualName
    const nameToStore = (realName && realName.trim())
      ? realName.trim()
      : (users[userIndex].zhixueManualName || null);
    if (nameToStore) {
      users[userIndex].certRealName = encryptCert(nameToStore);
    }
    users[userIndex].certClassName = className && className.trim() ? encryptCert(className.trim()) : null;
  }
  writeUsers(users);

  res.json({ ok: true, msg: action === 'approve' ? '已通过审核' : '已拒绝' });
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
  if (val < 1 || val > 500) return res.json({ ok: false, msg: '单张面值范围 1~500' });

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
  const userPosts = posts.filter(p => p.userId === user.id || p.author === user.nickname);
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

// 删除用户（仅管理员）—— 同时删除该用户的所有帖子
app.delete('/api/admin/user/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  let users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });

  // 先删除该用户的所有帖子
  let posts = readPosts();
  const userNickname = user.nickname;
  const beforePostCount = posts.length;
  posts = posts.filter(p => p.userId !== userId && p.author !== userNickname);
  const deletedPostCount = beforePostCount - posts.length;
  writePosts(posts);

  // 再删除用户
  users = users.filter(u => u.id !== userId);
  writeUsers(users);

  res.json({ ok: true, deletedPosts: deletedPostCount });
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
  const users = readUsers();
  // 为每个帖子附加作者的管理员角色信息
  const postsWithAdmin = posts.map(p => {
    if (p.userId) {
      const author = users.find(u => u.id === p.userId);
      if (author && author.bindAdminRole) {
        return { ...p, authorAdminRole: author.bindAdminRole, authorBindAdminId: author.bindAdminId };
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
  if (post.userId) {
    const users = readUsers();
    const author = users.find(u => u.id === post.userId);
    if (author && author.bindAdminRole) {
      return res.json({ ok: true, data: { ...post, authorAdminRole: author.bindAdminRole, authorBindAdminId: author.bindAdminId } });
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

// 删除评论（评论作者或帖子作者可删）
app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
  const userId = req.headers['x-user-token'] ? (() => {
    try { return JSON.parse(Buffer.from(req.headers['x-user-token'].split('.')[1], 'base64').toString()).id; } catch { return null; }
  })() : null;
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  const idx = (post.comments || []).findIndex(c => c.id === req.params.commentId);
  if (idx === -1) return res.json({ ok: false, msg: '评论不存在' });
  const comment = post.comments[idx];
  const isCommentAuthor = userId && comment.userId && userId === comment.userId;
  const isPostAuthor = userId && post.userId && userId === post.userId;
  if (!isCommentAuthor && !isPostAuthor) {
    return res.json({ ok: false, msg: '无权删除此评论' });
  }
  post.comments.splice(idx, 1);
  post.commentsCount = post.comments.length;
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

// 批量删除评论（管理后台）
app.delete('/api/admin/comments/:commentId', requireAdmin, (req, res) => {
  const posts = readPosts();
  let found = false;
  posts.forEach(post => {
    const idx = (post.comments || []).findIndex(c => c.id === req.params.commentId);
    if (idx !== -1) {
      post.comments.splice(idx, 1);
      post.commentsCount = post.comments.length;
      found = true;
    }
  });
  if (!found) return res.json({ ok: false, msg: '评论不存在' });
  writePosts(posts);
  // 同时删除该评论的举报记录
  const reports = readReports();
  const remaining = reports.filter(r => r.targetId !== req.params.commentId || r.type !== 'comment');
  writeReports(reports);
  res.json({ ok: true });
});

app.post('/api/comments/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ ok: false, msg: '请提供要删除的评论 ID 列表' });
  const posts = readPosts();
  let deletedCount = 0;
  posts.forEach(post => {
    const before = post.comments ? post.comments.length : 0;
    if (post.comments) {
      post.comments = post.comments.filter(c => !ids.includes(c.id));
      post.commentsCount = post.comments.length;
      deletedCount += before - post.comments.length;
    }
  });
  writePosts(posts);
  // 同时删除相关的举报记录
  const reports = readReports();
  const remainingReports = reports.filter(r => !ids.includes(r.targetId) || r.type !== 'comment');
  writeReports(reports);
  res.json({ ok: true, deleted: deletedCount });
});

// 批量删除帖子
app.post('/api/posts/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ ok: false, msg: '请提供要删除的帖子 ID 列表' });
  }
  let posts = readPosts();
  const before = posts.length;
  posts = posts.filter(p => !ids.includes(p.id));
  writePosts(posts);
  res.json({ ok: true, deleted: before - posts.length });
});

// 删除帖子（仅管理员）
app.delete('/api/posts/:id', requireAdmin, (req, res) => {
  let posts = readPosts();
  const before = posts.length;
  posts = posts.filter(p => p.id !== req.params.id);

  if (posts.length === before) {
    return res.json({ ok: false, msg: '帖子不存在' });
  }

  writePosts(posts);
  res.json({ ok: true });
});

// 用户删除自己发的帖子
app.delete('/api/user/posts/:id', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '帖子不存在' });
  if (post.userId !== session.id) return res.json({ ok: false, msg: '无权删除他人的帖子' });

  const updated = posts.filter(p => p.id !== req.params.id);
  writePosts(updated);
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
    .filter(d => !d.expiresAt || parseLocalDateTime(d.expiresAt) > now)
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

// 删除讨论话题（管理员）
app.delete('/api/discussions/:id', requireAdmin, (req, res) => {
  let discussions = readDiscussions();
  const before = discussions.length;
  discussions = discussions.filter(d => d.id !== req.params.id);
  if (discussions.length === before) return res.json({ ok: false, msg: '话题不存在' });
  writeDiscussions(discussions);

  // 同时删除该话题下的所有评论
  let comments = readDiscussionComments();
  const remaining = comments.filter(c => c.discussionId !== req.params.id);
  writeDiscussionComments(remaining);

  res.json({ ok: true });
});

// 获取某个话题的评论（嵌套结构）
app.get('/api/discussions/:id/comments', (req, res) => {
  const comments = readDiscussionComments();
  const discussionComments = comments
    .filter(c => c.discussionId === req.params.id)
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

// 删除讨论评论（发送者或管理员可删）
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
  const idx = comments.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '评论不存在' });

  const comment = comments[idx];
  // 检查权限：评论作者、回复作者、管理员
  const isAuthor = userId && comment.userId && userId === comment.userId;
  const isParentAuthor = userId && comment.parentId
    ? (() => { const parent = comments.find(c => c.id === comment.parentId); return parent && parent.userId && parent.userId === userId; })()
    : false;

  if (!isAdmin && !isAuthor && !isParentAuthor) {
    return res.json({ ok: false, msg: '无权删除此评论' });
  }

  comments.splice(idx, 1);
  // 同时删除所有子回复
  const children = comments.filter(c => c.parentId === req.params.id);
  const childIds = children.map(c => c.id);
  const remaining = comments.filter(c => c.id !== req.params.id && !childIds.includes(c.id));
  writeDiscussionComments(remaining);

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

  // 如果 action 是 delete_post，同时删除被举报的帖子
  if (action === 'delete_post' && report.postId) {
    let posts = readPosts();
    posts = posts.filter(p => p.id !== report.postId);
    writePosts(posts);
  }
  // 如果 action 是 delete_comment，同时删除被举报的评论
  if (action === 'delete_comment' && report.targetId && report.type === 'comment') {
    let posts = readPosts();
    posts.forEach(post => {
      if (post.comments) {
        post.comments = post.comments.filter(c => c.id !== report.targetId);
        post.commentsCount = post.comments.length;
      }
    });
    writePosts(posts);
  }
  // 如果 action 是 delete_discussion_comment，同时删除被举报的讨论区评论
  if (action === 'delete_discussion_comment' && report.targetId && report.type === 'discussion_comment') {
    const comments = readDiscussionComments();
    const filtered = comments.filter(c => c.id !== report.targetId);
    writeDiscussionComments(filtered);
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

// ===== 在线用户统计 =====
const onlineUsers = new Map(); // userId -> lastHeartbeat (timestamp)
const ONLINE_TIMEOUT = 120000; // 2 分钟无心跳视为离线

// 心跳接口（用户登录后定时调用）
app.post('/api/user/heartbeat', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) { onlineUsers.set('anon_' + req.ip, Date.now()); return res.json({ ok: true }); }
  const session = verifyUserToken(token);
  if (!session || !session.id) { onlineUsers.set('anon_' + req.ip, Date.now()); return res.json({ ok: true }); }
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
    handleNote: null
  };
  reports.unshift(newReport);
  writeBullying(reports);
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
  reports[idx].handledBy = req.session.admin.nickname || req.session.admin.username;
  reports[idx].handledAt = new Date().toISOString();
  writeBullying(reports);
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

app.listen(PORT, () => {
  console.log(`\n  📌 校园墙服务已启动`);
  console.log(`  → http://localhost:${PORT}/`);
  console.log(`  → http://localhost:${PORT}/admin.html`);
  console.log(`\n  🔐 超级管理员账号: wr1Ench / cai091226\n`);
});
