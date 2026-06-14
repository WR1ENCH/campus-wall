const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const db = require('./db');
const svgCaptcha = require('svg-captcha');
const { check: checkSensitive, reload: reloadSensitive, getStats: getSensitiveStats, WHITELIST_FILE, saveWhitelist } = require('./sensitiveWords');
const { check: checkBullyingNames, addName: addBullyingName, removeName: removeBullyingName, getAll: getAllBullyingNames, reload: reloadBullyingNames } = require('./bullyingNames');

// ===== 璇诲彇鏈湴 git 鐗堟湰鍙?=====
let cachedGitSha = 'dev';
let cachedCommitMsg = '';
try {
  const { execSync } = require('child_process');
  const sha = execSync('git rev-parse --short=7 HEAD', { cwd: __dirname, timeout: 5000 }).toString().trim();
  const msg = execSync('git log -1 --pretty=%s', { cwd: __dirname, timeout: 5000 }).toString().trim();
  if (sha) cachedGitSha = sha;
  if (msg) cachedCommitMsg = msg;
} catch (e) {
  cachedGitSha = 'dev';
}

// ===== 宕╂簝淇濇姢 =====
process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught Exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH] Unhandled Rejection:', reason);
});

// 鏅哄缃戣嚜鍔ㄧ櫥褰曟ā鍧楋紙闇€ Playwright / Chromium锛?let loginZhixue = null;
try {
  const zhixueModule = require('./zhixue');
  loginZhixue = zhixueModule.loginZhixue;
  console.log('[zhixue] 鏅哄缃戞ā鍧楀姞杞芥垚鍔?);
} catch (e) {
  console.warn('[zhixue] 鏅哄缃戞ā鍧楁湭鍔犺浇锛堢己澶?Playwright 鎴?zhixue.js锛夛細', e.message);
}

// ===== 瀵嗙爜鍝堝笇宸ュ叿锛圫HA-256 + 闅忔満鐩愶紝鏃犻渶澶栭儴渚濊禆锛?====
const SALT_LEN = 16;
const ITERATIONS = 100000; // PBKDF2 杩唬娆℃暟锛岄槻鏆村姏

/**
 * 鐢熸垚瀵嗙爜鍝堝笇
 * @param {string} password 鏄庢枃瀵嗙爜
 * @returns {string} salt:hash 鏍煎紡鐨勫搱甯屼覆
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return salt + ':' + hash;
}

/**
 * 楠岃瘉瀵嗙爜
 * @param {string} password 鐢ㄦ埛杈撳叆鐨勬槑鏂囧瘑鐮? * @param {string} storedHash 瀛樺偍鐨?salt:hash 涓? * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hash] = storedHash.split(':');
  const inputHash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(inputHash, 'hex'));
}

/**
 * 鑾峰彇瀹夊叏鐨勫悓瀛﹁璇佸睍绀虹姸鎬侊紙宸插簾寮冣€斺€旂粺涓€浣跨敤 getSafeCertStatus锛? * 鏍￠獙锛歛pproved 蹇呴』鏈夊鏍歌褰曪紙zhixueReviewedBy锛夛紝鍚﹀垯闄嶇骇
 * @param {object} user 鐢ㄦ埛瀵硅薄
 * @returns {string|null} 'approved' | 'pending' | 'rejected' | null
 */
function getDisplayZhixueStatus(user) {
  const status = user.zhixueStatus || null;
  if (status === 'approved' && !user.zhixueReviewedBy) {
    return null;
  }
  return status;
}

// ===== 瀹炲悕淇℃伅瀵圭О鍔犲瘑锛圓ES-256-CBC锛?====
// 瀵嗛挜蹇呴』閫氳繃鐜鍙橀噺 CERT_ENC_SECRET 璁剧疆锛?4浣?hex 鍗?32 瀛楄妭锛?// 鏈缃椂姣忔鍚姩闅忔満鐢熸垚锛岄噸鍚悗宸插姞瀵嗙殑瀹炲悕鏁版嵁灏嗘棤娉曡В瀵?if (!process.env.CERT_ENC_SECRET) {
  console.error('[SECURITY] 鈿狅笍 鏈缃幆澧冨彉閲?CERT_ENC_SECRET锛屽凡浣跨敤闅忔満瀵嗛挜鍚姩銆?);
  console.error('[SECURITY]    閲嶅惎鍚庡凡鍔犲瘑鐨勫疄鍚嶆暟鎹皢鏃犳硶瑙ｅ瘑锛佽鍦?.env 涓厤缃?CERT_ENC_SECRET銆?);
  console.error('[SECURITY]    鐢熸垚瀵嗛挜: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}
const CERT_ENC_KEY = crypto.createHash('sha256')
  .update(process.env.CERT_ENC_SECRET || crypto.randomBytes(32).toString('hex'))
  .digest();

/**
 * 鍔犲瘑瀹炲悕淇℃伅
 * @param {string} plainText 鏄庢枃锛堝鍚?鐝骇锛? * @returns {string} iv:ciphertext (hex)
 */
function encryptCert(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', CERT_ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + enc.toString('hex');
}

/**
 * 瑙ｅ瘑瀹炲悕淇℃伅
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

// ===== Token 绛惧悕锛圚MAC-SHA256锛岄槻浼€狅級=====
const TOKEN_SECRET = process.env.TOKEN_SECRET || crypto.randomBytes(32).toString('hex');

/**
 * 绛惧悕 Token锛歜ase64(payload).base64(hmac)
 * @param {object} payload - 瑕佺鍏ョ殑鐢ㄦ埛淇℃伅
 * @returns {string} 绛惧悕鍚庣殑 token 瀛楃涓? */
function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64');
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64');
  return data + '.' + hmac;
}

/**
 * 楠岃瘉绛惧悕 Token 骞惰繑鍥?payload
 * @param {string} token - 绛惧悕瀛楃涓? * @returns {object|null} 楠岃瘉閫氳繃杩斿洖 payload锛屽惁鍒欒繑鍥?null
 */
function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  // 鏃ф牸寮忥紙鏃犵鍚嶏級锛氬吋瀹归檷绾э紝璁板綍璀﹀憡
  if (parts.length === 1) {
    console.warn('[token] 鈿狅笍 妫€娴嬪埌鏃ф牸寮?token锛堟棤绛惧悕锛夛紝寤鸿鐢ㄦ埛閲嶆柊鐧诲綍鑾峰彇鏂?token');
    try {
      return JSON.parse(Buffer.from(token, 'base64').toString());
    } catch {
      return null;
    }
  }
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('base64');
  // timingSafeEqual 闃叉鏃跺簭鏀诲嚮
  const sigBuf = Buffer.from(sig, 'base64');
  const expBuf = Buffer.from(expectedSig, 'base64');
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64').toString());
  } catch {
    return null;
  }
}

const app = express();
app.set('trust proxy', true); // 淇′换浠ｇ悊锛屼粠 X-Forwarded-For 璇诲彇鐪熷疄瀹㈡埛绔疘P
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedbacks.json');
const BULLYING_FILE = path.join(DATA_DIR, 'bullying.json');
const MAINTENANCE_FILE = path.join(DATA_DIR, 'maintenance.json');
const LOGS_FILE = path.join(DATA_DIR, 'login_logs.json');
const CREDIT_LOGS_FILE = path.join(DATA_DIR, 'credit_logs.json');
const CREDIT_CARDS_FILE = path.join(DATA_DIR, 'credit_cards.json');
const QA_FILE = path.join(DATA_DIR, 'qa_questions.json');
const QA_ANSWERS_FILE = path.join(DATA_DIR, 'qa_answers.json');
const PICKUP_AUCTION_FILE = path.join(DATA_DIR, 'pickup_auctions.json');
const PICKUP_REPORT_FILE = path.join(DATA_DIR, 'pickup_reports.json');

// 鑾峰彇鐪熷疄瀹㈡埛绔疘P锛堟敮鎸佸弽鍚戜唬鐞?WAF绌块€忥級
function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket.remoteAddress || '-';
}

// 涓棿浠?app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));

// 鍏ㄥ眬杈撳叆杩囨护锛氱姝㈢壒娈婂瓧绗︼紙瀵?JSON body 鍜?URL query 鐢熸晥锛?const SPECIAL_CHAR_REGEX = /[~!@#$%^&*()+=\[\]{}|\\;:'",./<>?`]/;
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
    // 鎺掗櫎鍖呭惈 base64銆佸瘜鏂囨湰/Markdown 鎴栫壒娈婃牸寮忕殑瀛楁涓嶈繃婊?    // 鈿狅笍 PoW 瀛楁宸茬Щ闄?鈥?鏈嶅姟绔湭瀹炵幇瀹為檯 PoW 鏍￠獙锛岃繖浜涘瓧娈垫棤瀹夊叏鎰忎箟
    const { avatar, manualImages, manualEmail, images, content, title, text, body, reason, answer, question, description, ...rest } = req.body;
    req.body = {
      ...sanitizeString(rest),
      ...(avatar !== undefined ? { avatar } : {}),
      ...(manualImages !== undefined ? { manualImages } : {}),
      ...(manualEmail !== undefined ? { manualEmail } : {}),
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

app.use(express.static(__dirname)); // 闈欐€佹枃浠舵湇鍔?app.use(checkMaintenance); // 缁存姢鐘舵€佹鏌?
const CONTENT_MAX_LENGTH = 50; // 甯栧瓙/璇勮瀛楁暟涓婇檺

// ===== 鏁版嵁璇诲啓 =====
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readPosts () { return db.readPosts(); }

function writePosts (posts) { db.writePosts(posts); }

function readVotes () { return db.readVotes(); }

function writeVotes (votes) { db.writeVotes(votes); }

function readVoteRecords () { return db.readVoteRecords(); }

function writeVoteRecords (records) { db.writeVoteRecords(records); }

function readVoteIpRecords () { return db.readVoteIpRecords(); }

function writeVoteIpRecords (records) { db.writeVoteIpRecords(records); }

function readAdmins () { return db.readAdmins(); }

function hasAdmins() { return db.readAdmins().length > 0; }

function writeAdmins (admins) { db.writeAdmins(admins); }

// ===== 绠＄悊鍛樿璇佷腑闂翠欢 =====
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰曪紝璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifySignedToken(token);
  if (!session || !session.id || !session.loginAt) {
    return res.json({ ok: false, msg: '鐧诲綍淇℃伅鏃犳晥', code: 'INVALID_TOKEN' });
  }
  // token 鏈夋晥鏈?24 灏忔椂
  if (Date.now() - session.loginAt > 24 * 3600 * 1000) {
    return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?, code: 'TOKEN_EXPIRED' });
  }
  req.admin = session;
  next();
}

function requireSuper(req, res, next) {
  if (req.admin.role !== 'super') {
    return res.json({ ok: false, msg: '鏉冮檺涓嶈冻锛屼粎瓒呯骇绠＄悊鍛樺彲鐢?, code: 'FORBIDDEN' });
  }
  next();
}

// 缁存姢鐘舵€佹鏌ヤ腑闂翠欢锛堣烦杩囩鐞嗗悗鍙扮浉鍏宠矾寰勶級
function checkMaintenance(req, res, next) {
  const path = req.path;
  // 鏀捐绠＄悊鍚庡彴銆侀潤鎬佹枃浠躲€丄PI 璺緞
  if (path.startsWith('/api/admin/') || path === '/admin.html' || path === '/maintenance.html' || path === '/' || path.startsWith('/assets/')) {
    return next();
  }
  // 鏀捐绠＄悊鍛樼浉鍏冲叾浠栬矾寰?  if (path.startsWith('/api/admin')) return next();
  
  try {
    const data = readMaintenance();
    if (data && data.enabled === true) {
      // 濡傛灉鏄?HTML 椤甸潰璇锋眰锛岄噸瀹氬悜鍒扮淮鎶ら〉闈?      if (req.accepts('html')) {
        return res.redirect('/maintenance.html');
      }
      // API 璇锋眰杩斿洖閿欒
      return res.json({ ok: false, msg: '绯荤粺缁存姢涓紝鏆傛椂鏃犳硶璁块棶', code: 'MAINTENANCE' });
    }
  } catch (e) {
    // 鏂囦欢涓嶅瓨鍦ㄧ瓑锛屾甯告斁琛?  }
  next();
}

// 鐢熸垚 token锛堝惈 HMAC 绛惧悕锛?function makeToken(admin) {
  return signToken({
    id: admin.id,
    name: admin.name,
    role: admin.role,
    loginAt: Date.now()
  });
}

// ===== 鍒濆鍖栨帴鍙?=====

// 妫€鏌ユ槸鍚﹂渶瑕佸垵濮嬪寲锛堟槸鍚﹀瓨鍦ㄧ鐞嗗憳锛?app.get('/api/admin/check-init', (req, res) => {
  res.json({ ok: true, data: { needInit: !hasAdmins() } });
});

// 鍒涘缓棣栦釜绠＄悊鍛橈紙浠呭湪娌℃湁浠讳綍绠＄悊鍛樻椂鍙敤锛?app.post('/api/admin/init', (req, res) => {
  // 濡傛灉宸叉湁绠＄悊鍛橈紝鎷掔粷鍒濆鍖?  if (hasAdmins()) {
    return res.json({ ok: false, msg: '绯荤粺宸插垵濮嬪寲锛岃鐩存帴鐧诲綍', code: 'ALREADY_INIT' });
  }

  const { id, password, name } = req.body;

  // 楠岃瘉璐﹀彿鏍煎紡锛?-20浣嶅瓧姣嶃€佹暟瀛椼€佷笅鍒掔嚎锛?  if (!id || !/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
    return res.json({ ok: false, msg: '璐﹀彿鏍煎紡锛?-20浣嶅瓧姣嶃€佹暟瀛椼€佷笅鍒掔嚎', code: 'INVALID_ID' });
  }

  // 楠岃瘉瀵嗙爜锛堣嚦灏?浣嶏級
  if (!password || password.length < 6) {
    return res.json({ ok: false, msg: '瀵嗙爜鑷冲皯6浣?, code: 'INVALID_PWD' });
  }

  // 楠岃瘉鏄电О
  if (!name || name.trim().length === 0) {
    return res.json({ ok: false, msg: '璇疯緭鍏ョ鐞嗗憳鏄电О', code: 'INVALID_NAME' });
  }

  // 鍒涘缓棣栦釜瓒呯骇绠＄悊鍛?  const newAdmin = {
    id: id.trim(),
    password: hashPassword(password),
    name: name.trim(),
    role: 'super',
    createdAt: new Date().toISOString()
  };

  writeAdmins([newAdmin]);

  console.log(`鉁?棣栦釜绠＄悊鍛樺凡鍒涘缓: ${id}`);

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

// ===== 绠＄悊鍛?API =====

// 鐧诲綍
app.post('/api/admin/login', (req, res) => {
  const { id, password } = req.body;
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'] || '-';

  if (!id || !password) {
    addLoginLog('admin', null, false, ip, ua);
    return res.json({ ok: false, msg: '璇疯緭鍏ヨ处鍙峰拰瀵嗙爜' });
  }

  const admins = readAdmins();
  const admin = admins.find(a => a.id === id);
  if (!admin || !verifyPassword(password, admin.password)) {
    addLoginLog('admin', id, false, ip, ua);
    return res.json({ ok: false, msg: '璐﹀彿鎴栧瘑鐮侀敊璇? });
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

// 淇敼瀵嗙爜锛堥渶杈撳叆鏃у瘑鐮佺‘璁わ級
app.post('/api/admin/change-pwd', requireAdmin, (req, res) => {
  const { oldPwd, newPwd } = req.body;
  if (!oldPwd || !newPwd) return res.json({ ok: false, msg: '璇峰～鍐欏畬鏁? });
  if (newPwd.length < 6) return res.json({ ok: false, msg: '鏂板瘑鐮佽嚦灏?浣? });

  const admins = readAdmins();
  const idx = admins.findIndex(a => a.id === req.admin.id);
  if (idx === -1) return res.json({ ok: false, msg: '绠＄悊鍛樹笉瀛樺湪' });

  // 楠岃瘉鏃у瘑鐮?  if (!verifyPassword(oldPwd, admins[idx].password)) {
    return res.json({ ok: false, msg: '鏃у瘑鐮侀敊璇? });
  }

  // 鏇存柊瀵嗙爜
  admins[idx].password = hashPassword(newPwd);
  writeAdmins(admins);

  res.json({ ok: true, msg: '瀵嗙爜淇敼鎴愬姛锛岃閲嶆柊鐧诲綍' });
});

// 楠岃瘉褰撳墠鐧诲綍鐘舵€?app.get('/api/admin/me', requireAdmin, (req, res) => {
  const admins = readAdmins();
  const admin = admins.find(a => a.id === req.admin.id);
  if (!admin) return res.json({ ok: false, msg: '绠＄悊鍛樹笉瀛樺湪', code: 'NOT_FOUND' });
  res.json({ ok: true, data: { id: admin.id, name: admin.name, role: admin.role } });
});

// 鑾峰彇鐧诲綍璁板綍
app.get('/api/admin/login-logs', requireAdmin, (req, res) => {
  const logs = readLogs();
  res.json({ ok: true, data: logs });
});

// 鑾峰彇绠＄悊鍛樺垪琛紙浠呰秴绾х鐞嗗憳锛?app.get('/api/admin/list', requireAdmin, requireSuper, (req, res) => {
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

// 娣诲姞绠＄悊鍛橈紙浠呰秴绾х鐞嗗憳锛?app.post('/api/admin/add', requireAdmin, requireSuper, (req, res) => {
  const { id, password, name, role } = req.body;
  if (!id || !password || !name) {
    return res.json({ ok: false, msg: '璐﹀彿銆佸瘑鐮併€佹樀绉板潎涓哄繀濉」' });
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
    return res.json({ ok: false, msg: '璐﹀彿浠呮敮鎸?3-20 浣嶅瓧姣嶃€佹暟瀛椼€佷笅鍒掔嚎' });
  }
  if (password.length < 6) {
    return res.json({ ok: false, msg: '瀵嗙爜鑷冲皯 6 浣? });
  }
  if (!['super', 'admin'].includes(role)) {
    return res.json({ ok: false, msg: '瑙掕壊浠呮敮鎸?super锛堟渶楂樼鐞嗗憳锛夋垨 admin锛堢鐞嗗憳锛? });
  }

  const admins = readAdmins();
  if (admins.find(a => a.id === id)) {
    return res.json({ ok: false, msg: '璐﹀彿宸插瓨鍦? });
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

// 鍒犻櫎绠＄悊鍛橈紙浠呰秴绾х鐞嗗憳锛屼笉鑳藉垹闄よ嚜宸憋級
app.delete('/api/admin/:id', requireAdmin, requireSuper, (req, res) => {
  const { id } = req.params;
  if (id === 'wr1Ench') {
    return res.json({ ok: false, msg: '绂佹鍒犻櫎鏈€楂樼鐞嗗憳璐﹀彿' });
  }
  if (id === req.admin.id) {
    return res.json({ ok: false, msg: '涓嶈兘鍒犻櫎鑷繁' });
  }

  let admins = readAdmins();
  const before = admins.length;
  admins = admins.filter(a => a.id !== id);
  if (admins.length === before) {
    return res.json({ ok: false, msg: '绠＄悊鍛樹笉瀛樺湪' });
  }
  writeAdmins(admins);
  res.json({ ok: true });
});

// 淇敼绠＄悊鍛樹俊鎭紙浠呰秴绾х鐞嗗憳锛?app.put('/api/admin/:id', requireAdmin, requireSuper, (req, res) => {
  const { id } = req.params;
  const { password, name, role } = req.body;

  const admins = readAdmins();
  const admin = admins.find(a => a.id === id);
  if (!admin) return res.json({ ok: false, msg: '绠＄悊鍛樹笉瀛樺湪' });

  if (password !== undefined) {
    if (password.length < 6) return res.json({ ok: false, msg: '瀵嗙爜鑷冲皯 6 浣? });
    admin.password = hashPassword(password);
  }
  if (name !== undefined) admin.name = name;
  if (role !== undefined) {
    if (!['super', 'admin'].includes(role)) return res.json({ ok: false, msg: '瑙掕壊鏃犳晥' });
    if (id === 'wr1Ench' && role !== 'super') return res.json({ ok: false, msg: '绂佹淇敼鏈€楂樼鐞嗗憳瑙掕壊' });
    admin.role = role;
  }

  writeAdmins(admins);
  res.json({ ok: true, data: { id: admin.id, name: admin.name, role: admin.role } });
});

// ===== 閫氱敤宸ュ叿鍑芥暟 =====
function hasSpecialChars(str) {
  return /[<>\"'&]/.test(str);
}

// 瑙ｆ瀽 datetime-local 鏍煎紡锛堟敮鎸?YYYY-MM-DDTHH:mm 鎴?YYYY-MM-DDTHHmm锛?function parseLocalDateTime(str) {
  if (!str) return null;
  // 鏀寔鏍囧噯鏍煎紡 YYYY-MM-DDTHH:mm 鍜岄潪鏍囧噯鏍煎紡 YYYY-MM-DDTHHmm
  let match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  // 鍏煎娌℃湁鍐掑彿鐨勬牸寮?  match = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})$/);
  if (match) {
    const [, year, month, day, hour, minute] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute));
  }
  return null;
}

// ===== 鐢ㄦ埛鏁版嵁璇诲啓 =====
function readUsers () { return db.readUsers(); }

function writeUsers (users) { db.writeUsers(users); }

// ===== 娴忚鍣ㄤ俊浠讳护鐗?=====
const TRUST_TOKENS_FILE = path.join(DATA_DIR, 'trust_tokens.json');

function readTrustTokens () { return db.readTrustTokens(); }

function writeTrustTokens (tokens) { db.writeTrustTokens(tokens); }

function readLogs () { return db.readLogs(); }

function writeLogs (logs) { db.writeLogs(logs); }

function addLoginLog(type, account, success, ip, ua) {
  const logs = readLogs();
  logs.unshift({
    id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    type,
    account: account || '鏈櫥褰曠敤鎴?,
    success,
    ip: ip || '-',
    ua: ua || '-',
    time: new Date().toISOString()
  });
  if (logs.length > 500) logs.splice(500);
  writeLogs(logs);
}

// 鐢熸垚鐢ㄦ埛 token锛堝惈 HMAC 绛惧悕锛?function makeUserToken(user) {
  return signToken({
    id: user.id,
    nickname: user.nickname,
    loginAt: Date.now()
  });
}

// 楠岃瘉鐢ㄦ埛 token锛堝惈绛惧悕鏍￠獙锛?function verifyUserToken(token) {
  const session = verifySignedToken(token);
  if (!session || !session.id || !session.loginAt) return null;
  if (Date.now() - session.loginAt > 7 * 24 * 3600 * 1000) return null; // 7澶╂湁鏁堟湡
  return session;
}

// ===== 浜烘満楠岃瘉锛圫VG 楠岃瘉鐮侊級=====
const captchaStore = new Map();
// 鍙戝笘棰戠巼闄愬埗锛?鍒嗛挓鍐呮渶澶氬彂3绡囷紝瓒呭嚭闇€楠岃瘉鐮侊級
const postRateLimit = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamps] of postRateLimit) {
    const filtered = timestamps.filter(ts => now - ts < 600000);
    if (filtered.length === 0) {
      postRateLimit.delete(realUserId);
    } else {
      postRateLimit.set(realUserId, filtered);
    }
  }
}, 60000);

// 姣忓垎閽熸竻鐞嗚繃鏈熼獙璇佺爜锛?鍒嗛挓瓒呮椂锛?setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of captchaStore) {
    if (now - entry.t > 300000) captchaStore.delete(id);
  }
}, 60000);

// 姣忓ぉ娓呯悊瓒呰繃60澶╃殑宸插垹闄ら€氱煡
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
    console.log('[閫氱煡娓呯悊] 宸叉竻鐞嗚秴杩?0澶╃殑宸插垹闄ら€氱煡');
  }
}, 60 * 60 * 1000);

// 鐢熸垚楠岃瘉鐮?app.get('/api/captcha', (req, res) => {
  const captcha = svgCaptcha.create({ fontSize: 50, width: 150, height: 50, noise: 2 });
  const id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  captchaStore.set(id, { text: captcha.text.toLowerCase(), t: Date.now() });
  res.json({ ok: true, data: { id, svg: captcha.data } });
});

// ===== 鐢ㄦ埛 API =====

// 娉ㄥ唽
app.post('/api/user/register', (req, res) => {
  const { username, password, nickname, captchaId, captchaText } = req.body;
  if (!username || !password || !nickname) {
    return res.json({ ok: false, msg: '璐﹀彿銆佸瘑鐮併€佹樀绉板潎涓哄繀濉」' });
  }
  // 楠岃瘉鐮佹牎楠?  const entry = captchaStore.get(captchaId);
  if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
    return res.json({ ok: false, msg: '楠岃瘉鐮侀敊璇? });
  }
  captchaStore.delete(captchaId); // 涓€娆℃€т娇鐢?  if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
    return res.json({ ok: false, msg: '璐﹀彿闇€ 3-16 浣嶅瓧姣嶃€佹暟瀛椼€佷笅鍒掔嚎' });
  }
  if (password.length < 6) {
    return res.json({ ok: false, msg: '瀵嗙爜鑷冲皯 6 浣? });
  }
  if (nickname.length < 2 || nickname.length > 12) {
    return res.json({ ok: false, msg: '鏄电О闇€ 2-12 涓瓧绗? });
  }

  const users = readUsers();
  if (users.find(u => u.username === username)) {
    return res.json({ ok: false, msg: '璐﹀彿宸茶娉ㄥ唽' });
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
      zhixueStatus: null // 鏂扮敤鎴锋湭璁よ瘉
    }
  });
});

// 鐧诲綍
app.post('/api/user/login', (req, res) => {
  const { username, password, captchaId, captchaText } = req.body;
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'] || '-';

  if (!username || !password) {
    addLoginLog('user', null, false, ip, ua);
    return res.json({ ok: false, msg: '璇疯緭鍏ヨ处鍙峰拰瀵嗙爜' });
  }
  // 楠岃瘉鐮佹牎楠?  const entry = captchaStore.get(captchaId);
  if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
    return res.json({ ok: false, msg: '楠岃瘉鐮侀敊璇? });
  }
  captchaStore.delete(captchaId); // 涓€娆℃€т娇鐢?
  const users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user || !verifyPassword(password, user.password)) {
    addLoginLog('user', username, false, ip, ua);
    return res.json({ ok: false, msg: '璐﹀彿鎴栧瘑鐮侀敊璇? });
  }
  // 鑷姩瑙ｅ皝锛氬鏋?banUntil 宸茶繃鏈?  if (user.status === 'banned' && user.banUntil) {
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

// 鏅哄缃戣处鍙风櫥褰曪紙閫氳繃宸茶璇佺殑鏅哄璐﹀彿鐧诲綍鏍″洯澧欙級
app.post('/api/user/zhixue-login', (req, res) => {
  const { zhixueUsername, password, captchaId, captchaText } = req.body;
  const ip = getClientIP(req);
  const ua = req.headers['user-agent'] || '-';

  // 楠岃瘉鐮佹牎楠?  const entry = captchaStore.get(captchaId);
  if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
    return res.json({ ok: false, msg: '楠岃瘉鐮侀敊璇? });
  }
  captchaStore.delete(captchaId); // 涓€娆℃€т娇鐢?
  if (!zhixueUsername || !password) {
    addLoginLog('user', null, false, ip, ua);
    return res.json({ ok: false, msg: '璇疯緭鍏ョ粦瀹氱殑鏅哄缃戣处鍙峰拰瀵嗙爜' });
  }

  const users = readUsers();
  let user = users.find(u => u.zhixueUsername === zhixueUsername && (u.zhixueStatus === 'approved' || u.zhixueStatus === 'pending_confirm'));
  // 闃插尽锛歛pproved 蹇呴』鏈夊鏍歌褰?  if (user && user.zhixueStatus === 'approved' && !user.zhixueReviewedBy) {
    console.warn('[zhixue-login] 鐢ㄦ埛', user.id, '鐘舵€佷负 approved 浣嗙己灏戝鏍歌褰曪紝鎷掔粷鐧诲綍');
    user = null;
  }
  if (!user) {
    addLoginLog('user', zhixueUsername, false, ip, ua);
    return res.json({ ok: false, msg: '褰撳墠璐﹀彿鍙兘閿欒鎴栬€呮湭缁戝畾鏍″洯澧欒处鍙? });
  }
  if (!verifyPassword(password, user.password)) {
    addLoginLog('user', zhixueUsername, false, ip, ua);
    return res.json({ ok: false, msg: '褰撳墠瀵嗙爜閿欒' });
  }
  // 鑷姩瑙ｅ皝
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

// ===== 娴忚鍣ㄤ俊浠昏嚜鍔ㄧ櫥褰?=====
// 淇′换姝ゆ祻瑙堝櫒锛氱櫥褰曟垚鍔熷悗瀹㈡埛绔敓鎴?trustToken锛岃皟鐢ㄦ鎺ュ彛鐧昏
app.post('/api/user/trust-browser', (req, res) => {
  const auth = verifyUserToken(req.headers['x-user-token']);
  if (!auth) return res.json({ ok: false, msg: '鏈櫥褰? });
  const { trustToken } = req.body;
  if (!trustToken) return res.json({ ok: false, msg: '缂哄皯淇′换浠ょ墝' });
  const users = readUsers();
  const user = users.find(u => u.id === auth.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  const tokens = readTrustTokens();
  tokens[trustToken] = { userId: user.id, createdAt: Date.now(), lastUsedAt: Date.now() };
  writeTrustTokens(tokens);
  res.json({ ok: true });
});

// 鑷姩鐧诲綍锛氶〉闈㈠姞杞芥椂妫€鏌?trustToken 鏄惁鏈夋晥
app.post('/api/user/auto-login', (req, res) => {
  const { trustToken } = req.body;
  if (!trustToken) return res.json({ ok: false, msg: '缂哄皯淇′换浠ょ墝' });
  const tokens = readTrustTokens();
  const entry = tokens[trustToken];
  if (!entry) return res.json({ ok: false, msg: '浠ょ墝鏃犳晥鎴栧凡鎾ら攢' });
  const users = readUsers();
  const user = users.find(u => u.id === entry.userId);
  if (!user) { delete tokens[trustToken]; writeTrustTokens(tokens); return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? }); }
  if (user.status === 'banned') {
    return res.json({ ok: false, msg: '璇ヨ处鍙峰凡琚皝绂?, banned: true });
  }
  entry.lastUsedAt = Date.now();
  writeTrustTokens(tokens);
  res.json({ ok: true, data: { token: makeUserToken(user), id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, credit: user.credit || 0, zhixueStatus: getDisplayZhixueStatus(user) } });
});

// 鎾ら攢淇′换锛堢敤鎴烽€€鍑烘椂娓呴櫎锛?app.post('/api/user/revoke-trust', (req, res) => {
  const { trustToken } = req.body;
  if (!trustToken) return res.json({ ok: false, msg: '缂哄皯淇′换浠ょ墝' });
  const tokens = readTrustTokens();
  delete tokens[trustToken];
  writeTrustTokens(tokens);
  res.json({ ok: true });
});

// ===== 浜岀淮鐮佺櫥褰?=====
const qrCodeStore = new Map();
const QR_CODE_TTL = 5 * 60 * 1000; // 5鍒嗛挓鏈夋晥鏈?
// 鍚姩鏃舵仮澶嶅凡鎸佷箙鍖栫殑浜岀淮鐮?try {
  const fs = require('fs');
  const qrDbPath = require('path').join(__dirname, 'data', 'qrcodes.json');
  if (fs.existsSync(qrDbPath)) {
    const raw = fs.readFileSync(qrDbPath, 'utf8');
    const arr = JSON.parse(raw);
    arr.forEach(entry => qrCodeStore.set(entry.token, entry.data));
    console.log('[qrcode] 宸叉仮澶?' + qrCodeStore.size + ' 涓簩缁寸爜浠ょ墝');
  }
} catch(e) {
  console.warn('[qrcode] 鎭㈠澶辫触锛堥娆¤繍琛屽彲蹇界暐锛?', e.message);
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
    console.warn('[qrcode] 鎸佷箙鍖栧け璐?', e.message);
  }
}

// 鐢熸垚浜岀淮鐮侊紙缃戦〉绔皟鐢級
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
  console.log('[qrcode] 鐢熸垚浜岀淮鐮?token=' + qrToken.slice(0,12) + '... linked=' + (linkedUser ? linkedUser.nickname : '鏃?) + ' store_size=' + qrCodeStore.size);
  res.json({ ok: true, qrToken, expiresIn: QR_CODE_TTL });
});

// 灏忕▼搴忔壂鐮侊紙鎵弿浜岀淮鐮侊級鈫?鑷姩纭鐧诲綍
app.get('/api/user/qrcode/scan', (req, res) => {
  const { token } = req.query;
  const qr = qrCodeStore.get(token);
  console.log('[qrcode] 鎵爜 token=' + (token ? token.slice(0,12) + '...' : 'MISSING') + ' found=' + !!qr + ' store_size=' + qrCodeStore.size);
  if (!token) return res.json({ ok: false, msg: '缂哄皯浜岀淮鐮佷护鐗? });
  if (!qr) return res.json({ ok: false, msg: '浜岀淮鐮佸凡澶辨晥' });
  if (Date.now() - qr.createdAt > QR_CODE_TTL) {
    qr.status = 'expired';
    persistQrCodes();
    return res.json({ ok: false, msg: '浜岀淮鐮佸凡澶辨晥' });
  }
  // 鐢熸垚鐢ㄦ埛浼氳瘽
  let sessionUser;
  if (qr.linkedUser) {
    // 鏈夊叧鑱旂敤鎴凤細浣跨敤璇ョ敤鎴风殑淇℃伅
    sessionUser = {
      id: qr.linkedUser.id,
      nickname: qr.linkedUser.nickname,
      avatar: qr.linkedUser.avatar || '馃檵',
      token: makeUserToken(qr.linkedUser),
      username: qr.linkedUser.username || ''
    };
    // 鏇存柊璇ョ敤鎴风殑 token锛堝埛鏂版湁鏁堟湡锛?    const allUsers = readUsers();
    const idx = allUsers.findIndex(u => u.id === qr.linkedUser.id);
    if (idx >= 0) {
      allUsers[idx].token = sessionUser.token;
      writeUsers(allUsers);
    }
  } else {
    // 鏃犲叧鑱旂敤鎴凤細鍒涘缓鏂扮敤鎴?    sessionUser = {
      id: 'mp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      nickname: '鐢ㄦ埛' + Math.random().toString(36).slice(2, 6).toUpperCase(),
      avatar: '馃檵',
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
  console.log('[qrcode] 鎵爜鎴愬姛', sessionUser.nickname, 'token=' + sessionUser.token.slice(0,12) + '...');
  res.json({ ok: true, scanned: true });
});

// 灏忕▼搴忔煡璇㈢姸鎬?app.get('/api/user/qrcode/status', (req, res) => {
  const { qrToken } = req.query;
  const qr = qrCodeStore.get(qrToken);
  console.log('[qrcode] 鐘舵€佹煡璇?token=' + (qrToken ? qrToken.slice(0,12) + '...' : 'MISSING') + ' found=' + !!qr + ' status=' + (qr ? qr.status : 'N/A'));
  if (!qrToken) return res.json({ ok: false, msg: '缂哄皯浜岀淮鐮佷护鐗? });
  if (!qr) return res.json({ ok: false, msg: '浜岀淮鐮佸凡澶辨晥' });
  if (Date.now() - qr.createdAt > QR_CODE_TTL) {
    qr.status = 'expired';
    persistQrCodes();
    return res.json({ ok: false, msg: '浜岀淮鐮佸凡澶辨晥' });
  }
  if (qr.status === 'confirmed') {
    // 杩斿洖鐢ㄦ埛淇℃伅缁欏皬绋嬪簭
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

// 灏忕▼搴忕‘璁ょ櫥褰?app.post('/api/user/qrcode/confirm', (req, res) => {
  const { qrToken, userId } = req.body;
  if (!qrToken) return res.json({ ok: false, msg: '缂哄皯浜岀淮鐮佷护鐗? });
  const qr = qrCodeStore.get(qrToken);
  if (!qr) return res.json({ ok: false, msg: '浜岀淮鐮佸凡澶辨晥' });
  if (Date.now() - qr.createdAt > QR_CODE_TTL) {
    qr.status = 'expired';
    return res.json({ ok: false, msg: '浜岀淮鐮佸凡澶辨晥' });
  }
  if (qr.status !== 'scanned') return res.json({ ok: false, msg: '绛夊緟鎵爜纭' });
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  qr.status = 'confirmed';
  qr.userId = user.id;
  res.json({ ok: true });
});

// 娓呯悊杩囨湡浜岀淮鐮?function cleanupQrCodes() {
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

// 鎵惧洖瀵嗙爜锛堥€氳繃宸茶璇佺殑鏅哄缃戣处鍙凤級
app.post('/api/user/forgot-password', (req, res) => {
  const { zhixueUsername, newPassword, confirmPassword } = req.body;

  if (!zhixueUsername) {
    return res.json({ ok: false, msg: '璇疯緭鍏ョ粦瀹氱殑鏅哄缃戣处鍙? });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.json({ ok: false, msg: '鏂板瘑鐮佽嚦灏?6 浣? });
  }
  if (newPassword !== confirmPassword) {
    return res.json({ ok: false, msg: '涓ゆ杈撳叆鐨勬柊瀵嗙爜涓嶄竴鑷? });
  }

  const users = readUsers();
  const userIndex = users.findIndex(u => u.zhixueUsername === zhixueUsername && u.zhixueStatus === 'approved');
  if (userIndex === -1) {
    return res.json({ ok: false, msg: '璇ユ櫤瀛︾綉璐﹀彿鏈璇佹垨涓嶅瓨鍦? });
  }

  users[userIndex].password = hashPassword(newPassword);
  writeUsers(users);

  res.json({ ok: true, msg: '瀵嗙爜閲嶇疆鎴愬姛锛岃浣跨敤鏂板瘑鐮佺櫥褰? });
});

// 楠岃瘉褰撳墠鐢ㄦ埛鐧诲綍鐘舵€?app.get('/api/user/me', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if (user.status === 'banned') return res.json({ ok: false, msg: '璐﹀彿宸茶绂佺敤', code: 'BANNED' });
  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole, credit: user.credit || 0, checkinToday: user.lastCheckinDate === new Date().toISOString().slice(0, 10), checkinStreak: user.checkinStreak || 0, zhixueStatus: getDisplayZhixueStatus(user), zhixueUsername: user.zhixueUsername || null } });
});

// ===== 绛惧埌 =====
const CHECKIN_REWARD = 100; // 姣忔棩绛惧埌濂栧姳 100 Credit

// 鑾峰彇绛惧埌鐘舵€?app.get('/api/user/checkin-status', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

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

// 绛惧埌
app.post('/api/user/checkin', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  const users = readUsers();
  const idx = users.findIndex(u => u.id === session.id);
  if (idx === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  const user = users[idx];
  const today = new Date().toISOString().slice(0, 10);

  // 浠婂ぉ宸茬鍒?  if (user.lastCheckinDate === today) {
    return res.json({ ok: false, msg: '浠婂ぉ宸茬鍒帮紝鏄庡ぉ鍐嶆潵鍚? });
  }

  // 鍒ゆ柇鏄惁杩炵画绛惧埌
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (user.lastCheckinDate === yesterday) {
    user.checkinStreak = (user.checkinStreak || 0) + 1;
  } else {
    user.checkinStreak = 1; // 鏂锛岄噸鏂板紑濮?  }

  user.lastCheckinDate = today;
  user.credit = (user.credit || 0) + CHECKIN_REWARD;
  writeUsers(users);

  // 璁板綍娴佹按
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: session.id,
    amount: CHECKIN_REWARD,
    reason: '姣忔棩绛惧埌锛堣繛缁?' + user.checkinStreak + ' 澶╋級',
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

// 鑾峰彇褰撳墠鐢ㄦ埛鐨?Credit 娴佹按
app.get('/api/user/credit-logs', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  const logs = readCreditLogs();
  const userLogs = logs.filter(l => l.userId === session.id).reverse();
  res.json({ ok: true, data: userLogs });
});

// 鍏戞崲鍗″瘑锛堝惈棰戠巼闄愬埗锛?const redeemRateLimit = new Map();
app.post('/api/user/redeem-credit', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  // 棰戠巼闄愬埗锛氭瘡浜烘瘡鍒嗛挓鏈€澶?5 娆?  const now = Date.now();
  const rlKey = session.id;
  let rl = redeemRateLimit.get(rlKey);
  if (!rl || now - rl.window > 60000) {
    rl = { window: now, count: 0 };
    redeemRateLimit.set(rlKey, rl);
  }
  rl.count++;
  if (rl.count > 5) return res.json({ ok: false, msg: '鎿嶄綔澶绻侊紝璇风◢鍚庡啀璇? });

  const { code } = req.body;
  if (!code || !code.trim()) return res.json({ ok: false, msg: '璇疯緭鍏ュ崱瀵? });

  const cleanCode = code.trim().toUpperCase();
  // 鏍煎紡楠岃瘉锛欳W-XXXX-XXXX-X锛?2浣嶅瓧姣嶆暟瀛?4涓垎闅旂锛?  if (!/^CW-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cleanCode)) {
    return res.json({ ok: false, msg: '鍗″瘑鏍煎紡涓嶆纭? });
  }
  // 鏍￠獙鐮侀獙璇侊紙Luhn mod N锛?  const codePart = cleanCode.replace(/-/g, '').slice(2); // 鍘绘帀 "CW-" 鍓嶇紑
  if (!luhnModN(codePart)) {
    return res.json({ ok: false, msg: '鍗″瘑鏃犳晥锛堟牎楠岀爜涓嶅尮閰嶏級' });
  }

  const cards = readCreditCards();
  const card = cards.find(c => c.code === cleanCode);

  if (!card) return res.json({ ok: false, msg: '鍗″瘑涓嶅瓨鍦? });
  if (card.status !== 'unused') return res.json({ ok: false, msg: '璇ュ崱瀵嗗凡琚娇鐢? });

  // 鏇存柊鍗″瘑鐘舵€?  card.status = 'used';
  card.usedBy = session.id;
  card.usedAt = new Date().toISOString();
  writeCreditCards(cards);

  // 缁欑敤鎴峰姞 credit
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  users[userIndex].credit = (users[userIndex].credit || 0) + card.value;
  writeUsers(users);

  // 璁板綍娴佹按
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: session.id,
    amount: card.value,
    reason: '鍗″瘑鍏戞崲锛? + cleanCode,
    createdAt: new Date().toISOString()
  });
  writeCreditLogs(logs);

  res.json({ ok: true, data: { value: card.value, balance: users[userIndex].credit } });
});

// 鏇存柊褰撳墠鐢ㄦ埛璧勬枡锛堟樀绉般€佸ご鍍忥級
app.patch('/api/user/me', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  const user = users[userIndex];
  if (user.status === 'banned') return res.json({ ok: false, msg: '璐﹀彿宸茶绂佺敤', code: 'BANNED' });

  const { nickname, avatar } = req.body;
  let updated = false;

  // 鏇存柊鏄电О
  if (nickname !== undefined) {
    if (nickname.length < 2 || nickname.length > 12) {
      return res.json({ ok: false, msg: '鏄电О闇€ 2-12 涓瓧绗? });
    }
    user.nickname = nickname;
    updated = true;
  }

  // 鏇存柊澶村儚锛坆ase64 data URL锛?  if (avatar !== undefined) {
    // 楠岃瘉澶村儚鏍煎紡鍜屽ぇ灏?    if (typeof avatar !== 'string') {
      return res.json({ ok: false, msg: '澶村儚鏁版嵁鏍煎紡閿欒' });
    }
    // 妫€鏌ユ槸鍚︿负鍥剧墖 data URL
    if (!/^data:image\/.*;base64,/.test(avatar)) {
      return res.json({ ok: false, msg: '澶村儚浠呮敮鎸佸浘鐗囨牸寮? });
    }
    const base64Data = avatar.split(',')[1];
    if (!base64Data) {
      return res.json({ ok: false, msg: '澶村儚鏁版嵁涓嶅畬鏁? });
    }
    // 璁＄畻 base64 鏁版嵁澶у皬锛堢害绛変簬鍘熸枃浠剁殑 4/3锛?    if (base64Data.length > 700000) { // 瀵瑰簲绾?500KB 鐨?JPG 鏂囦欢
      return res.json({ ok: false, msg: '澶村儚鍥剧墖澶ぇ锛岃鍘嬬缉鍒?500KB 浠ュ唴' });
    }
    // 鍙€夛細楠岃瘉 base64 鏈夋晥鎬?    try {
      Buffer.from(base64Data, 'base64');
    } catch (e) {
      return res.json({ ok: false, msg: '澶村儚鏁版嵁鏍煎紡鏃犳晥' });
    }
    user.avatar = avatar;
    updated = true;
  }

  if (!updated) {
    return res.json({ ok: false, msg: '鏈彁渚涘彲鏇存柊鐨勫瓧娈? });
  }

  users[userIndex] = user;
  writeUsers(users);
  res.json({ ok: true, data: { id: user.id, nickname: user.nickname, avatar: user.avatar } });
});

// 缁戝畾绠＄悊鍛樿处鍙?app.post('/api/user/bind-admin', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  const user = users[userIndex];
  if (user.status === 'banned') return res.json({ ok: false, msg: '璐﹀彿宸茶绂佺敤', code: 'BANNED' });

  const { password, adminId, adminPassword } = req.body;
  if (!password || !adminId || !adminPassword) {
    return res.json({ ok: false, msg: '璇峰～鍐欏畬鏁翠俊鎭? });
  }

  // 楠岃瘉鐢ㄦ埛瀵嗙爜
  if (!verifyPassword(password, user.password)) {
    return res.json({ ok: false, msg: '璐﹀彿瀵嗙爜閿欒锛岀粦瀹氬け璐? });
  }

  // 鏌ユ壘绠＄悊鍛樿处鍙?  const admins = readAdmins();
  const admin = admins.find(a => a.id === adminId);
  if (!admin || !verifyPassword(adminPassword, admin.password)) {
    return res.json({ ok: false, msg: '绠＄悊鍛樿处鍙锋垨瀵嗙爜閿欒锛岀粦瀹氬け璐? });
  }

  // 缁戝畾
  users[userIndex].bindAdminId = admin.id;
  users[userIndex].bindAdminRole = admin.role;
  writeUsers(users);

  res.json({ ok: true, data: { bindAdminId: admin.id, bindAdminRole: admin.role } });
});

// 瑙ｇ粦绠＄悊鍛樿处鍙?app.delete('/api/user/bind-admin', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  users[userIndex].bindAdminId = null;
  users[userIndex].bindAdminRole = null;
  writeUsers(users);

  res.json({ ok: true });
});

// ===== 鍚屽璁よ瘉 =====

// 鎻愪氦鍚屽璁よ瘉锛堟櫤瀛﹁璇?鎴?鎵嬪姩璁よ瘉锛?app.post('/api/user/bind-zhixue', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if (users[userIndex].status === 'banned') return res.json({ ok: false, msg: '璐﹀彿宸茶绂佺敤', code: 'BANNED' });

  // 濡傛灉鐘舵€佹槸宸茶璇侊紝闇€瑕佸厛瑙ｉ櫎鎵嶈兘閲嶆柊鎻愪氦
  if (users[userIndex].zhixueStatus === 'approved') {
    return res.json({ ok: false, msg: '璐﹀彿宸茶璇侊紝濡傞渶淇敼璇疯仈绯荤鐞嗗憳' });
  }

  const { type } = req.body;

  if (type === 'zhixue') {
    // 鏅哄璁よ瘉锛氳处鍙?+ 瀵嗙爜
    const { zhixueUsername, zhixuePassword } = req.body;
    if (!zhixueUsername) return res.json({ ok: false, msg: '璇峰～鍐欑粦瀹氱殑鏅哄缃戣处鍙? });
    if (!zhixuePassword) return res.json({ ok: false, msg: '璇峰～鍐欐櫤瀛︾綉瀵嗙爜' });

    // 鍞竴鎬ф鏌ワ細宸茶璇侊紙approved锛夌殑鏅哄璐﹀彿涓嶅厑璁歌鍏朵粬鏍″洯澧欒处鍙烽噸澶嶇粦瀹?    const existingUser = users.find(u =>
      u.zhixueUsername === zhixueUsername &&
      u.zhixueStatus === 'approved' &&
      u.id !== users[userIndex].id
    );
    if (existingUser) {
      return res.json({ ok: false, msg: '璇ユ櫤瀛︾綉璐﹀彿宸茶鍏朵粬璐﹀彿缁戝畾' });
    }

    users[userIndex].zhixueCertType = 'zhixue';
    users[userIndex].zhixueUsername = zhixueUsername;
    users[userIndex].zhixuePassword = encryptCert(zhixuePassword);
    users[userIndex].zhixueManualNote = null;
    users[userIndex].zhixueManualImages = null;

  } else if (type === 'manual') {
    // 鎵嬪姩璁よ瘉锛氬鍚?+ 閭 + 璇存槑 + 鍥剧墖
    const { manualName, manualEmail, manualNote, manualImages } = req.body;
    if (!manualName || !manualName.trim()) return res.json({ ok: false, msg: '璇峰～鍐欏鍚? });
    if (!manualEmail || !manualEmail.trim()) return res.json({ ok: false, msg: '璇峰～鍐欓偖绠? });
    if (!manualNote || !manualNote.trim()) return res.json({ ok: false, msg: '璇峰～鍐欒璇佽鏄? });
    if (!manualImages || !Array.isArray(manualImages) || manualImages.length === 0) {
      return res.json({ ok: false, msg: '璇疯嚦灏戜笂浼犱竴寮犺瘉鏄庡浘鐗? });
    }
    if (manualImages.length > 3) return res.json({ ok: false, msg: '鏈€澶氫笂浼?寮犲浘鐗? });
    // 楠岃瘉鍥剧墖鏍煎紡涓庡ぇ灏忥紙base64 data URL锛?    // 淇琚?express.json() 鐮村潖鐨?data URL锛坉ata:image/jpeg;base64 鈫?dataimagejpegbase64锛?    for (let i = 0; i < manualImages.length; i++) {
      const img = manualImages[i];
      let fixed = img;
      // 鍖归厤 dataimagejpegbase64, 鎴?dataimage/jpegbase64, 绛夊悇绉嶅彉浣?      const m = img.match(/^dataimage\/?(jpeg|jpg|png|gif|webp|svg\xml)base64,/i)
              || img.match(/^data:image\/?(jpeg|jpg|png|gif|webp|svg\xml);base64,/i);
      if (m) {
        fixed = 'data:image/' + m[1] + ';base64,' + img.slice(m[0].length);
      } else if (!/^data:image\//i.test(img)) {
        return res.json({ ok: false, msg: '鍙厑璁镐笂浼犲浘鐗囨枃浠? });
      }
      manualImages[i] = fixed;
      const base64Data = fixed.split(',')[1] || '';
      const sizeBytes = Math.ceil(base64Data.length * 3 / 4);
      if (sizeBytes > 10 * 1024 * 1024) {
        return res.json({ ok: false, msg: '鍗曞紶鍥剧墖涓嶈兘瓒呰繃 10MB' });
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
    return res.json({ ok: false, msg: '鏃犳晥鐨勮璇佺被鍨? });
  }

  users[userIndex].zhixueStatus = 'pending';
  users[userIndex].zhixueSubmittedAt = new Date().toISOString();
  users[userIndex].zhixueReviewedAt = null;
  users[userIndex].zhixueReviewedBy = null;
  writeUsers(users);

  res.json({ ok: true, msg: '鎻愪氦鎴愬姛锛岃绛夊緟绠＄悊鍛樺鏍?, data: { type, status: 'pending' } });
});

// 瑙ｇ粦鍚屽璁よ瘉
app.delete('/api/user/bind-zhixue', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

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

// 鑾峰彇褰撳墠鐢ㄦ埛鍚屽璁よ瘉淇℃伅锛堢敤浜庡墠绔睍绀猴級
app.get('/api/user/me/zhixue-info', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });
  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if (user.status === 'banned') return res.json({ ok: false, msg: '璐﹀彿宸茶绂佺敤', code: 'BANNED' });

  if (!user.zhixueUsername && !user.zhixueManualNote) {
    return res.json({ ok: true, data: null });
  }

  // 鏍￠獙锛歴tatus=approved 蹇呴』鏈?reviewedBy锛堢鐞嗗憳瀹℃牳璁板綍锛夛紝鍚﹀垯闄嶇骇涓?pending
  let displayStatus = user.zhixueStatus || 'pending';
  if (displayStatus === 'approved' && !user.zhixueReviewedBy) {
    displayStatus = 'pending';
    console.warn('[zhixue-info] 鐢ㄦ埛', user.id, '鐘舵€佷负 approved 浣嗙己灏戝鏍歌褰曪紝闄嶇骇涓?pending');
  }

  const realName = decryptCert ? decryptCert(user.certRealName) : null;
  const className = user.certClassName ? (decryptCert ? decryptCert(user.certClassName) : null) : null;
  // 鏈€氳繃瀹℃牳鎴栬椹冲洖鏃讹紝杩斿洖缂栬緫鎵€闇€鐨勯濉暟鎹?  let editData = null;
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

// ===== 绠＄悊鍛樺悓瀛﹁璇佸鏍?=====

// 鑾峰彇寰呭鏍稿垪琛紙浠呯鐞嗗憳锛?app.get('/api/admin/zhixue-pending', requireAdmin, (req, res) => {
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

// 瀹℃牳鍚屽璁よ瘉锛堥€氳繃/鎷掔粷锛?app.put('/api/admin/zhixue/:userId/review', requireAdmin, (req, res) => {
  const { action, realName, className, rejectReason } = req.body; // action: approve | reject
  if (!['approve', 'reject'].includes(action)) {
    return res.json({ ok: false, msg: '鏃犳晥鐨勬搷浣? });
  }

  // 鎷掔粷鏃跺繀椤诲～鍐欏師鍥?  if (action === 'reject') {
    if (!rejectReason || !rejectReason.trim()) {
      return res.json({ ok: false, msg: '璇峰～鍐欓┏鍥炲師鍥? });
    }
  }

  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === req.params.userId);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  const now = new Date().toISOString();

  if (action === 'reject') {
    users[userIndex].zhixueStatus = 'rejected';
    users[userIndex].zhixueRejectReason = rejectReason.trim();
    users[userIndex].zhixueRejectedAt = now;
    users[userIndex].zhixueReviewedAt = now;
    users[userIndex].zhixueReviewedBy = req.admin.id;
    writeUsers(users);
    return res.json({ ok: true, msg: '宸叉嫆缁濊鐢宠' });
  }

  // === approve 娴佺▼ ===
  // 閫氳繃鏃讹細鏅哄璁よ瘉蹇呴』濉啓濮撳悕锛涙墜鍔ㄨ璇佹湁 manualName 鍏滃簳锛岀鐞嗗憳鍙笉濉?  const u = users[userIndex];
  const isManual = u.zhixueCertType === 'manual';
  const hasManualName = u.zhixueManualName;
  if (!isManual && !hasManualName && (!realName || !realName.trim())) {
    return res.json({ ok: false, msg: '璇峰～鍐欏鐢熷鍚? });
  }

  // 鏅哄璁よ瘉 鈫?pending_confirm锛堢瓑寰呯敤鎴风‘璁わ級
  // 鎵嬪姩璁よ瘉 鈫?approved锛堢洿鎺ラ€氳繃锛?  users[userIndex].zhixueStatus = isManual ? 'approved' : 'pending_confirm';
  users[userIndex].zhixueReviewedAt = now;
  users[userIndex].zhixueReviewedBy = req.admin.id;
  users[userIndex].zhixuePassword = null;
  users[userIndex].zhixueRejectReason = null;
  users[userIndex].zhixueRejectedAt = null;

  // 鍔犲瘑瀛樺偍濮撳悕鐝骇锛坧ending_confirm 鏃朵篃瀛橈紝渚涚敤鎴风‘璁ゆ椂灞曠ず锛?  const nameToStore = (realName && realName.trim())
    ? realName.trim()
    : (u.zhixueManualName || null);
  if (nameToStore) {
    users[userIndex].certRealName = encryptCert(nameToStore);
  }
  users[userIndex].certClassName = className && className.trim() ? encryptCert(className.trim()) : null;

  if (isManual) {
    // 鎵嬪姩璁よ瘉鐩存帴閫氳繃锛屽鍔?Credits
    users[userIndex].credit = (users[userIndex].credit || 0) + 300;
  }

  writeUsers(users);

  if (isManual) {
    return res.json({ ok: true, msg: '宸查€氳繃瀹℃牳' });
  } else {
    return res.json({ ok: true, msg: '瀹℃牳閫氳繃锛岀瓑寰呯敤鎴风‘璁や俊鎭?, pendingConfirm: true });
  }
});

// 鐢ㄦ埛纭鏅哄璁よ瘉淇℃伅锛坧ending_confirm 鈫?approved锛?app.post('/api/user/confirm-zhixue', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if (users[userIndex].status === 'banned') return res.json({ ok: false, msg: '璐﹀彿宸茶绂佺敤', code: 'BANNED' });
  if (users[userIndex].zhixueStatus !== 'pending_confirm') {
    return res.json({ ok: false, msg: '褰撳墠鏃犻渶纭璁よ瘉淇℃伅' });
  }

  users[userIndex].zhixueStatus = 'approved';
  users[userIndex].zhixueConfirmedAt = new Date().toISOString();
  // 濂栧姳 Credits锛堢‘璁ゆ椂鎵嶅彂鏀撅級
  users[userIndex].credit = (users[userIndex].credit || 0) + 300;
  writeUsers(users);

  res.json({ ok: true, msg: '璁よ瘉淇℃伅宸茬‘璁わ紝娆㈣繋锛? });
});

// 鐢ㄦ埛鍚﹁鏅哄璁よ瘉淇℃伅锛坧ending_confirm 鈫?rejected锛?app.post('/api/user/deny-zhixue', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === session.id);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if (users[userIndex].zhixueStatus !== 'pending_confirm') {
    return res.json({ ok: false, msg: '褰撳墠鏃犻渶纭璁よ瘉淇℃伅' });
  }

  users[userIndex].zhixueStatus = 'rejected';
  users[userIndex].zhixueRejectReason = '浣犵‘璁ゆ彁浜ょ殑淇℃伅骞堕潪鏈汉锛岃閲嶆柊濉啓姝ｇ‘鐨勪俊鎭?;
  users[userIndex].zhixueRejectedAt = new Date().toISOString();
  users[userIndex].certRealName = null;
  users[userIndex].certClassName = null;
  writeUsers(users);

  res.json({ ok: true, msg: '宸叉爣璁颁负鏈€氳繃锛岃閲嶆柊鎻愪氦璁よ瘉淇℃伅' });
});

// 鑾峰彇鎵€鏈夊悓瀛﹁璇佽褰曪紙浠呯鐞嗗憳锛屾寜鐘舵€佸垎缁勶級
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
      return tb.localeCompare(ta); // 鏈€鏂扮殑鍦ㄥ墠
    });
  res.json({ ok: true, data: records });
});

// 閲嶇疆璁よ瘉璁板綍涓哄緟瀹℃牳锛堢鐞嗗憳鎾ら攢閫氳繃/鎭㈠琚┏鍥炵殑璁板綍锛?app.post('/api/admin/zhixue/:userId/reset', requireAdmin, (req, res) => {
  const users = readUsers();
  const userIndex = users.findIndex(u => u.id === req.params.userId);
  if (userIndex === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  const u = users[userIndex];
  if (!u.zhixueStatus || !['approved', 'rejected', 'pending_confirm'].includes(u.zhixueStatus)) {
    return res.json({ ok: false, msg: '璇ョ敤鎴峰綋鍓嶇姸鎬佹棤闇€閲嶇疆' });
  }

  u.zhixueStatus = 'pending';
  u.zhixueReviewedAt = null;
  u.zhixueReviewedBy = null;
  u.zhixueRejectReason = null;
  u.zhixueRejectedAt = null;
  u.certRealName = null;
  u.certClassName = null;
  u.zhixuePassword = u._origPassword || null; // 淇濈暀瀵嗙爜浠ヤ究閲嶆柊瀹℃牳
  writeUsers(users);

  res.json({ ok: true, msg: '宸查噸缃负寰呭鏍哥姸鎬? });
});

// 鑾峰彇鎸囧畾鐢ㄦ埛鍏紑淇℃伅锛堥€氳繃鐢ㄦ埛ID锛?app.get('/api/users/:id', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if (user.status === 'banned') return res.json({ ok: false, msg: '璇ヨ处鍙峰凡琚鐢?, code: 'BANNED' });
  // 涓嶈繑鍥炲瘑鐮佺瓑鏁忔劅淇℃伅
  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, createdAt: user.createdAt, postCount: user.postCount || 0, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole } });
});

// 鑾峰彇鐢ㄦ埛瀹屾暣璇︽儏锛堜粎绠＄悊鍛橈級
app.post('/api/admin/user/:id/detail', requireAdmin, requireSuper, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  // 璇诲彇甯栧瓙
  const posts = readPosts();
  const userPosts = posts.filter(p => p.userId === user.id || p.author === user.nickname);

  // 璇诲彇涓炬姤璁板綍
  const reports = readReports();
  const userReports = reports.filter(r =>
    r.reportedBy === user.id || r.reporterName === user.nickname ||
    r.postAuthor === user.nickname
  );

  // 鏋勫缓杩斿洖鏁版嵁锛堟帓闄?password锛?  const { password, ...safeUser } = user;
  res.json({
    ok: true,
    data: {
      ...safeUser,
      postCount: userPosts.length,
      posts: userPosts.map(p => ({
        id: p.id,
        content: p.content,
        type: p.type || '鏃ュ父',
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

// 鎵归噺鍒犻櫎鐢ㄦ埛锛堜粎绠＄悊鍛橈級
app.post('/api/admin/users/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.json({ ok: false, msg: '璇锋寚瀹氳鍒犻櫎鐨勭敤鎴? });
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

// ===== 鍗″瘑绠＄悊锛堜粎瓒呯骇绠＄悊鍛橈級=====
// 姣忔棩鍒涘缓鏁伴噺闄愬埗
const cardCreateLimits = new Map();
const CARD_DAILY_LIMIT = 100; // 姣忓ぉ鏈€澶氬垱寤?100 寮?
// 鍒涘缓鍗″瘑
app.post('/api/admin/credit-cards/create', requireAdmin, requireSuper, (req, res) => {
  const { count, value } = req.body;
  const num = parseInt(count) || 1;
  const val = parseInt(value) || 10;
  if (num < 1 || num > 100) return res.json({ ok: false, msg: '鏁伴噺鑼冨洿 1~100' });
  if (val < 1) return res.json({ ok: false, msg: '闈㈠€艰嚦灏戜负 1 Credit' });

  // 姣忔棩闄愰妫€鏌?  const today = new Date().toISOString().slice(0, 10);
  const key = req.admin.id + '|' + today;
  const used = cardCreateLimits.get(key) || 0;
  if (used + num > CARD_DAILY_LIMIT) {
    return res.json({ ok: false, msg: '浠婃棩鍒涘缓宸茶揪涓婇檺锛? + CARD_DAILY_LIMIT + ' 寮狅級锛岃鏄庡ぉ鍐嶈瘯' });
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

  // 瀹¤鏃ュ織
  console.warn('[AUDIT] 瓒呯骇绠＄悊鍛?' + req.admin.id + ' 鍒涘缓浜?' + num + ' 寮犲崱瀵嗭紝姣忓紶 ' + val + ' Credit');

  res.json({ ok: true, data: { count: num, value: val, cards: newCards.map(c => c.code) } });
});

// 鏌ヨ鎵€鏈夊崱瀵?app.get('/api/admin/credit-cards', requireAdmin, requireSuper, (req, res) => {
  const cards = readCreditCards();
  const users = readUsers();
  const list = cards.reverse().map(c => ({
    ...c,
    usedByNickname: c.usedBy ? (users.find(u => u.id === c.usedBy)?.nickname || '鏈煡') : null
  }));
  res.json({ ok: true, data: list });
});

// ===== Credit 绠＄悊锛堜粎瓒呯骇绠＄悊鍛橈級=====

// 鑾峰彇 Credit 鎬昏鏁版嵁
app.get('/api/admin/credit/overview', requireAdmin, requireSuper, (req, res) => {
  // 鍗″瘑缁熻
  const cards = readCreditCards();
  const totalRedeemed = cards.filter(c => c.status === 'used').reduce((s, c) => s + c.value, 0); // 宸插厬鎹?  // 鐢ㄦ埛鎸佹湁鎬婚噺
  const users = readUsers();
  const inCirculation = users.reduce((s, u) => s + (u.credit || 0), 0);
  // 绠＄悊鍛樻墸闄ゆ€婚噺
  const logs = readCreditLogs();
  const totalDeducted = logs.filter(l => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);

  // 杩?7 澶╂瘡鏃ユ暟鎹?  const chart = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const dayStr = day.toISOString().slice(0, 10);
    const label = i === 0 ? '浠婂ぉ' : (day.getMonth() + 1) + '/' + day.getDate();
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

// 鎼滅储鐢ㄦ埛锛堟寜鐢ㄦ埛鍚嶆垨鏄电О锛?app.get('/api/admin/credit/search-user', requireAdmin, requireSuper, (req, res) => {
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

// 璧犻€?Credit 缁欐寚瀹氱敤鎴?app.post('/api/admin/credit/grant', requireAdmin, requireSuper, (req, res) => {
  const { userId, amount, reason } = req.body;
  const num = parseInt(amount);
  if (!userId) return res.json({ ok: false, msg: '璇锋寚瀹氱敤鎴? });
  if (!num || num < 1 || num > 10000) return res.json({ ok: false, msg: '璧犻€佹暟閲忚寖鍥?1~10000' });

  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  users[idx].credit = (users[idx].credit || 0) + num;
  writeUsers(users);

  // 璁板綍娴佹按
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId,
    amount: num,
    reason: '绠＄悊鍛樿禒閫侊細' + (reason || '鏃犲娉?) + '锛堢粡鍔炰汉锛? + req.admin.id + '锛?,
    createdAt: new Date().toISOString()
  });
  writeCreditLogs(logs);

  // 瀹¤鏃ュ織
  console.warn('[AUDIT] 绠＄悊鍛?' + req.admin.id + ' 璧犻€?' + num + ' Credit 缁欑敤鎴?' + userId);

  res.json({ ok: true, data: { credit: users[idx].credit } });
});

// 鎵ｉ櫎鐢ㄦ埛 Credit
app.post('/api/admin/credit/deduct', requireAdmin, requireSuper, (req, res) => {
  const { userId, amount, reason } = req.body;
  const num = parseInt(amount);
  if (!userId) return res.json({ ok: false, msg: '璇锋寚瀹氱敤鎴? });
  if (!num || num < 1 || num > 10000) return res.json({ ok: false, msg: '鎵ｉ櫎鏁伴噺鑼冨洿 1~10000' });

  const users = readUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  const current = users[idx].credit || 0;
  if (current < num) return res.json({ ok: false, msg: '鐢ㄦ埛 Credit 浣欓涓嶈冻锛屽綋鍓嶄粎 ' + current });

  users[idx].credit = current - num;
  writeUsers(users);

  // 璁板綍娴佹按锛堣礋鏁拌〃绀烘墸闄わ級
  const logs = readCreditLogs();
  logs.push({
    id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId,
    amount: -num,
    reason: '绠＄悊鍛樻墸闄わ細' + (reason || '鏃犲娉?) + '锛堢粡鍔炰汉锛? + req.admin.id + '锛?,
    createdAt: new Date().toISOString()
  });
  writeCreditLogs(logs);

  // 瀹¤鏃ュ織
  console.warn('[AUDIT] 绠＄悊鍛?' + req.admin.id + ' 鎵ｉ櫎鐢ㄦ埛 ' + userId + ' 鐨?' + num + ' Credit');

  res.json({ ok: true, data: { credit: users[idx].credit } });
});

// 鑾峰彇鎸囧畾鐢ㄦ埛鍙戝竷甯栧瓙
app.get('/api/users/:id/posts', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if (user.status === 'banned') return res.json({ ok: false, msg: '璇ヨ处鍙峰凡琚鐢?, code: 'BANNED' });
  const posts = readPosts();
  const userPosts = posts.filter(p => !p.deleted && (p.userId === user.id || p.author === user.nickname));
  res.json({ ok: true, data: userPosts });
});

// 鑾峰彇鐢ㄦ埛鍒楄〃锛堜粎绠＄悊鍛橈級
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

// 灏佺/瑙ｅ皝鐢ㄦ埛锛堜粎绠＄悊鍛橈紝鏀寔 banDays: 0=姘镐箙, >0=澶╂暟锛?app.put('/api/admin/user/:id/status', requireAdmin, (req, res) => {
  const { status, banDays } = req.body;
  if (!['active', 'banned'].includes(status)) {
    return res.json({ ok: false, msg: '鐘舵€佹棤鏁? });
  }
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  user.status = status;
  if (status === 'banned') {
    if (banDays !== undefined && banDays !== null) {
      const days = parseInt(banDays);
      if (isNaN(days) || days < 0) return res.json({ ok: false, msg: '澶╂暟鏃犳晥' });
      if (days === 0) {
        user.banUntil = null; // 姘镐箙
        user.banDays = null;
      } else {
        const until = new Date();
        until.setDate(until.getDate() + days);
        user.banUntil = until.toISOString();
        user.banDays = days;
      }
    }
  } else {
    // 瑙ｅ皝鏃舵竻闄ゅ皝绂佷俊鎭?    user.banUntil = null;
    user.banDays = null;
  }
  writeUsers(users);
  res.json({ ok: true });
});

// 鍒犻櫎鐢ㄦ埛锛堜粎绠＄悊鍛橈級鈥斺€?鐢ㄦ埛璐﹀彿鐗╃悊鍒犻櫎锛屽叾鍐呭杞垹闄や繚鐣?app.delete('/api/admin/user/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  // 鐗╃悊鍒犻櫎璇ョ敤鎴风殑鎵€鏈夊笘瀛愶紝鍏堜繚瀛樺埌 deleted_items
  let posts = readPosts();
  const now = new Date().toISOString();
  let softDeleted = 0;
  posts.forEach(p => {
    if (!p.deleted && (p.userId === userId || p.author === user.nickname)) {
      saveDeletedItem('post', p, 'system');
      softDeleted++;
    }
  });
  posts = posts.filter(p => !(p.userId === userId || p.author === user.nickname) || p.deleted);
  writePosts(posts);

  // 鍐嶅垹闄ょ敤鎴疯处鍙?  const updated = users.filter(u => u.id !== userId);
  writeUsers(updated);

  res.json({ ok: true, deletedPosts: softDeleted });
});

// 閲嶇疆鐢ㄦ埛瀵嗙爜锛堜粎绠＄悊鍛橈級鈥斺€?鐢熸垚闅忔満瀵嗙爜杩斿洖缁欑鐞嗗憳
app.post('/api/admin/user/:id/reset-password', requireAdmin, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  // 鐢熸垚 8 浣嶉殢鏈哄瘑鐮?  const newPassword = Math.random().toString(36).slice(2, 10);
  user.password = hashPassword(newPassword);
  writeUsers(users);

  res.json({ ok: true, data: { password: newPassword } });
});

// 鑾峰彇鐢ㄦ埛瀹屾暣璇︽儏锛堜粎绠＄悊鍛橈級
app.get('/api/admin/user/:id/detail', requireAdmin, requireSuper, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  // 涓嶈繑鍥炲瘑鐮侊紱瑙ｅ瘑瀹炲悕淇℃伅
  const { password, certRealName, certClassName, ...safeUser } = user;
  safeUser.certRealNameDecrypted  = decryptCert(certRealName)  || null;
  safeUser.certClassNameDecrypted = decryptCert(certClassName) || null;

  // 甯栧瓙
  const posts = readPosts();
  const userPosts = posts.filter(p => p.userId === user.id || p.author === user.nickname)
    .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
    .slice(0, 20)
    .map(p => ({ id: p.id, content: p.content, type: p.type, time: p.time, likes: p.likes || 0, commentsCount: p.commentsCount || 0 }));

  // 涓炬姤璁板綍
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

// 鍙戝笘鏃舵洿鏂扮敤鎴?postCount
function incUserPostCount(nickname) {
  const users = readUsers();
  const user = users.find(u => u.nickname === nickname);
  if (user) {
    user.postCount = (user.postCount || 0) + 1;
    writeUsers(users);
  }
}

// 鑾峰彇鎵€鏈夊笘瀛?app.get('/api/posts', (req, res) => {
  const posts = readPosts();
  // 杩囨护宸插垹闄ょ殑甯栧瓙锛堟櫘閫氱敤鎴蜂笉鍙锛?  const activePosts = posts.filter(p => !p.deleted);
  const users = readUsers();
  const admins = readAdmins(); // 鐢ㄤ簬楠岃瘉绠＄悊鍛樼粦瀹氭槸鍚︿粛鏈夋晥
  // 涓烘瘡涓笘瀛愰檮鍔犱綔鑰呯殑绠＄悊鍛樿鑹蹭俊鎭?  const postsWithAdmin = activePosts.map(p => {
    if (p.userId) {
      const author = users.find(u => u.id === p.userId);
      if (author) {
        // 璁よ瘉鐘舵€佹牎楠岋細approved 蹇呴』鏈夊鏍歌褰?        let zhixueStatus = author.zhixueStatus || null;
        if (zhixueStatus === 'approved' && !author.zhixueReviewedBy) {
          zhixueStatus = null;
        }
        // 绠＄悊鍛樼粦瀹氭湁鏁堟€ф牎楠岋細绠＄悊鍛樿处鍙峰繀椤讳粛瀛樺湪
        let adminRole = null;
        let adminId = null;
        if (author.bindAdminId && author.bindAdminRole) {
          const boundAdmin = admins.find(a => a.id === author.bindAdminId);
          if (boundAdmin) {
            adminRole = author.bindAdminRole;
            adminId = author.bindAdminId;
          }
        }
        return {
          ...p,
          authorAdminRole: adminRole,
          authorBindAdminId: adminId,
          authorZhixueStatus: zhixueStatus,
          authorZhixueCertType: author.zhixueCertType || null
        };
      }
    }
    return p;
  });
  res.json({ ok: true, data: postsWithAdmin });
});

// 鑾峰彇鍗曚釜甯栧瓙锛堢敤浜庤鎯呴〉锛?app.get('/api/posts/:id', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });
  if (post.deleted) return res.json({ ok: false, msg: '甯栧瓙宸茶鍒犻櫎' });
  // 杩囨护宸插垹闄ょ殑璇勮
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
      return res.json({ ok: true, data: { ...post, authorZhixueStatus: zhixueStatus, authorZhixueCertType: author.zhixueCertType || null } });
    }
  }
  res.json({ ok: true, data: post });
});

  // 鍙戝竷鏂板笘瀛?app.post('/api/posts', (req, res) => {
  // 楠岃瘉鐢ㄦ埛 Token锛堝彲閫夛細娌?token 浠ュ尶鍚嶈韩浠藉彂甯栵紝鏈?token 蹇呴』鏈夋晥锛?  let realUserId = null;
  let realAuthor = '鍖垮悕';
  let realAvatar = '馃檲';
  const token = req.headers['x-user-token'];
  if (token) {
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?, code: 'TOKEN_EXPIRED' });
    realUserId = session.id;
    realAuthor = session.nickname || '鍖垮悕';
    // 浠庣敤鎴锋暟鎹腑鑾峰彇澶村儚
    const allUsers = readUsers();
    const user = allUsers.find(u => u.id === session.id);
    realAvatar = (user && user.avatar) || '馃檲';
  }

  const { type, content, captchaId, captchaText, sensitiveForce, images } = req.body;

  
// 鍙戝笘棰戠巼妫€娴嬶紙5鍒嗛挓鍐呮渶澶?绡囷紝瓒呭嚭闇€楠岃瘉鐮侊級
if (realUserId) {
  const now = Date.now();
  const timestamps = postRateLimit.get(realUserId) || [];
  const recentPosts = timestamps.filter(ts => now - ts < 300000);
  if (recentPosts.length >= 3) {
    const entry = captchaStore.get(captchaId);
    if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
      return res.json({ ok: false, needCaptcha: true, msg: '鍙戝笘棰戠巼杩囬珮锛岃鍏堥獙璇? });
    }
    // 楠岃瘉鐮侀€氳繃锛屾竻闄ら檺鍒讹紝閲嶆柊璁℃椂
    postRateLimit.delete(realUserId);
    captchaStore.delete(captchaId);
  }
  // 璁板綍鏈鍙戝笘
  postRateLimit.set(realUserId, [...recentPosts.slice(-19), now]); // 淇濈暀鏈€杩?0鏉?}
if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '鍐呭涓嶈兘涓虹┖' });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return res.json({ ok: false, msg: '鍐呭涓嶈兘瓒呰繃 ' + CONTENT_MAX_LENGTH + ' 瀛? });
  }
  if (!type) {
    return res.json({ ok: false, msg: '璇烽€夋嫨绫诲瀷' });
  }

  // 鏁忔劅璇嶆娴嬶紙sensitiveForce=true 鏃惰烦杩囨鏌ワ紝浣嗗悗缁粛浼氱敓鎴愪妇鎶ワ級
  const sensitiveWords = checkSensitive(content);
  const hasSensitive = sensitiveWords.length > 0;

  // 鏈夋晱鎰熻瘝涓旂敤鎴锋湭纭 鈫?涓嶄繚瀛橈紝杩斿洖璀﹀憡
  if (hasSensitive && !sensitiveForce) {
    return res.json({
      ok: false,
      warning: true,
      warningMsg: '鍐呭鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀瑰悗閲嶈瘯'
    });
  }

  // 闇稿噷淇濇姢濮撳悕妫€娴嬶紙濮嬬粓闃绘锛屼笉鏀寔 force 缁曡繃锛?  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({
      ok: false,
      bullying: true,
      warningMsg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€?
    });
  }

  const posts = readPosts();

  // 楠岃瘉鍥剧墖锛坆ase64 data URL锛屾瘡寮犫墹2MB锛屾渶澶?寮狅級
  var validImages = [];
  var maxImageSize = 2 * 1024 * 1024;
  if (Array.isArray(images)) {
    images.forEach(function(img) {
      if (typeof img === 'string' && img.startsWith('data:') && img.length <= maxImageSize && validImages.length < 4) {
        validImages.push(img);
      }
    });
  }

  const newPost = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    content: content.trim(),
    avatar: realAvatar,
    author: realAuthor,
    userId: realUserId,
    time: new Date().toISOString(),
    likes: 0,
    likedBy: [],
    comments: 0,
    commentsCount: 0,
    liked: false,
    rotate: (Math.random() - 0.5) * 8,
    zIndex: Math.floor(Math.random() * 5) + 1,
    images: validImages.length > 0 ? validImages : undefined
  };

  posts.unshift(newPost);
  writePosts(posts);

  // 鏁忔劅璇嶅懡涓細鑷姩鐢熸垚涓炬姤璁板綍鎸傚埌鍚庡彴
  if (hasSensitive) {
    const reports = readReports();
    reports.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'sensitive_post',
      targetId: newPost.id,
      postId: newPost.id,
      reason: '绯荤粺鑷姩妫€娴嬶細鍐呭鍖呭惈鏁忔劅璇?[' + sensitiveWords.join(', ') + ']',
      reportedBy: realUserId,
      reporterName: realAuthor,
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    writeReports(reports);
  }

  // 鏇存柊娉ㄥ唽鐢ㄦ埛鐨勫彂璐存暟
  if (realUserId && realAuthor) {
    incUserPostCount(realAuthor);
  }

  // 鍚屾鍒拌璁哄尯锛堝鏋滅敤鎴锋寚瀹氫簡璇濋锛?  const syncDiscussionId = req.body.syncDiscussionId;
  if (syncDiscussionId && realUserId) {
    var discussions = readDiscussions();
    var disc = discussions.find(function(d) { return d.id === syncDiscussionId; });
    if (disc && !disc.deleted) {
      var discComments = readDiscussionComments();
      var newDiscComment = {
        id: 'dc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        discussionId: syncDiscussionId,
        parentId: null,
        content: content.trim(),
        author: realAuthor,
        userId: realUserId,
        createdAt: new Date().toISOString(),
        likes: 0,
        liked: false,
        reportCount: 0,
        syncPostId: newPost.id
      };
      discComments.push(newDiscComment);
      writeDiscussionComments(discComments);
      disc.commentCount = (disc.commentCount || 0) + 1;
      writeDiscussions(discussions);
    }
  }

  res.json({
    ok: true,
    data: newPost,
    warning: false,
    warningMsg: undefined
  });
});

// 鐐硅禐 / 鍙栨秷鐐硅禐锛堝甫鐢ㄦ埛韬唤璺熻釜锛?app.post('/api/posts/:id/like', (req, res) => {
  // 鑾峰彇鐐硅禐鑰呰韩浠?  let likerId = getClientIP(req); // 鍖垮悕鐢ㄦ埛鐢?IP
  const token = req.headers['x-user-token'];
  if (token) {
    const session = verifyUserToken(token);
    if (session) likerId = session.id;
  }

  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);

  if (!post) {
    return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });
  }

  // 鍒濆鍖?likedBy 鏁扮粍锛堝吋瀹规棫鏁版嵁锛?  if (!Array.isArray(post.likedBy)) post.likedBy = [];

  const idx = post.likedBy.indexOf(likerId);
  if (idx === -1) {
    post.likedBy.push(likerId);
  } else {
    post.likedBy.splice(idx, 1);
  }

  post.likes = post.likedBy.length;
  post.liked = post.likedBy.includes(likerId);

  writePosts(posts);

  res.json({ ok: true, data: { liked: post.liked, likes: post.likes } });
});

// 鑾峰彇甯栧瓙璇勮
app.get('/api/posts/:id/comments', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });
  }
  const comments = post.comments || [];
  res.json({ ok: true, data: comments });
});

// 鍙戣〃璇勮锛堥渶 Token 楠岃瘉锛?app.post('/api/posts/:id/comments', (req, res) => {
  // 楠岃瘉鐢ㄦ埛 Token
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍鍚庡啀璇勮', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?, code: 'TOKEN_EXPIRED' });

  // 浠?Token 涓幏鍙栫敤鎴蜂俊鎭紝绂佹浠?req.body 璇诲彇
  const author = session.nickname || '鍖垮悕';
  const userId = session.id;
  // 鑾峰彇鐢ㄦ埛澶村儚
  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  const avatar = (user && user.avatar) || '馃檲';

  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '璇勮鍐呭涓嶈兘涓虹┖' });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return res.json({ ok: false, msg: '璇勮涓嶈兘瓒呰繃 ' + CONTENT_MAX_LENGTH + ' 瀛? });
  }
  // 鏁忔劅璇嶆娴嬶紙sensitiveForce=true 鏃惰烦杩囨鏌ワ紝鍚庣画浠嶄細鐢熸垚涓炬姤锛?  const sensitiveForce = req.body.sensitiveForce === true;
  const sensitiveWords = checkSensitive(content);
  const hasSensitive = sensitiveWords.length > 0;

  // 鏈夋晱鎰熻瘝涓旂敤鎴锋湭纭 鈫?涓嶄繚瀛橈紝杩斿洖璀﹀憡
  if (hasSensitive && !sensitiveForce) {
    return res.json({
      ok: false,
      warning: true,
      warningMsg: '鍐呭鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀瑰悗閲嶈瘯'
    });
  }

  // 闇稿噷淇濇姢濮撳悕妫€娴嬶紙濮嬬粓闃绘锛?  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({
      ok: false,
      bullying: true,
      warningMsg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€?
    });
  }

  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });
  }
  if (!post.comments) post.comments = [];
  const newComment = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    content: content.trim(),
    author: author || '鍖垮悕',
    avatar: avatar || '馃檲',
    userId: userId || null,
    time: new Date().toISOString(),
    likes: 0,
    liked: false
  };
  post.comments.push(newComment);
  post.commentsCount = post.comments.length;

  // 鏁忔劅璇嶅懡涓細鑷姩鐢熸垚涓炬姤璁板綍锛堜粎鍦?sensitiveForce 鏃舵墽琛岋級
  if (hasSensitive) {
    const reports = readReports();
    reports.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'sensitive_comment',
      targetId: newComment.id,
      postId: post.id,
      reason: '绯荤粺鑷姩妫€娴嬶細璇勮鍖呭惈鏁忔劅璇?[' + sensitiveWords.join(', ') + ']',
      reportedBy: realUserId,
      reporterName: realAuthor,
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

// 璇勮鐐硅禐锛堝甫鐢ㄦ埛韬唤璺熻釜锛?app.post('/api/posts/:postId/comments/:commentId/like', (req, res) => {
  // 鑾峰彇鐐硅禐鑰呰韩浠?  let likerId = getClientIP(req);
  const token = req.headers['x-user-token'];
  if (token) {
    const session = verifyUserToken(token);
    if (session) likerId = session.id;
  }

  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });
  const comment = (post.comments || []).find(c => c.id === req.params.commentId);
  if (!comment) return res.json({ ok: false, msg: '璇勮涓嶅瓨鍦? });

  // 鍒濆鍖?likedBy 鏁扮粍锛堝吋瀹规棫鏁版嵁锛?  if (!Array.isArray(comment.likedBy)) comment.likedBy = [];

  const idx = comment.likedBy.indexOf(likerId);
  if (idx === -1) {
    comment.likedBy.push(likerId);
  } else {
    comment.likedBy.splice(idx, 1);
  }

  comment.likes = comment.likedBy.length;
  comment.liked = comment.likedBy.includes(likerId);

  writePosts(posts);
  res.json({ ok: true, data: { liked: comment.liked, likes: comment.likes } });
});

// 鍒犻櫎璇勮锛堣瘎璁轰綔鑰呮垨甯栧瓙浣滆€呭彲鍒狅級鈥斺€?鏀逛负杞垹闄?app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
  const userId = req.headers['x-user-token'] ? (() => {
    const s = verifySignedToken(req.headers['x-user-token']);
    return s ? s.id : null;
  })() : null;
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.postId);
  if (!post) return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });
  const comment = (post.comments || []).find(c => c.id === req.params.commentId);
  if (!comment) return res.json({ ok: false, msg: '璇勮涓嶅瓨鍦? });
  if (comment.deleted) return res.json({ ok: false, msg: '璇勮宸茶鍒犻櫎' });
  const isCommentAuthor = userId && comment.userId && userId === comment.userId;
  const isPostAuthor = userId && post.userId && userId === post.userId;
  if (!isCommentAuthor && !isPostAuthor) {
    return res.json({ ok: false, msg: '鏃犳潈鍒犻櫎姝よ瘎璁? });
  }
  saveDeletedItem('comment', comment, userId === comment.userId ? 'user' : 'post_author');
  post.comments = post.comments.filter(c => c.id !== req.params.commentId);
  post.commentsCount = post.comments.length;
  writePosts(posts);
  res.json({ ok: true });
});

// 涓炬姤璇勮
app.post('/api/comments/:commentId/report', (req, res) => {
  const { postId, reason } = req.body;
  if (!reason) return res.json({ ok: false, msg: '璇峰～鍐欎妇鎶ュ師鍥? });
  const reports = readReports();
  // 鍘婚噸
  const existing = reports.find(r => r.targetId === req.params.commentId && r.type === 'comment');
  if (existing) return res.json({ ok: false, msg: '宸蹭妇鎶ヨ繃姝よ瘎璁? });
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

// 鎵归噺鍒犻櫎璇勮锛堢鐞嗗悗鍙帮級鈥斺€?鏀逛负杞垹闄?app.delete('/api/admin/comments/:commentId', requireAdmin, (req, res) => {
  const posts = readPosts();
  let found = false;
  const now = new Date().toISOString();
  posts.forEach(post => {
    const comment = (post.comments || []).find(c => c.id === req.params.commentId);
    if (comment && !comment.deleted) {
      saveDeletedItem('comment', comment, 'admin');
      post.comments = post.comments.filter(c => c.id !== req.params.commentId);
      post.commentsCount = post.comments.length;
      found = true;
    }
  });
  if (!found) return res.json({ ok: false, msg: '璇勮涓嶅瓨鍦ㄦ垨宸茶鍒犻櫎' });
  writePosts(posts);
  // 鍚屾椂鍒犻櫎璇ヨ瘎璁虹殑涓炬姤璁板綍
  const reports = readReports();
  const remaining = reports.filter(r => r.targetId !== req.params.commentId || r.type !== 'comment');
  writeReports(remaining);
  res.json({ ok: true });
});

app.post('/api/comments/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.json({ ok: false, msg: '璇锋彁渚涜鍒犻櫎鐨勮瘎璁?ID 鍒楄〃' });
  const posts = readPosts();
  let deletedCount = 0;
  const now = new Date().toISOString();
  posts.forEach(post => {
    (post.comments || []).forEach(c => {
      if (ids.includes(c.id) && !c.deleted) {
        saveDeletedItem('comment', c, 'admin');
        deletedCount++;
      }
    });
    post.comments = (post.comments || []).filter(c => !ids.includes(c.id) || c.deleted);
    post.commentsCount = (post.comments || []).length;
  });
  writePosts(posts);
  // 鍚屾椂鍒犻櫎鐩稿叧鐨勪妇鎶ヨ褰?  const reports = readReports();
  const remainingReports = reports.filter(r => !ids.includes(r.targetId) || r.type !== 'comment');
  writeReports(reports);
  res.json({ ok: true, deleted: deletedCount });
});

// 鎵归噺鍒犻櫎甯栧瓙 鈥斺€?鏀逛负杞垹闄?app.post('/api/posts/batch-delete', requireAdmin, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.json({ ok: false, msg: '璇锋彁渚涜鍒犻櫎鐨勫笘瀛?ID 鍒楄〃' });
  }
  let posts = readPosts();
  let deletedCount = 0;
  posts.forEach(p => {
    if (ids.includes(p.id) && !p.deleted) {
      saveDeletedItem('post', p, 'admin');
      deletedCount++;
    }
  });
  posts = posts.filter(p => !ids.includes(p.id) || p.deleted);
  writePosts(posts);
  res.json({ ok: true, deleted: deletedCount });
});

// 鍒犻櫎甯栧瓙锛堜粎绠＄悊鍛橈級鈥斺€?鏀逛负鐗╃悊鍒犻櫎锛屽啓鍏?deleted_items
app.delete('/api/posts/:id', requireAdmin, (req, res) => {
  let posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });
  if (post.deleted) return res.json({ ok: false, msg: '甯栧瓙宸茶鍒犻櫎' });

  saveDeletedItem('post', post, 'admin');
  posts = posts.filter(p => p.id !== req.params.id);
  writePosts(posts);
  deleteSyncedDiscComment(req.params.id);
  res.json({ ok: true });
});

// 鐢ㄦ埛鍒犻櫎鑷繁鍙戠殑甯栧瓙 鈥斺€?鐗╃悊鍒犻櫎锛屽啓鍏?deleted_items
app.delete('/api/user/posts/:id', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  let posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });
  if (post.deleted) return res.json({ ok: false, msg: '甯栧瓙宸茶鍒犻櫎' });
  if (post.userId !== session.id) return res.json({ ok: false, msg: '鏃犳潈鍒犻櫎浠栦汉鐨勫笘瀛? });

  saveDeletedItem('post', post, 'user');
  posts = posts.filter(p => p.id !== req.params.id);
  writePosts(posts);
  deleteSyncedDiscComment(req.params.id);
  res.json({ ok: true });
});

// 淇敼甯栧瓙锛堢疆椤?淇敼鍐呭锛?app.put('/api/posts/:id', requireAdmin, (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });

  const { content, pinned } = req.body;
  if (content !== undefined) post.content = content;
  if (pinned !== undefined) post.pinned = pinned;

  writePosts(posts);
  res.json({ ok: true, data: post });
});

// 缁熻鏁版嵁
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

  ['鏃ュ父', '琛ㄧ櫧', '鏍戞礊', '澶辩墿鎷涢', '娲诲姩'].forEach(t => {
    stats.byType[t] = posts.filter(p => p.type === t).length;
  });

  stats.dailyChart = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    stats.dailyChart.push({
      label: i === 0 ? '浠婂ぉ' : `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
      count: posts.filter(p => {
        const t = new Date(p.time).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length
    });
  }

  res.json({ ok: true, data: stats });
});

// ===== 涓炬姤鏁版嵁璇诲啓 =====
function readReports () { return db.readReports(); }

function writeReports (reports) { db.writeReports(reports); }



// ===== 鐢ㄦ埛鍙嶉璇诲啓 =====
function readFeedbacks () { return db.readFeedbacks(); }

function writeFeedbacks (feedbacks) { db.writeFeedbacks(feedbacks); }

// ===== 闇稿噷鎶ュ憡璇诲啓 =====
function readBullying () { return db.readBullying(); }

function writeBullying (data) { db.writeBullying(data); }
// ===== Credit 鏁版嵁璇诲啓 =====
function readCreditLogs () { return db.readCreditLogs(); }

function writeCreditLogs (logs) { db.writeCreditLogs(logs); }

// ===== 鍗″瘑鏁版嵁璇诲啓 =====
function readCreditCards () { return db.readCreditCards(); }
function writeCreditCards (cards) { db.writeCreditCards(cards); }
// 鐢熸垚鍗″瘑锛欳W-XXXX-XXXX-X锛堝惈鏍￠獙鐮侀槻杈撻敊锛?// 瀛楁瘝琛ㄦ帓闄ゆ槗娣锋穯鐨?0/O/1/I
const CARD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CARD_MOD = CARD_CHARS.length;

// Luhn mod N 鏍￠獙锛氭渶鍚庝竴浣嶆槸鏍￠獙鐮?function luhnModN(code) {
  let factor = 2;
  let sum = 0;
  const n = CARD_MOD;
  for (let i = code.length - 2; i >= 0; i--) { // 浠庡€掓暟绗簩浣嶅紑濮嬬畻
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
    // 绠楁牎楠岀爜
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
    if (attempts > 100) break; // 闃叉寰幆
  } while (codeSet.has(code));
  return code;
}

// ===== 璁ㄨ鏁版嵁璇诲啓 =====
const DISCUSSIONS_FILE = path.join(DATA_DIR, 'discussions.json');
const DISCUSSION_COMMENTS_FILE = path.join(DATA_DIR, 'discussion_comments.json');
const ANNOUNCEMENT_FILE = path.join(DATA_DIR, 'announcement.json');

function readAnnouncement () { return db.readAnnouncement(); }

function writeAnnouncement (data) { db.writeAnnouncement(data); }

function readDiscussions () { return db.readDiscussions(); }

function writeDiscussions (discussions) { db.writeDiscussions(discussions); }

function readDiscussionComments () { return db.readDiscussionComments(); }

function writeDiscussionComments (comments) { db.writeDiscussionComments(comments); }

// ===== 鍏憡 API =====

// 鑾峰彇褰撳墠鍏憡锛堝叕寮€锛?app.get('/api/announcement', (req, res) => {
  const announcement = readAnnouncement();
  res.json({ ok: true, data: announcement });
});

// 鍙戝竷/鏇存柊鍏憡锛堢鐞嗗憳锛?app.post('/api/announcement', requireAdmin, (req, res) => {
  const { title, content } = req.body;
  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '鍏憡鍐呭涓嶈兘涓虹┖' });
  }
  const data = {
    title: title ? title.trim() : '鍏憡',
    content: content.trim(),
    publishedAt: new Date().toISOString(),
    publishedBy: req.admin.name
  };
  writeAnnouncement(data);
  res.json({ ok: true, data });
});

// 鍒犻櫎鍏憡锛堢鐞嗗憳锛?app.delete('/api/announcement', requireAdmin, (req, res) => {
  writeAnnouncement(null);
  res.json({ ok: true });
});

// ===== 璁ㄨ API =====

// 鑾峰彇鎵€鏈夎璁鸿瘽棰橈紙鍏紑锛?app.get('/api/discussions', (req, res) => {
  const discussions = readDiscussions();
  const now = new Date();
  // 濡傛灉鏈夊叧閿瘝鎼滅储锛屽彧杩斿洖鍖归厤鐨勯潪鍒犻櫎璇濋
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    const matched = discussions.filter(d => !d.deleted && d.title && d.title.toLowerCase().includes(q));
    return res.json({ ok: true, data: matched.slice(0, 10).map(d => ({ id: d.id, title: d.title })) });
  }
  const active = discussions
    .filter(d => !d.deleted && (!d.expiresAt || parseLocalDateTime(d.expiresAt) > now))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: active });
});

// 鍒涘缓璁ㄨ璇濋锛堢鐞嗗憳 鎴?瀛︾敓浼氶€氱煡鍙戝竷鑰咃級
app.post('/api/discussions', (req, res) => {
  // 鍏佽绠＄悊鍛?token (x-admin-token) 鎴?瀛︾敓浼?token (x-sc-token)
  const adminToken = req.headers['x-admin-token'];
  const scToken = req.headers['x-sc-token'];
  let authed = false;
  let creatorName = null;
  if (adminToken) {
    const session = verifySignedToken(adminToken);
    if (session && session.id && session.loginAt && Date.now() - session.loginAt <= 24 * 3600 * 1000) {
      authed = true;
      creatorName = session.name || session.id;
    }
  } else if (scToken) {
    const session = verifySignedToken(scToken);
    if (session && session.id && session.loginAt && Date.now() - session.loginAt <= 24 * 3600 * 1000) {
      authed = true;
      creatorName = session.name || session.id;
    }
  }
  if (!authed) {
    return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  }

  const { title, expiresAt } = req.body;
  if (!title || !title.trim()) {
    return res.json({ ok: false, msg: '璇濋鏍囬涓嶈兘涓虹┖' });
  }

  const discussions = readDiscussions();

  const newDiscussion = {
    id: 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title.trim(),
    expiresAt: expiresAt || null, // null 琛ㄧず鏃犻檺鏈?    deleted: false,
    createdAt: new Date().toISOString(),
    createdBy: creatorName,
    commentCount: 0
  };
  discussions.push(newDiscussion);
  writeDiscussions(discussions);
  res.json({ ok: true, data: newDiscussion });
});

// 鏇存柊璁ㄨ璇濋锛堢鐞嗗憳锛?app.put('/api/discussions/:id', requireAdmin, (req, res) => {
  const { title, expiresAt } = req.body;
  const discussions = readDiscussions();
  const idx = discussions.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '璇濋涓嶅瓨鍦? });

  if (title !== undefined) {
    if (!title.trim()) return res.json({ ok: false, msg: '鏍囬涓嶈兘涓虹┖' });
    discussions[idx].title = title.trim();
  }
  if (expiresAt !== undefined) discussions[idx].expiresAt = expiresAt || null;
  writeDiscussions(discussions);
  res.json({ ok: true, data: discussions[idx] });
});

// 鍒犻櫎璁ㄨ璇濋锛堢鐞嗗憳锛夆€斺€?鐗╃悊鍒犻櫎锛屽啓鍏?deleted_items
app.delete('/api/discussions/:id', requireAdmin, (req, res) => {
  let discussions = readDiscussions();
  const d = discussions.find(d => d.id === req.params.id);
  if (!d) return res.json({ ok: false, msg: '璇濋涓嶅瓨鍦? });
  if (d.deleted) return res.json({ ok: false, msg: '璇濋宸茶鍒犻櫎' });
  saveDeletedItem('discussion', d, 'admin');
  discussions = discussions.filter(x => x.id !== req.params.id);
  writeDiscussions(discussions);

  // 鍚屾椂鐗╃悊鍒犻櫎璇ヨ瘽棰樹笅鐨勬墍鏈夎瘎璁?  let comments = readDiscussionComments();
  comments.forEach(c => {
    if (c.discussionId === req.params.id && !c.deleted) {
      saveDeletedItem('disc_comment', c, 'admin');
    }
  });
  comments = comments.filter(c => c.discussionId !== req.params.id || c.deleted);
  writeDiscussionComments(comments);

  res.json({ ok: true });
});

// 鑾峰彇鏌愪釜璇濋鐨勮瘎璁猴紙宓屽缁撴瀯锛?app.get('/api/discussions/:id/comments', (req, res) => {
  const comments = readDiscussionComments();
  const discussionComments = comments
    .filter(c => c.discussionId === req.params.id && !c.deleted)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // 鏋勫缓宓屽缁撴瀯
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

// 鍙戣〃璁ㄨ璇勮锛堥渶鐧诲綍锛?app.post('/api/discussions/:id/comments', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  const { content, parentId } = req.body;
  if (!content || !content.trim()) {
    return res.json({ ok: false, msg: '璇勮鍐呭涓嶈兘涓虹┖' });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    return res.json({ ok: false, msg: '璇勮涓嶈兘瓒呰繃 ' + CONTENT_MAX_LENGTH + ' 瀛? });
  }
  if (hasSpecialChars(content)) {
    return res.json({ ok: false, msg: '璇勮鍖呭惈鐗规畩瀛楃' });
  }
  // 鏁忔劅璇嶆娴嬶紙sensitiveForce=true 鏃惰烦杩囨鏌ワ紝鍚庣画浠嶄細鐢熸垚涓炬姤锛?  const sensitiveForce = req.body.sensitiveForce === true;
  const sensitiveWords = checkSensitive(content);
  const hasSensitive = sensitiveWords.length > 0;

  // 鏈夋晱鎰熻瘝涓旂敤鎴锋湭纭 鈫?涓嶄繚瀛橈紝杩斿洖璀﹀憡
  if (hasSensitive && !sensitiveForce) {
    return res.json({
      ok: false,
      warning: true,
      warningMsg: '鍐呭鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀瑰悗閲嶈瘯'
    });
  }

  // 闇稿噷淇濇姢濮撳悕妫€娴嬶紙濮嬬粓闃绘锛?  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({
      ok: false,
      bullying: true,
      warningMsg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€?
    });
  }

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user || user.status === 'banned') {
    return res.json({ ok: false, msg: '璐﹀彿宸茶绂佺敤' });
  }

  const discussions = readDiscussions();
  const discussion = discussions.find(d => d.id === req.params.id);
  if (!discussion) return res.json({ ok: false, msg: '璇濋涓嶅瓨鍦? });

  const comments = readDiscussionComments();
  const newComment = {
    id: 'dc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    discussionId: req.params.id,
    parentId: parentId || null,
    content: content.trim(),
    author: user.nickname || '鍖垮悕',
    avatar: user.avatar || '馃檲',
    userId: user.id,
    createdAt: new Date().toISOString(),
    likes: 0,
    liked: false,
    reportCount: 0,
    hidden: false
  };
  comments.push(newComment);
  writeDiscussionComments(comments);

  // 鏁忔劅璇嶅懡涓細鑷姩鐢熸垚涓炬姤璁板綍
  if (hasSensitive) {
    const reports = readReports();
    reports.push({
      id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: 'sensitive_discussion_comment',
      targetId: newComment.id,
      discussionId: req.params.id,
      reason: '绯荤粺鑷姩妫€娴嬶細璁ㄨ璇勮鍖呭惈鏁忔劅璇嶃€? + sensitiveWords.join('銆?) + '銆?,
      reportedBy: session.id,
      reporterName: session.nickname || '鏈煡',
      createdAt: new Date().toISOString(),
      status: 'pending'
    });
    writeReports(reports);
  }

  // 鍚屾鍒版牎鍥锛堝鏋滅敤鎴峰嬀閫変簡锛?  const syncToWall = req.body.syncToWall === true;
  if (syncToWall) {
    const posts = readPosts();
    const topicTitle = discussion.title || '璁ㄨ';
    const wallContent = '#' + topicTitle + ' ' + content.trim();
    const postId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    posts.unshift({
      id: postId,
      type: '鏃ュ父',
      content: wallContent,
      discussionId: req.params.id,
      avatar: user.avatar || '馃檲',
      author: session.nickname || '鍖垮悕',
      userId: session.id,
      time: new Date().toISOString(),
      likes: 0,
      comments: 0,
      commentsCount: 0,
      liked: false,
      rotate: (Math.random() - 0.5) * 8,
      zIndex: Math.floor(Math.random() * 5) + 1,
      images: undefined
    });
    writePosts(posts);
    newComment.syncPostId = postId;
  }

  // 鏇存柊璇濋璇勮鏁?  discussion.commentCount = (discussion.commentCount || 0) + 1;
  writeDiscussions(discussions);

  res.json({
    ok: true,
    data: newComment,
    warning: false,
    warningMsg: undefined
  });
});

// 鍒犻櫎璁ㄨ璇勮锛堝彂閫佽€呮垨绠＄悊鍛樺彲鍒狅級
app.delete('/api/discussions/comments/:id', (req, res) => {
  try {
    const token = req.headers['x-user-token'];
    const adminToken = req.headers['x-admin-token'];

    let isAdmin = false;
    let userId = null;

    if (adminToken) {
      if (verifySignedToken(adminToken)) {
        isAdmin = true;
      }
    }

    if (token) {
      const session = verifyUserToken(token);
      if (session) userId = session.id;
    }

    if (!isAdmin && !userId) {
      return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
    }

    const comments = readDiscussionComments();
    const comment = comments.find(c => c.id === req.params.id);
    if (!comment) return res.json({ ok: false, msg: '璇勮涓嶅瓨鍦? });
    if (comment.deleted) return res.json({ ok: false, msg: '璇勮宸茶鍒犻櫎' });

    // 妫€鏌ユ潈闄愶細璇勮浣滆€呫€佸洖澶嶄綔鑰呫€佺鐞嗗憳
    const isAuthor = userId && comment.userId && userId === comment.userId;
    const isParentAuthor = userId && comment.parentId
      ? (() => { const parent = comments.find(c => c.id === comment.parentId); return parent && parent.userId && parent.userId === userId; })()
      : false;

    if (!isAdmin && !isAuthor && !isParentAuthor) {
      return res.json({ ok: false, msg: '鏃犳潈鍒犻櫎姝よ瘎璁? });
    }

    const byWho = isAdmin ? 'admin' : 'user';
    // 鐗╃悊鍒犻櫎璇ヨ瘎璁哄強鍏舵墍鏈夊瓙鍥炲锛屽厛淇濆瓨
    let idsToRemove = [];
    let syncPostIds = [];
    comments.forEach(c => {
      if (c.id === req.params.id || c.parentId === req.params.id) {
        try { saveDeletedItem('disc_comment', c, byWho); } catch(e) { console.warn('[delete] saveDeletedItem failed:', e.message); }
        if (c.syncPostId) syncPostIds.push(c.syncPostId);
        idsToRemove.push(c.id);
      }
    });
    const filtered = comments.filter(c => !idsToRemove.includes(c.id));
    writeDiscussionComments(filtered);

    // 鍚屾鍒犻櫎瀵瑰簲鐨勬牎鍥甯栧瓙
    if (syncPostIds.length > 0) {
      let posts = readPosts();
      syncPostIds.forEach(function(pid) {
        var p = posts.find(function(x) { return x.id === pid; });
        if (p) {
          try { saveDeletedItem('post', p, byWho); } catch(e) { console.warn('[delete] sync post saveDeletedItem failed:', e.message); }
        }
      });
      posts = posts.filter(function(x) { return syncPostIds.indexOf(x.id) === -1; });
      writePosts(posts);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[delete-disc-comment] 500:', e.message, e.stack);
    res.json({ ok: false, msg: '鏈嶅姟鍣ㄩ敊璇? ' + e.message });
  }
});

// 涓炬姤璁ㄨ璇勮
app.post('/api/discussions/comments/:id/report', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.json({ ok: false, msg: '璇峰～鍐欎妇鎶ュ師鍥? });
  }

  const commentId = req.params.id;
  const comments = readDiscussionComments();
  const comment = comments.find(c => c.id === commentId);
  if (!comment) return res.json({ ok: false, msg: '璇勮涓嶅瓨鍦? });

  // 鍘婚噸锛氬悓涓€鐢ㄦ埛鍙兘涓炬姤鍚屼竴鏉¤瘎璁轰竴娆?  const reports = readReports();
  const alreadyReported = reports.some(r => r.targetId === commentId && r.type === 'discussion_comment' && r.reportedBy === session.id);
  if (alreadyReported) {
    return res.json({ ok: false, msg: '鎮ㄥ凡缁忎妇鎶ヨ繃姝よ瘎璁? });
  }

  reports.push({
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: 'discussion_comment',
    targetId: commentId,
    discussionId: comment.discussionId,
    reason: reason.trim(),
    reportedBy: session.id,
    reporterName: session.nickname || '鏈煡',
    createdAt: new Date().toISOString(),
    status: 'pending'
  });
  writeReports(reports);

  // 鏇存柊璇勮涓炬姤璁℃暟
  comment.reportCount = (comment.reportCount || 0) + 1;
  if (comment.reportCount > 20) {
    comment.hidden = true;
  }
  writeDiscussionComments(comments);

  res.json({ ok: true, data: { reportCount: comment.reportCount, hidden: comment.hidden } });
});

// ===== 涓炬姤 API =====

// 鎻愪氦涓炬姤锛堜换鎰忕敤鎴凤紝闇€鐧诲綍 token锛?app.post('/api/posts/:id/report', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });

  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.json({ ok: false, msg: '璇峰～鍐欎妇鎶ュ師鍥? });
  }

  const postId = req.params.id;
  const posts = readPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) return res.json({ ok: false, msg: '甯栧瓙涓嶅瓨鍦? });

  const reports = readReports();

  // 妫€鏌ヨ鐢ㄦ埛鏄惁宸蹭妇鎶ヨ繃姝ゅ笘锛堝瓧娈靛悕鏄?reportedBy锛屼笉鏄?userId锛?  const alreadyReported = reports.some(
    r => r.postId === postId && r.reportedBy === session.id
  );
  if (alreadyReported) {
    return res.json({ ok: false, msg: '鎮ㄥ凡缁忎妇鎶ヨ繃杩欐潯甯栧瓙浜? });
  }

  reports.push({
    id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    postId,
    postContent: (post.content || '').slice(0, 100),
    postAuthor: post.author || '鍖垮悕',
    reportedBy: session.id,
    reporterName: session.nickname || '鏈煡',
    reason: reason.trim(),
    createdAt: new Date().toISOString(),
    status: 'pending' // pending / resolved / ignored
  });

  writeReports(reports);

  // 鏇存柊甯栧瓙鐨勪妇鎶ヨ鏁?  post.reportCount = (post.reportCount || 0) + 1;
  // 涓炬姤鏁?> 20 鑷姩闅愯棌
  if (post.reportCount > 20) {
    post.hidden = true;
  }
  writePosts(posts);

  // 涓炬姤鎴愬姛鍚庣珛鍗冲彂閫?T1 閫氱煡
  try {
    const notices = readNotices();
    notices.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: '馃摦 涓炬姤宸叉敹鍒?,
      content: '浣犱妇鎶ョ殑甯栧瓙锛? + (post.content || '').slice(0, 50) + '...锛夊凡鎻愪氦缁欑鐞嗗憳瀹℃牳銆俓n\n涓炬姤鍘熷洜锛? + reason.trim() + '\n\n鎴戜滑浼氬敖蹇鐞嗭紝鎰熻阿浣犲鏍″洯澧欑幆澧冪殑缁存姢锛?,
      author: '绯荤粺',
      auto: true,
    level: 'T1',
      createdAt: new Date().toISOString(),
      targetUserId: session.id
    });
    writeNotices(notices);
  } catch (e) {
    console.error('鍙戦€佷妇鎶ラ€氱煡澶辫触:', e.message);
  }

  res.json({ ok: true, data: { reportCount: post.reportCount, hidden: !!post.hidden } });
});

// 鑾峰彇涓炬姤鍒楄〃锛堜粎绠＄悊鍛橈紝鏀寔 status 绛涢€夛級
app.get('/api/admin/reports', requireAdmin, (req, res) => {
  const reports = readReports();
  const { status } = req.query;
  const filtered = status ? reports.filter(r => r.status === status) : reports;

  // 鎸夌姸鎬佹帓搴忥細pending 浼樺厛锛屽啀鎸夋椂闂村€掑簭
  filtered.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  res.json({ ok: true, data: filtered });
});

// 鑾峰彇鎵€鏈夎瘎璁猴紙渚涚鐞嗗悗鍙帮級
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

// 澶勭悊涓炬姤锛堟爣璁?resolved / ignored锛屼粎绠＄悊鍛橈級
app.put('/api/admin/reports/:id', requireAdmin, (req, res) => {
  const { status, action } = req.body;
  if (!['resolved', 'ignored'].includes(status)) {
    return res.json({ ok: false, msg: '鐘舵€佹棤鏁? });
  }

  const reports = readReports();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '涓炬姤璁板綍涓嶅瓨鍦? });

  report.status = status;
  report.handledBy = req.admin.id;
  report.handledAt = new Date().toISOString();
  if (action) report.action = action;

  // 濡傛灉 action 鏄?delete_post锛屽悓鏃惰蒋鍒犻櫎琚妇鎶ョ殑甯栧瓙
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
  // 濡傛灉 action 鏄?delete_comment锛屽悓鏃惰蒋鍒犻櫎琚妇鎶ョ殑璇勮
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
  // 濡傛灉 action 鏄?delete_discussion_comment锛屽悓鏃惰蒋鍒犻櫎琚妇鎶ョ殑璁ㄨ鍖鸿瘎璁?  if (action === 'delete_discussion_comment' && report.targetId && report.type === 'discussion_comment') {
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

// ===== 灏佺涓炬姤鍙戦€佽€咃紙绠＄悊鍛橈級=====
app.post('/api/admin/reports/:id/ban-user', requireAdmin, (req, res) => {
  const { banDays } = req.body;
  const days = banDays !== undefined ? parseInt(banDays) : 0;
  if (isNaN(days) || days < 0) return res.json({ ok: false, msg: '澶╂暟鏃犳晥' });

  const reports = readReports();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '涓炬姤璁板綍涓嶅瓨鍦? });

  const targetUserId = report.reportedBy;
  if (!targetUserId) return res.json({ ok: false, msg: '璇ヤ妇鎶ユ病鏈夊叧鑱旂敤鎴凤紙鍖垮悕涓炬姤锛? });

  const users = readUsers();
  const user = users.find(u => u.id === targetUserId);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

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

  // 鍚屾椂鏍囪涓炬姤涓哄凡澶勭悊
  report.status = 'resolved';
  report.handledBy = req.admin.id;
  report.handledAt = new Date().toISOString();
  report.action = 'ban_user';
  writeReports(reports);

  res.json({ ok: true,
    msg: days === 0 ? '宸叉案涔呭皝绂佽鐢ㄦ埛' : '宸插皝绂佽鐢ㄦ埛 ' + days + ' 澶?,
    user: { id: user.id, username: user.username, nickname: user.nickname }
  });
});

// ===== 鍚姩鏃舵竻鐞嗘棫鐨勮蒋鍒犻櫎鏁版嵁锛堣縼绉诲埌 deleted_items 骞朵粠鍘熻〃绉婚櫎锛?====
function cleanupOldDeletedData() {
  var cleaned = 0;

  // 娓呯悊甯栧瓙
  var posts = readPosts();
  var oldDeleted = posts.filter(function(p) { return p.deleted; });
  if (oldDeleted.length > 0) {
    oldDeleted.forEach(function(p) {
      db.addDeletedItem({
        id: p.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: 'post',
        content: typeof p.content === 'string' ? p.content.substring(0, 500) : '',
        author: p.author || '鏈煡',
        userId: p.userId || null,
        deletedAt: p.deletedAt || p.time || new Date().toISOString(),
        deletedBy: p.deletedBy || 'system',
        extra: ''
      });
    });
    posts = posts.filter(function(p) { return !p.deleted; });
    writePosts(posts);
    cleaned += oldDeleted.length;
  }

  // 娓呯悊甯栧瓙鍐呯殑璇勮
  var commentCount = 0;
  posts.forEach(function(post) {
    var oldComments = (post.comments || []).filter(function(c) { return c.deleted; });
    if (oldComments.length > 0) {
      oldComments.forEach(function(c) {
        db.addDeletedItem({
          id: c.id,
          type: 'comment',
          content: typeof c.content === 'string' ? c.content.substring(0, 500) : '',
          author: c.author || '鏈煡',
          userId: c.userId || null,
          deletedAt: c.deletedAt || c.time || new Date().toISOString(),
          deletedBy: c.deletedBy || 'system',
          extra: ''
        });
      });
      post.comments = (post.comments || []).filter(function(c) { return !c.deleted; });
      post.commentsCount = (post.comments || []).length;
      commentCount += oldComments.length;
    }
  });
  if (commentCount > 0) { writePosts(posts); cleaned += commentCount; }

  // 娓呯悊璁ㄨ
  var discussions = readDiscussions();
  var oldDiscussions = discussions.filter(function(d) { return d.deleted; });
  if (oldDiscussions.length > 0) {
    oldDiscussions.forEach(function(d) {
      db.addDeletedItem({
        id: d.id,
        type: 'discussion',
        content: d.title || '',
        author: d.createdBy || '鏈煡',
        userId: d.createdBy || null,
        deletedAt: d.deletedAt || d.createdAt || new Date().toISOString(),
        deletedBy: d.deletedBy || 'system',
        extra: ''
      });
    });
    discussions = discussions.filter(function(d) { return !d.deleted; });
    writeDiscussions(discussions);
    cleaned += oldDiscussions.length;
  }

  // 娓呯悊璁ㄨ璇勮
  var discComments = readDiscussionComments();
  var oldDiscComments = discComments.filter(function(c) { return c.deleted; });
  if (oldDiscComments.length > 0) {
    oldDiscComments.forEach(function(c) {
      db.addDeletedItem({
        id: c.id,
        type: 'disc_comment',
        content: typeof c.content === 'string' ? c.content.substring(0, 500) : '',
        author: c.author || '鏈煡',
        userId: c.userId || null,
        deletedAt: c.deletedAt || c.createdAt || new Date().toISOString(),
        deletedBy: c.deletedBy || 'system',
        extra: ''
      });
    });
    discComments = discComments.filter(function(c) { return !c.deleted; });
    writeDiscussionComments(discComments);
    cleaned += oldDiscComments.length;
  }

  if (cleaned > 0) {
    console.log('[cleanup] 鉁?宸茶縼绉?' + cleaned + ' 鏉℃棫杞垹闄ゆ暟鎹埌 deleted_items 琛?);
  }
}

// ===== 鍒犻櫎甯栧瓙鏃跺悓姝ュ垹闄ゅ叧鑱旂殑璁ㄨ璇勮 =====
function deleteSyncedDiscComment(postId) {
  try {
    var comments = readDiscussionComments();
    var matched = comments.filter(function(c) { return c.syncPostId === postId; });
    if (matched.length > 0) {
      matched.forEach(function(c) { saveDeletedItem('disc_comment', c, 'system'); });
      comments = comments.filter(function(c) { return c.syncPostId !== postId; });
      writeDiscussionComments(comments);
    }
  } catch(e) { console.warn('[delete] deleteSyncedDiscComment failed:', e.message); }
}

// ===== 宸插垹闄ゅ唴瀹硅褰曡緟鍔╁嚱鏁?=====
function saveDeletedItem(type, item, deletedBy, extra) {
  db.addDeletedItem({
    id: item.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: type,
    content: typeof item.content === 'string' ? item.content.substring(0, 500) : '',
    author: item.author || item.nickname || item.createdBy || '鏈煡',
    userId: item.userId || item.createdBy || null,
    deletedAt: new Date().toISOString(),
    deletedBy: deletedBy,
    extra: extra || ''
  });
}

// ===== 绠＄悊绔細鏌ョ湅宸插垹闄ゅ唴瀹?=====
app.get('/api/admin/deleted-content', requireAdmin, (req, res) => {
  const items = db.readDeletedItems();
  const posts = items.filter(i => i.type === 'post');
  const comments = items.filter(i => i.type === 'comment');
  const discussions = items.filter(i => i.type === 'discussion');
  const discComments = items.filter(i => i.type === 'disc_comment');
  res.json({
    ok: true,
    data: {
      posts: posts.reverse(),
      postComments: comments.reverse(),
      discussions: discussions.reverse(),
      discussionComments: discComments.reverse()
    }
  });
});

// ===== 骞冲彴闇稿噷涓炬姤 =====
// ===== 鍦ㄧ嚎鐢ㄦ埛缁熻 =====
const onlineUsers = new Map(); // userId -> lastHeartbeat (timestamp)
const ONLINE_TIMEOUT = 120000; // 2 鍒嗛挓鏃犲績璺宠涓虹绾?
// 蹇冭烦鎺ュ彛锛堢敤鎴风櫥褰曞悗瀹氭椂璋冪敤锛?app.post('/api/user/heartbeat', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) { onlineUsers.set('anon_' + getClientIP(req), Date.now()); return res.json({ ok: true }); }
  const session = verifyUserToken(token);
  if (!session || !session.id) { onlineUsers.set('anon_' + getClientIP(req), Date.now()); return res.json({ ok: true }); }
  onlineUsers.set(session.id, Date.now());
  res.json({ ok: true });
});

// 缁熻鎺ュ彛锛堝惈浠婃棩甯栨暟銆佸湪绾夸汉鏁帮級
app.get('/api/stats', (req, res) => {
  // 娓呯悊杩囨湡
  const now = Date.now();
  for (const [id, ts] of onlineUsers) {
    if (now - ts > ONLINE_TIMEOUT) onlineUsers.delete(id);
  }
  // 浠婃棩甯栨暟
  const posts = readPosts();
  const today = new Date().toISOString().slice(0, 10);
  const todayPosts = posts.filter(p => p.time && p.time.startsWith(today)).length;
  res.json({ ok: true, data: { todayPosts, onlineCount: onlineUsers.size } });
});

// 鐗堟湰鍙锋帴鍙ｏ紙杩斿洖鏈湴 git 鍝堝笇锛?app.get('/api/version', (req, res) => {
  res.json({ ok: true, data: { sha: cachedGitSha, message: cachedCommitMsg } });
});

// 姣忓垎閽熸竻鐞嗕竴娆¤繃鏈熷績璺?setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of onlineUsers) {
    if (now - ts > ONLINE_TIMEOUT) onlineUsers.delete(id);
  }
}, 60000);

// ===== 鍚姩 =====

// ===== 鐢ㄦ埛鍙嶉鎻愪氦 =====
app.post('/api/feedback', (req, res) => {
  const { type, description, contact, images } = req.body;
  if (!type || !description) return res.json({ ok: false, msg: '绫诲瀷鍜屾弿杩颁笉鑳戒负绌? });
  if (description.length < 10) return res.json({ ok: false, msg: '鎻忚堪鑷冲皯10涓瓧' });
  if (description.length > 500) return res.json({ ok: false, msg: '鎻忚堪鏈€澶?00瀛? });

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

// ===== 闇稿噷浜嬩欢鎶ュ憡鎻愪氦 =====
app.post('/api/bullying-report', (req, res) => {
  const { reporterRole, victimName, bullyType, description, involved, location, time, contact, anonymous, images } = req.body;
  if (!reporterRole || !['self', 'witness'].includes(reporterRole)) return res.json({ ok: false, msg: '璇烽€夋嫨鎮ㄧ殑韬唤' });
  if (!bullyType || !description) return res.json({ ok: false, msg: '闇稿噷绫诲瀷鍜屾弿杩颁笉鑳戒负绌? });
  if (description.length < 20) return res.json({ ok: false, msg: '鎻忚堪鑷冲皯20涓瓧' });
  if (description.length > 1000) return res.json({ ok: false, msg: '鎻忚堪鏈€澶?000瀛? });
  if (!anonymous && !contact) return res.json({ ok: false, msg: '瀹炲悕鎻愪氦蹇呴』濉啓鑱旂郴鏂瑰紡' });

  // 灏濊瘯鑾峰彇鎻愪氦鑰?userId
  let reporterUserId = null;
  try {
    const token = req.headers['x-user-token'];
    if (token) {
      const session = verifyUserToken(token);
      if (session) reporterUserId = session.id;
    }
  } catch (e) {}

  const reports = readBullying();

  // 鑷垜涓炬姤 鈫?鑷姩灏嗗彈瀹宠€呭鍚嶅姞鍏ヤ繚鎶ゅ悕鍗?  if (reporterRole === 'self' && victimName) {
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
    userId: reporterUserId // 瀛樺偍鎻愪氦鑰?userId
  };
  reports.unshift(newReport);
  writeBullying(reports);

  // 鍙戦€?T1 閫氱煡
  if (reporterUserId) {
    try {
      const notices = readNotices();
      notices.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: '馃洝锔?闇稿噷涓炬姤宸叉敹鍒?,
        content: '浣犵殑闇稿噷浜嬩欢鎶ュ憡宸叉彁浜ょ粰绠＄悊鍛樺鏍搞€俓n\n鎴戜滑灏嗗敖蹇牳瀹炲苟澶勭悊锛岃淇濇寔鑱旂郴鏂瑰紡鐣呴€氥€俓n\n鎰熻阿浣犲鏍″洯瀹夊叏鐨勫叧娉紒',
        author: '绯荤粺',
        auto: true,
    level: 'T1',
        auto: true,
        createdAt: new Date().toISOString(),
      targetUserId: reporterUserId
      });
      writeNotices(notices);
    } catch (e) {
      console.error('鍙戦€侀湼鍑屼妇鎶ラ€氱煡澶辫触:', e.message);
    }
  }

  res.json({ ok: true, data: { id: newReport.id } });
});

// ===== 鑾峰彇闇稿噷鎶ュ憡鍒楄〃锛堢鐞嗗憳锛?====
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

// ===== 澶勭悊闇稿噷鎶ュ憡锛堢鐞嗗憳锛?====
app.post('/api/admin/bullying/:id', requireAdmin, (req, res) => {
  const { status, handleNote } = req.body;
  if (!status || !['pending','processing','resolved'].includes(status)) {
    return res.json({ ok: false, msg: '鏃犳晥鐨勭姸鎬? });
  }
  const reports = readBullying();
  const idx = reports.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '鎶ュ憡涓嶅瓨鍦? });
  reports[idx].status = status;
  reports[idx].handleNote = handleNote || '';
  reports[idx].handledBy = req.admin.name || req.admin.id;
  reports[idx].handledAt = new Date().toISOString();
  writeBullying(reports);

  // 纭纭湁闇稿噷锛坮esolved锛夆啋 鍙戦€?T0 閫氱煡
  if (status === 'resolved' && reports[idx].userId) {
    try {
      const notices = readNotices();
      notices.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: '馃洝锔?闇稿噷涓炬姤宸茬‘璁ゅ鐞?,
        content: '浣犳彁浜ょ殑闇稿噷浜嬩欢鎶ュ憡缁忕鐞嗗憳鏍稿疄宸茬‘璁わ紝鐩稿叧澶勭悊姝ｅ湪杩涜涓€俓n\n澶勭悊澶囨敞锛? + (handleNote || '鏃?) + '\n\n濡傛儏鍐典粛鏈敼鍠勶紝璇烽噸鏂版彁浜ゆ姤鍛婃垨鑱旂郴瀛︽牎鐩稿叧閮ㄩ棬銆?,
        author: '绯荤粺',
        auto: true,
    level: 'T0',
        createdAt: new Date().toISOString(),
      targetUserId: reports[idx].userId
      });
      writeNotices(notices);
    } catch (e) {
      console.error('鍙戦€侀湼鍑屽鐞嗛€氱煡澶辫触:', e.message);
    }
  }

  res.json({ ok: true });
});

// ===== 鑾峰彇鍗曟潯闇稿噷鎶ュ憡璇︽儏锛堢鐞嗗憳锛?====
app.get('/api/admin/bullying/:id', requireAdmin, (req, res) => {
  const reports = readBullying();
  const report = reports.find(r => r.id === req.params.id);
  if (!report) return res.json({ ok: false, msg: '鎶ュ憡涓嶅瓨鍦? });
  res.json({ ok: true, data: report });
});

// ===== 鑾峰彇鍙嶉鍒楄〃锛堢鐞嗗憳锛?====
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

// ===== 鑾峰彇鍗曟潯鍙嶉璇︽儏锛堢鐞嗗憳锛?====
app.get('/api/admin/feedback/:id', requireAdmin, (req, res) => {
  const feedbacks = readFeedbacks();
  const f = feedbacks.find(x => x.id === req.params.id);
  if (!f) return res.json({ ok: false, msg: '鍙嶉涓嶅瓨鍦? });
  res.json({ ok: true, data: f });
});

// ===== 澶勭悊鍙嶉锛堢鐞嗗憳锛?====
app.post('/api/admin/feedback/:id/handle', requireAdmin, (req, res) => {
  const { status, note } = req.body;
  if (!status || !['pending', 'resolved', 'rejected'].includes(status)) {
    return res.json({ ok: false, msg: '鐘舵€佹棤鏁? });
  }
  const feedbacks = readFeedbacks();
  const idx = feedbacks.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '鍙嶉涓嶅瓨鍦? });
  feedbacks[idx].status = status;
  feedbacks[idx].handledBy = req.admin.id;
  feedbacks[idx].handledAt = new Date().toISOString();
  feedbacks[idx].handleNote = note || '';
  writeFeedbacks(feedbacks);
  res.json({ ok: true });
});

// ===== 杩濈璇嶇鐞嗭紙绠＄悊鍛橈級=====
const SENSITIVE_CUSTOM_FILE = require('./sensitiveWords').CUSTOM_FILE;

// 鑾峰彇杩濈璇嶅垪琛?app.get('/api/admin/sensitive-words', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      return res.json({ ok: true, data: [] });
    }
    const words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    res.json({ ok: true, data: Array.isArray(words) ? words : [] });
  } catch (e) {
    res.json({ ok: false, msg: '璇诲彇澶辫触: ' + e.message });
  }
});

// 娣诲姞杩濈璇?app.post('/api/admin/sensitive-words', requireAdmin, (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') return res.json({ ok: false, msg: '璇疯緭鍏ユ湁鏁堣瘝璇? });
    const trimmed = word.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '璇嶈涓嶈兘涓虹┖' });
    if (trimmed.length > 50) return res.json({ ok: false, msg: '璇嶈澶暱锛屾渶澶?0瀛? });

    let words = [];
    if (fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    }
    if (!Array.isArray(words)) words = [];

    if (words.includes(trimmed)) return res.json({ ok: false, msg: '璇ヨ繚绂佽瘝宸插瓨鍦? });

    words.push(trimmed);
    fs.writeFileSync(SENSITIVE_CUSTOM_FILE, JSON.stringify(words, null, 2), 'utf-8');
    reloadSensitive(); // 閲嶆柊鍔犺浇璇嶅簱

    res.json({ ok: true, data: words });
  } catch (e) {
    res.json({ ok: false, msg: '娣诲姞澶辫触: ' + e.message });
  }
});

// 鍒犻櫎杩濈璇?app.delete('/api/admin/sensitive-words/:word', requireAdmin, (req, res) => {
  try {
    const word = decodeURIComponent(req.params.word);
    if (!fs.existsSync(SENSITIVE_CUSTOM_FILE)) {
      return res.json({ ok: false, msg: '娌℃湁鑷畾涔夎繚绂佽瘝' });
    }
    let words = JSON.parse(fs.readFileSync(SENSITIVE_CUSTOM_FILE, 'utf-8'));
    if (!Array.isArray(words)) words = [];

    const idx = words.indexOf(word);
    if (idx === -1) return res.json({ ok: false, msg: '鏈壘鍒拌杩濈璇? });

    words.splice(idx, 1);
    fs.writeFileSync(SENSITIVE_CUSTOM_FILE, JSON.stringify(words, null, 2), 'utf-8');
    reloadSensitive();

    res.json({ ok: true, data: words });
  } catch (e) {
    res.json({ ok: false, msg: '鍒犻櫎澶辫触: ' + e.message });
  }
});

// 鑾峰彇杩濈璇嶇粺璁?app.get('/api/admin/sensitive-stats', requireAdmin, (req, res) => {
  try {
    const stats = getSensitiveStats();
    res.json({ ok: true, data: stats });
  } catch (e) {
    res.json({ ok: false, msg: '鑾峰彇缁熻澶辫触: ' + e.message });
  }
});

// ===== 鏁忔劅璇嶇櫧鍚嶅崟绠＄悊锛堢鐞嗗憳锛?====

// 鑾峰彇鐧藉悕鍗曞垪琛?app.get('/api/admin/sensitive-whitelist', requireAdmin, (req, res) => {
  try {
    if (!fs.existsSync(WHITELIST_FILE)) return res.json({ ok: true, data: [] });
    const list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
    res.json({ ok: true, data: Array.isArray(list) ? list : [] });
  } catch (e) {
    res.json({ ok: false, msg: '璇诲彇鐧藉悕鍗曞け璐? ' + e.message });
  }
});

// 娣诲姞鐧藉悕鍗?app.post('/api/admin/sensitive-whitelist', requireAdmin, (req, res) => {
  try {
    const { word } = req.body;
    if (!word || typeof word !== 'string') return res.json({ ok: false, msg: '璇疯緭鍏ユ湁鏁堣瘝璇? });
    const trimmed = word.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '璇嶈涓嶈兘涓虹┖' });
    if (trimmed.length > 50) return res.json({ ok: false, msg: '璇嶈澶暱锛屾渶澶?0瀛? });

    let list = [];
    if (fs.existsSync(WHITELIST_FILE)) list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
    if (!Array.isArray(list)) list = [];

    if (list.includes(trimmed)) return res.json({ ok: false, msg: '璇ヨ瘝宸插湪鐧藉悕鍗曚腑' });

    list.push(trimmed);
    saveWhitelist(list);
    reloadSensitive();

    res.json({ ok: true, data: list });
  } catch (e) {
    res.json({ ok: false, msg: '娣诲姞澶辫触: ' + e.message });
  }
});

// 鍒犻櫎鐧藉悕鍗?app.delete('/api/admin/sensitive-whitelist/:word', requireAdmin, (req, res) => {
  try {
    const word = decodeURIComponent(req.params.word);
    if (!fs.existsSync(WHITELIST_FILE)) return res.json({ ok: false, msg: '鐧藉悕鍗曚负绌? });
    let list = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
    if (!Array.isArray(list)) list = [];

    const idx = list.indexOf(word);
    if (idx === -1) return res.json({ ok: false, msg: '鏈壘鍒拌鐧藉悕鍗曡瘝' });

    list.splice(idx, 1);
    saveWhitelist(list);
    reloadSensitive();

    res.json({ ok: true, data: list });
  } catch (e) {
    res.json({ ok: false, msg: '鍒犻櫎澶辫触: ' + e.message });
  }
});

// ===== 闇稿噷鐘舵€佺鐞嗭紙绠＄悊鍛橈級=====

// 鑾峰彇淇濇姢濮撳悕鍒楄〃
app.get('/api/admin/bullying-names', requireAdmin, (req, res) => {
  try {
    const names = getAllBullyingNames();
    res.json({ ok: true, data: names });
  } catch (e) {
    res.json({ ok: false, msg: '璇诲彇澶辫触: ' + e.message });
  }
});

// 鎵嬪姩娣诲姞淇濇姢濮撳悕
app.post('/api/admin/bullying-names', requireAdmin, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string') return res.json({ ok: false, msg: '璇疯緭鍏ユ湁鏁堝鍚? });
    const trimmed = name.trim();
    if (trimmed.length === 0) return res.json({ ok: false, msg: '濮撳悕涓嶈兘涓虹┖' });
    if (trimmed.length > 30) return res.json({ ok: false, msg: '濮撳悕澶暱锛屾渶澶?0瀛? });

    if (addBullyingName(trimmed)) {
      res.json({ ok: true, msg: '娣诲姞鎴愬姛' });
    } else {
      res.json({ ok: false, msg: '璇ュ鍚嶅凡鍦ㄤ繚鎶ゅ悕鍗曚腑' });
    }
  } catch (e) {
    res.json({ ok: false, msg: '娣诲姞澶辫触: ' + e.message });
  }
});

// 鍒犻櫎淇濇姢濮撳悕
app.delete('/api/admin/bullying-names/:name', requireAdmin, (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    if (removeBullyingName(name)) {
      res.json({ ok: true, msg: '鍒犻櫎鎴愬姛' });
    } else {
      res.json({ ok: false, msg: '鏈壘鍒拌濮撳悕' });
    }
  } catch (e) {
    res.json({ ok: false, msg: '鍒犻櫎澶辫触: ' + e.message });
  }
});

// ===== Q&A 闂瓟绯荤粺 =====
function readQAQuestions () { return db.readQAQuestions(); }
function writeQAQuestions (data) { db.writeQAQuestions(data); }
function readQAAnswers () { return db.readQAAnswers(); }
function writeQAAnswers (data) { db.writeQAAnswers(data); }

// 缁欑敤鎴峰彉鏇?credit 骞惰褰曟祦姘?function changeCredit(userId, amount, reason) {
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

// 缁撶畻鍒版湡闂
function settleExpiredQuestions() {
  const questions = readQAQuestions();
  const answers = readQAAnswers();
  const now = new Date();
  let changed = false;
  for (const q of questions) {
    if (q.status !== 'open') continue;
    if (!q.deadline) continue;
    if (new Date(q.deadline) > now) continue;
    // 鍒版湡锛屾壘姝ら棶棰樼殑鎵€鏈夊洖绛旓紝鎸夎禐鏁板垎閰?    q.status = 'expired';
    changed = true;
    const qAnswers = answers.filter(a => a.questionId === q.id && !a.deleted);
    const totalLikes = qAnswers.reduce((s, a) => s + (a.likes || 0), 0);
    const bounty = q.bounty || 0;
    if (bounty > 0 && qAnswers.length > 0) {
      if (totalLikes === 0) {
        // 鏃犱汉鐐硅禐鍒欏钩鍒?        const share = Math.floor(bounty / qAnswers.length);
        for (const a of qAnswers) {
          if (share > 0) changeCredit(a.userId, share, '闂銆? + q.title.slice(0, 10) + '...銆嶈禐鏁板潎鍒嗘偓璧?);
        }
      } else {
        let distributed = 0;
        for (const a of qAnswers) {
          const share = Math.floor(bounty * (a.likes || 0) / totalLikes);
          if (share > 0) {
            changeCredit(a.userId, share, '闂銆? + q.title.slice(0, 10) + '...銆嶈禐鏁板垎閰嶆偓璧?);
            distributed += share;
          }
        }
        // 浣欐暟缁欒禐鏈€澶氱殑
        const remainder = bounty - distributed;
        if (remainder > 0) {
          const top = qAnswers.sort((a, b) => (b.likes || 0) - (a.likes || 0))[0];
          changeCredit(top.userId, remainder, '闂鎮祻浣欐暟濂栧姳');
        }
      }
    }
  }
  if (changed) writeQAQuestions(questions);
}

// 瀹氭椂姣忓垎閽熸鏌ュ埌鏈熼棶棰?setInterval(settleExpiredQuestions, 60 * 1000);

// 鑾峰彇闂鍒楄〃
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

// 鑾峰彇鎴戠殑鎻愰棶
app.get('/api/qa/my-questions', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰? });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });

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

// 鑾峰彇鍗曚釜闂璇︽儏锛堝惈鍥炵瓟锛?app.get('/api/qa/questions/:id', (req, res) => {
  settleExpiredQuestions();
  const questions = readQAQuestions();
  const q = questions.find(x => x.id === req.params.id && !x.deleted);
  if (!q) return res.json({ ok: false, msg: '闂涓嶅瓨鍦? });
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

// 鍙戝竷闂
app.post('/api/qa/questions', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '鏈櫥褰? }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  const { title, content, bounty = 0, images = [], sensitiveForce = false } = req.body;
  if (!title || title.trim().length < 2) return res.json({ ok: false, msg: '鏍囬鑷冲皯2涓瓧' });
  if (title.trim().length > 100) return res.json({ ok: false, msg: '鏍囬鏈€澶?00涓瓧' });
  if ((content || '').length > 2000) return res.json({ ok: false, msg: '鍐呭鏈€澶?000涓瓧' });
  const b = Math.floor(Number(bounty) || 0);
  if (b < 0) return res.json({ ok: false, msg: '鎮祻涓嶈兘涓鸿礋鏁? });
  if (!Number.isInteger(b)) return res.json({ ok: false, msg: '鎮祻蹇呴』涓烘暣鏁? });
  if (images.length > 3) return res.json({ ok: false, msg: '鏈€澶氫笂浼?寮犲浘鐗? });

  // 鏁忔劅璇嶆娴?  const checkText = (title.trim() + ' ' + (content || '')).trim();
  const sensitiveWords = checkSensitive(checkText);
  if (sensitiveWords.length > 0 && !sensitiveForce) {
    return res.json({ ok: false, warning: true, warningMsg: '鍐呭鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀瑰悗閲嶈瘯' });
  }
  // 闇稿噷淇濇姢濮撳悕妫€娴嬶紙濮嬬粓闃绘锛?  const blockedNames = checkBullyingNames(checkText);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€? });
  }

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if ((user.credit || 0) < b) return res.json({ ok: false, msg: 'Credits涓嶈冻锛屽綋鍓嶄綑棰濓細' + (user.credit || 0) });

  // 鎵ｉ櫎鎮祻 credits
  if (b > 0) {
    user.credit = (user.credit || 0) - b;
    writeUsers(users);
    const logs = readCreditLogs();
    logs.push({
      id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: session.id,
      amount: -b,
      reason: '鍙戝竷闂鎮祻锛? + title.slice(0, 20),
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
    distributedCredits: 0,  // 宸插彂鏀剧殑鎮祻鎬婚
    createdAt: new Date().toISOString(),
    deleted: false
  };
  questions.push(q);
  writeQAQuestions(questions);
  res.json({ ok: true, data: q });
});

// 鍥炵瓟闂
app.post('/api/qa/questions/:id/answers', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '鏈櫥褰? }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  const { content, images = [], sensitiveForce = false } = req.body;
  if (!content || content.trim().length < 2) return res.json({ ok: false, msg: '鍥炵瓟鑷冲皯2涓瓧' });
  if (content.length > 2000) return res.json({ ok: false, msg: '鍥炵瓟鏈€澶?000瀛? });
  if (images.length > 3) return res.json({ ok: false, msg: '鏈€澶氫笂浼?寮犲浘鐗? });

  // 鏁忔劅璇嶆娴?  const sensitiveWords = checkSensitive(content);
  if (sensitiveWords.length > 0 && !sensitiveForce) {
    return res.json({ ok: false, warning: true, warningMsg: '鍐呭鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀瑰悗閲嶈瘯' });
  }
  // 闇稿噷淇濇姢濮撳悕妫€娴嬶紙濮嬬粓闃绘锛?  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€? });
  }

  const questions = readQAQuestions();
  const q = questions.find(x => x.id === req.params.id && !x.deleted);
  if (!q) return res.json({ ok: false, msg: '闂涓嶅瓨鍦? });
  if (q.status !== 'open') return res.json({ ok: false, msg: '璇ラ棶棰樺凡鍏抽棴' });

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });

  // 涓嶅厑璁歌嚜绛?  if (q.userId === session.id) return res.json({ ok: false, msg: '涓嶈兘鍥炵瓟鑷繁鐨勯棶棰? });

  const answers = readQAAnswers();
  // 姣忎汉鍙兘鍥炵瓟涓€娆?  if (answers.find(a => a.questionId === q.id && a.userId === session.id && !a.deleted)) {
    return res.json({ ok: false, msg: '浣犲凡鍥炵瓟杩囨闂' });
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
    reward: 0,  // 鑾峰緱鐨勬偓璧廋redits
    createdAt: new Date().toISOString(),
    deleted: false
  };
  answers.push(a);
  writeQAAnswers(answers);
  res.json({ ok: true, data: a });
});

// 鐐硅禐鍥炵瓟
app.post('/api/qa/answers/:id/like', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '鏈櫥褰? }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  const answers = readQAAnswers();
  const idx = answers.findIndex(a => a.id === req.params.id && !a.deleted);
  if (idx === -1) return res.json({ ok: false, msg: '鍥炵瓟涓嶅瓨鍦? });
  const a = answers[idx];
  if (a.userId === session.id) return res.json({ ok: false, msg: '涓嶈兘缁欒嚜宸辩殑鍥炵瓟鐐硅禐' });
  const likedBy = a.likedBy || [];
  if (likedBy.includes(session.id)) {
    // 鍙栨秷鐐硅禐
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

// 閲囩撼鍥炵瓟锛堟彁闂€呬笓鐢級
app.post('/api/qa/questions/:qid/accept/:aid', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '鏈櫥褰? }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  const questions = readQAQuestions();
  const qIdx = questions.findIndex(x => x.id === req.params.qid && !x.deleted);
  if (qIdx === -1) return res.json({ ok: false, msg: '闂涓嶅瓨鍦? });
  const q = questions[qIdx];
  if (q.userId !== session.id) return res.json({ ok: false, msg: '鍙湁鎻愰棶鑰呭彲浠ラ噰绾崇瓟妗? });
  if (q.status !== 'open') return res.json({ ok: false, msg: '璇ラ棶棰樺凡鍏抽棴' });

  const answers = readQAAnswers();
  const aIdx = answers.findIndex(a => a.id === req.params.aid && a.questionId === q.id && !a.deleted);
  if (aIdx === -1) return res.json({ ok: false, msg: '鍥炵瓟涓嶅瓨鍦? });

  // 娓呴櫎鏃ч噰绾?  answers.forEach(a => { if (a.questionId === q.id) a.accepted = false; });
  answers[aIdx].accepted = true;
  q.status = 'accepted';
  q.acceptedAnswerId = req.params.aid;
  // 濂栧姳鎮祻 credits
  if (q.bounty > 0) {
    const remaining = q.bounty - (q.distributedCredits || 0);
    if (remaining > 0) {
      changeCredit(answers[aIdx].userId, remaining, '闂銆? + q.title.slice(0, 20) + '銆嶈閲囩撼濂栧姳');
      answers[aIdx].reward = (answers[aIdx].reward || 0) + remaining;
      q.distributedCredits = (q.distributedCredits || 0) + remaining;
    }
  }
  writeQAQuestions(questions);
  writeQAAnswers(answers);
  res.json({ ok: true });
});

// 鍙戞斁鎮祻锛堟彁闂€呭悜澶氫釜鍥炵瓟鍒嗛厤 Credits锛?app.post('/api/qa/questions/:id/reward', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '鏈櫥褰? }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  const { rewards } = req.body; // [{ answerId, amount }]
  if (!Array.isArray(rewards) || rewards.length === 0) return res.json({ ok: false, msg: '璇疯嚦灏戦€夋嫨涓€涓洖绛? });

  const questions = readQAQuestions();
  const qIdx = questions.findIndex(x => x.id === req.params.id && !x.deleted);
  if (qIdx === -1) return res.json({ ok: false, msg: '闂涓嶅瓨鍦? });
  const q = questions[qIdx];
  if (q.userId !== session.id) return res.json({ ok: false, msg: '鍙湁鎻愰棶鑰呭彲浠ュ彂鏀惧鍔? });
  if (!q.bounty || q.bounty <= 0) return res.json({ ok: false, msg: '璇ラ棶棰樻湭鎮祻Credits' });
  if (q.status === 'expired') return res.json({ ok: false, msg: '璇ラ棶棰樺凡鍒版湡' });

  const remaining = q.bounty - (q.distributedCredits || 0);
  if (remaining <= 0) return res.json({ ok: false, msg: '鎮祻宸插叏閮ㄥ彂鏀惧畬姣? });

  // 鏍￠獙鎬诲拰
  const total = rewards.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (total <= 0) return res.json({ ok: false, msg: '鍙戞斁閲戦涓嶈兘涓?' });
  if (total > remaining) return res.json({ ok: false, msg: '鍙戞斁鎬婚瓒呭嚭鍓╀綑鎮祻锛堝墿浣?' + remaining + ' Credits锛? });

  const answers = readQAAnswers();
  for (const r of rewards) {
    const amount = Math.floor(Number(r.amount) || 0);
    if (amount <= 0) continue;
    const aIdx = answers.findIndex(a => a.id === r.answerId && a.questionId === q.id && !a.deleted);
    if (aIdx === -1) continue;
    changeCredit(answers[aIdx].userId, amount, '闂銆? + q.title.slice(0, 20) + '銆嶆偓璧忓彂鏀?);
    answers[aIdx].reward = (answers[aIdx].reward || 0) + amount;
  }
  q.distributedCredits = (q.distributedCredits || 0) + total;
  writeQAQuestions(questions);
  writeQAAnswers(answers);
  res.json({ ok: true, distributed: total, remaining: q.bounty - q.distributedCredits });
});

// 鍒犻櫎闂锛堟湰浜烘垨绠＄悊鍛橈級
app.delete('/api/qa/questions/:id', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '鏈櫥褰? }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  const questions = readQAQuestions();
  const idx = questions.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '闂涓嶅瓨鍦? });
  if (questions[idx].userId !== session.id) return res.json({ ok: false, msg: '鏃犳潈鍒犻櫎' });
  if (questions[idx].status !== 'closed' && questions[idx].bounty > 0) {
    // 閫€杩樻湭鍙戞斁鐨勬偓璧?    const remain = Math.max(0, questions[idx].bounty - (questions[idx].distributedCredits || 0));
    if (remain > 0) changeCredit(session.id, remain, '鍒犻櫎闂閫€杩樺墿浣欐偓璧?);
  }
  questions[idx].deleted = true;
  writeQAQuestions(questions);
  res.json({ ok: true });
});

// 鍒犻櫎鍥炵瓟锛堟湰浜猴級
app.delete('/api/qa/answers/:id', (req, res) => {
  const _qaToken = req.headers['x-user-token']; if (!_qaToken) return res.json({ ok: false, msg: '鏈櫥褰? }); const session = verifyUserToken(_qaToken); if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  const answers = readQAAnswers();
  const idx = answers.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '鍥炵瓟涓嶅瓨鍦? });
  if (answers[idx].userId !== session.id) return res.json({ ok: false, msg: '鏃犳潈鍒犻櫎' });
  answers[idx].deleted = true;
  writeQAAnswers(answers);
  res.json({ ok: true });
});

// 绠＄悊鍛樿幏鍙栭棶棰樺垪琛?app.get('/api/admin/qa/questions', requireAdmin, (req, res) => {
  const questions = readQAQuestions();
  const answers = readQAAnswers();
  const list = questions.filter(q => !q.deleted).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: list.map(q => ({ ...q, answerCount: answers.filter(a => a.questionId === q.id && !a.deleted).length })) });
});

// 绠＄悊鍛樺垹闄ら棶棰?app.delete('/api/admin/qa/questions/:id', requireAdmin, (req, res) => {
  const questions = readQAQuestions();
  const idx = questions.findIndex(q => q.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '闂涓嶅瓨鍦? });
  if (questions[idx].status === 'open' && questions[idx].bounty > 0) {
    changeCredit(questions[idx].userId, questions[idx].bounty, '绠＄悊鍛樺垹闄ら棶棰橀€€杩樻偓璧?);
  }
  questions[idx].deleted = true;
  writeQAQuestions(questions);
  res.json({ ok: true });
});

// 绠＄悊鍛樺垹闄ゅ洖绛?app.delete('/api/admin/qa/answers/:id', requireAdmin, (req, res) => {
  const answers = readQAAnswers();
  const idx = answers.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '鍥炵瓟涓嶅瓨鍦? });
  answers[idx].deleted = true;
  writeQAAnswers(answers);
  res.json({ ok: true });
});

// ===== 鎶曠エ鍔熻兘 =====
// 鑾峰彇鎶曠エ鍒楄〃锛堟寜鏃堕棿鍊掑簭锛屽彲閫夊寘鍚凡鎶曠エ淇℃伅锛?app.get('/api/votes', (req, res) => {
  const votes = readVotes();
  const records = readVoteRecords();

  const token = req.headers['x-user-token'];
  let session = null;
  if (token) {
    try { session = verifyUserToken(token); } catch (e) { session = null; }
  }

  const list = votes
    .filter(v => !v.deleted)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(v => {
      const totalVotes = v.options.reduce((s, opt) => s + (opt.votes || 0), 0);
      const userVoted = session
        ? records.filter(r => r.voteId === v.id && r.userId === session.id).map(r => r.optionId)
        : [];
      return { ...v, totalVotes, userVoted };
    });

  res.json({ ok: true, data: list });
});

// 鍒涘缓鎶曠エ锛堥渶瑕佺鐞嗗憳鏉冮檺锛?app.post('/api/votes', requireAdmin, (req, res) => {
  const admin = req.admin;
  const { title, options, multiple = false, allowCustom = false, endTime = null, sensitiveForce = false } = req.body;

  if (!title || title.trim().length < 2) return res.json({ ok: false, msg: '鏍囬鑷冲皯2涓瓧' });
  if (title.trim().length > 100) return res.json({ ok: false, msg: '鏍囬鏈€澶?00涓瓧' });
  if (!options || !Array.isArray(options) || options.length < 2) return res.json({ ok: false, msg: '鑷冲皯闇€瑕?涓€夐」' });
  if (options.length > 20) return res.json({ ok: false, msg: '鏈€澶?0涓€夐」' });
  for (const opt of options) {
    if (!opt || typeof opt !== 'string' || !opt.trim()) return res.json({ ok: false, msg: '閫夐」涓嶈兘涓虹┖' });
    if (opt.trim().length > 100) return res.json({ ok: false, msg: '閫夐」鏈€澶?00涓瓧' });
  }

  // 鏁忔劅璇嶆娴?  const checkText = (title.trim() + ' ' + options.join(' ')).trim();
  const sensitiveWords = checkSensitive(checkText);
  if (sensitiveWords.length > 0 && !sensitiveForce) {
    return res.json({ ok: false, warning: true, warningMsg: '鍐呭鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀瑰悗閲嶈瘯' });
  }
  const blockedNames = checkBullyingNames(checkText);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€? });
  }

  const votes = readVotes();
  const newVote = {
    id: 'vote_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: 'admin:' + admin.id,
    author: '绠＄悊鍛?,
    avatar: '',
    title: title.trim(),
    options: options.map((text, idx) => ({
      id: 'opt_' + idx + '_' + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      votes: 0
    })),
    multiple: !!multiple,
    allowCustom: !!allowCustom,
    endTime: endTime || null,
    createdAt: new Date().toISOString(),
    deleted: false
  };

  votes.push(newVote);
  writeVotes(votes);
  res.json({ ok: true, data: newVote });
});

// 绠＄悊鍛樺垱寤烘姇绁紙涓?/api/votes 绛変环锛屼繚鐣欑粺涓€绠＄悊鍛樿矾寰勶級
app.post('/api/admin/votes', requireAdmin, (req, res) => {
  const admin = req.admin;
  const { title, options, multiple = false, allowCustom = false, endTime = null, sensitiveForce = false } = req.body;

  if (!title || title.trim().length < 2) return res.json({ ok: false, msg: '鏍囬鑷冲皯2涓瓧' });
  if (title.trim().length > 100) return res.json({ ok: false, msg: '鏍囬鏈€澶?00涓瓧' });
  if (!options || !Array.isArray(options) || options.length < 2) return res.json({ ok: false, msg: '鑷冲皯闇€瑕?涓€夐」' });
  if (options.length > 20) return res.json({ ok: false, msg: '鏈€澶?0涓€夐」' });
  for (const opt of options) {
    if (!opt || typeof opt !== 'string' || !opt.trim()) return res.json({ ok: false, msg: '閫夐」涓嶈兘涓虹┖' });
    if (opt.trim().length > 100) return res.json({ ok: false, msg: '閫夐」鏈€澶?00涓瓧' });
  }

  const checkText = (title.trim() + ' ' + options.join(' ')).trim();
  const sensitiveWords = checkSensitive(checkText);
  if (sensitiveWords.length > 0 && !sensitiveForce) {
    return res.json({ ok: false, warning: true, warningMsg: '鍐呭鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀瑰悗閲嶈瘯' });
  }
  const blockedNames = checkBullyingNames(checkText);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€? });
  }

  const votes = readVotes();
  const newVote = {
    id: 'vote_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: 'admin:' + admin.id,
    author: '绠＄悊鍛?,
    avatar: '',
    title: title.trim(),
    options: options.map((text, idx) => ({
      id: 'opt_' + idx + '_' + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      votes: 0
    })),
    multiple: !!multiple,
    allowCustom: !!allowCustom,
    endTime: endTime || null,
    createdAt: new Date().toISOString(),
    deleted: false
  };

  votes.push(newVote);
  writeVotes(votes);
  res.json({ ok: true, data: newVote });
});

// 鍙備笌鎶曠エ锛堥渶瑕佺櫥褰?+ 鍚屼竴缃戠粶鐜涓嬩粎鍙姇涓€绁級
app.post('/api/votes/:id/vote', (req, res) => {
  const userToken = req.headers['x-user-token'];
  const scToken = req.headers['x-sc-token'];
  let session = null;
  if (userToken) session = verifyUserToken(userToken);
  if (!session && scToken) session = verifySignedToken(scToken);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });

  const { optionIds = [], customOption } = req.body;
  if (!customOption && (!optionIds || !Array.isArray(optionIds) || optionIds.length === 0)) {
    return res.json({ ok: false, msg: '璇烽€夋嫨閫夐」' });
  }

  const votes = readVotes();
  const vote = votes.find(v => v.id === req.params.id && !v.deleted);
  if (!vote) return res.json({ ok: false, msg: '鎶曠エ涓嶅瓨鍦? });

  // 妫€鏌ユ埅姝㈡椂闂?  if (vote.endTime && new Date(vote.endTime) < new Date()) {
    return res.json({ ok: false, msg: '鎶曠エ宸茬粨鏉? });
  }

  // 鑾峰彇鐪熷疄瀹㈡埛绔?IP锛堟敮鎸佸弽鍚戜唬鐞嗭級
  const clientIp = getClientIP(req);

  // 1. 妫€鏌ュ綋鍓嶇敤鎴锋槸鍚﹀凡鎶曠エ
  const records = readVoteRecords();
  const existingByUser = records.find(r => r.voteId === vote.id && r.userId === session.id);
  if (existingByUser) return res.json({ ok: false, msg: '浣犲凡缁忔姇杩囩エ浜? });

  // 2. 妫€鏌ュ悓涓€ IP 鏄惁宸叉姇杩囩エ锛堝嵆浣垮垏鎹㈣处鍙凤級
  const ipRecords = readVoteIpRecords();
  const existingByIp = ipRecords.find(r => r.voteId === vote.id && r.ip === clientIp);
  if (existingByIp) return res.json({ ok: false, msg: '褰撳墠缃戠粶鐜涓嬪凡鏈変汉鎶曡繃绁紝璇锋洿鎹㈢綉缁滃悗閲嶈瘯' });

  // 鏍￠獙閫夐」
  if (!vote.multiple && optionIds.length !== 1) {
    return res.json({ ok: false, msg: '璇ユ姇绁ㄥ彧鑳介€夋嫨涓€涓€夐」' });
  }

  // 澶勭悊鑷畾涔夐€夐」
  let finalOptionIds = [...optionIds];
  if (customOption && vote.allowCustom) {
    const trimmed = String(customOption).trim();
    if (trimmed.length < 1) return res.json({ ok: false, msg: '鑷畾涔夐€夐」涓嶈兘涓虹┖' });
    if (trimmed.length > 100) return res.json({ ok: false, msg: '鑷畾涔夐€夐」鏈€澶?00瀛? });
    // 妫€鏌ユ晱鎰熻瘝
    const sw = checkSensitive(trimmed);
    if (sw.length > 0) return res.json({ ok: false, msg: '鑷畾涔夐€夐」鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀? });
    const bn = checkBullyingNames(trimmed);
    if (bn.length > 0) return res.json({ ok: false, msg: '鑷畾涔夐€夐」娑夊強鍙椾繚鎶や汉鍛樺鍚? });
    // 妫€鏌ユ槸鍚﹀凡鏈夌浉鍚岄€夐」
    let existingOpt = vote.options.find(o => o.text.trim() === trimmed);
    let newOptId;
    if (existingOpt) {
      newOptId = existingOpt.id;
    } else {
      // 娣诲姞鏂伴€夐」鍒版姇绁?      newOptId = 'custom_' + Math.random().toString(36).slice(2, 8);
      vote.options.push({ id: newOptId, text: trimmed, votes: 0 });
    }
    finalOptionIds = [newOptId];
  }

  for (const optId of finalOptionIds) {
    const opt = vote.options.find(o => o.id === optId);
    if (!opt) return res.json({ ok: false, msg: '閫夐」涓嶅瓨鍦? });
    opt.votes = (opt.votes || 0) + 1;
    records.push({
      id: 'vr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      voteId: vote.id,
      optionId: optId,
      userId: session.id,
      createdAt: new Date().toISOString()
    });
  }

  // 璁板綍 IP 鎶曠エ
  ipRecords.push({
    id: 'vrip_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    voteId: vote.id,
    ip: clientIp,
    userId: session.id,
    createdAt: new Date().toISOString()
  });

  writeVotes(votes);
  writeVoteRecords(records);
  writeVoteIpRecords(ipRecords);

  const totalVotes = vote.options.reduce((s, opt) => s + (opt.votes || 0), 0);
  res.json({ ok: true, data: { ...vote, totalVotes, userVoted: finalOptionIds } });
});

// 鍒犻櫎鎶曠エ锛堜粎绠＄悊鍛樺彲鍒犻櫎锛?app.delete('/api/votes/:id', requireAdmin, (req, res) => {
  const votes = readVotes();
  const idx = votes.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '鎶曠エ涓嶅瓨鍦? });
  votes[idx].deleted = true;
  writeVotes(votes);
  res.json({ ok: true });
});

// 绠＄悊鍛樿幏鍙栨姇绁ㄥ垪琛?app.get('/api/admin/votes', requireAdmin, (req, res) => {
  const votes = readVotes();
  const records = readVoteRecords();
  const list = votes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({
    ok: true,
    data: list.map(v => ({
      ...v,
      totalVotes: v.options.reduce((s, o) => s + (o.votes || 0), 0),
      participantCount: [...new Set(records.filter(r => r.voteId === v.id).map(r => r.userId))].length
    }))
  });
});

// 绠＄悊鍛樺垹闄ゆ姇绁?app.delete('/api/admin/votes/:id', requireAdmin, (req, res) => {
  const votes = readVotes();
  const idx = votes.findIndex(v => v.id === req.params.id);
  if (idx === -1) return res.json({ ok: false, msg: '鎶曠エ涓嶅瓨鍦? });
  votes[idx].deleted = true;
  writeVotes(votes);
  res.json({ ok: true });
});

// ===== 鏍″洯澧欐媿鍗栫郴缁?=====
const PICKUP_SLOTS = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-23'];
const BASE_BID = 300;
const BID_STEP = 50;

function readPickupAuctions () { return db.readPickupAuctions(); }
function writePickupAuctions (data) { db.writePickupAuctions(data); }
function readPickupReports () { return db.readPickupReports(); }
function writePickupReports (data) { db.writePickupReports(data); }

// 鑾峰彇鎴栧垱寤轰粖澶╂煇涓椂闂存Ы鐨勬媿鍗?function getOrCreateAuction(slot, dateStr) {
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

// 鑾峰彇褰撳墠姝ｅ湪鏄剧ず鐨勬椂娈碉紙鏍规嵁褰撳墠鏃堕棿锛?function getCurrentSlot() {
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

// 鑾峰彇浠婂ぉ鏃ユ湡瀛楃涓?function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
// 鑾峰彇鏄庡ぉ鏃ユ湡瀛楃涓诧紙鎷嶅崠鎶曠殑鏄浜屽ぉ鏃舵锛?function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// 鑾峰彇鎵€鏈夋椂娈电殑鎷嶅崠鐘舵€?app.get('/api/pickup/auctions', (req, res) => {
  const date = req.query.date || tomorrowStr(); // 鎷嶅崠鎶曠殑鏄浜屽ぉ鐨勬椂娈?  const auctions = readPickupAuctions();
  // 纭繚姣忎釜鏃舵閮芥湁涓€涓媿鍗栧璞?  const result = PICKUP_SLOTS.map(slot => {
    const existing = auctions.find(a => a.slot === slot && a.date === date);
    if (existing) return existing;
    return getOrCreateAuction(slot, date);
  });
  res.json({
    ok: true,
    data: result.map(a => ({
      id: a.id, slot: a.slot, slotLabel: slotLabel(a.slot), date: a.date, status: a.status,
      bids: a.bids.map(b => ({ username: b.anonymous ? '鍖垮悕鐢ㄦ埛' : b.username, amount: b.amount, content: b.content, anonymous: b.anonymous, time: b.time, reviewStatus: b.reviewStatus })),
      currentPrice: a.bids.length > 0 ? Math.max(...a.bids.map(b => b.amount)) : BASE_BID,
      bidderCount: a.bids.length
    }))
  });
});

// 鑾峰彇褰撳墠姝ｅ湪灞曠ず鐨勬媿鍗栧唴瀹?app.get('/api/pickup/current', (req, res) => {
  const date = todayStr();
  const currentSlot = getCurrentSlot();
  const auctions = readPickupAuctions();
  const auction = auctions.find(a => a.slot === currentSlot && a.date === date);
  if (!auction || auction.bids.length === 0) {
    return res.json({ ok: true, data: null, slot: currentSlot, slotLabel: slotLabel(currentSlot) });
  }
  // 鑾峰彇鎵€鏈夊鏍搁€氳繃涓旀湭琚爣璁拌繚瑙勭殑鍑轰环锛屾寜閲戦闄嶅簭
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
      username: highestBid.anonymous ? '鍖垮悕鐢ㄦ埛' : highestBid.username
    }
  });
});

// 鍑轰环
app.post('/api/pickup/bid', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });

  const { slot, date, content, anonymous, amount } = req.body;
  if (!slot || !PICKUP_SLOTS.includes(slot)) return res.json({ ok: false, msg: '鏃犳晥鐨勬椂闂存' });
  if (!content || content.trim().length === 0) return res.json({ ok: false, msg: '璇疯緭鍏ュ睍绀哄唴瀹? });
  if (content.length > 100) return res.json({ ok: false, msg: '鍐呭涓嶈兘瓒呰繃100瀛? });
  if (!amount || amount < BASE_BID) return res.json({ ok: false, msg: '鍑轰环涓嶈兘浣庝簬 ' + BASE_BID + ' Credits' });
  if (amount % BID_STEP !== 0) return res.json({ ok: false, msg: '鍑轰环蹇呴』鏄?' + BID_STEP + ' 鐨勫€嶆暟' });

  // 鏁忔劅璇嶆娴?  const sensitiveWords = checkSensitive(content);
  if (sensitiveWords.length > 0) {
    return res.json({ ok: false, warning: true, warningMsg: '鍐呭鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀瑰悗閲嶈瘯' });
  }
  // 闇稿噷淇濇姢濮撳悕妫€娴?  const blockedNames = checkBullyingNames(content);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€? });
  }

  const dateStr = date || tomorrowStr(); // 鍑轰环鎶曠殑鏄浜屽ぉ鐨勬椂娈?  const auctions = readPickupAuctions();
  const idx = auctions.findIndex(a => a.slot === slot && a.date === dateStr);
  if (idx === -1) return res.json({ ok: false, msg: '璇ユ椂闂存Ы鎷嶅崠灏氭湭鍒濆鍖? });

  const auction = auctions[idx];
  if (auction.status !== 'open') return res.json({ ok: false, msg: '璇ユ椂闂存Ы绔炴媿宸茬粨鏉? });

  const currentPrice = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.amount)) : BASE_BID;
  if (amount < currentPrice + BID_STEP) return res.json({ ok: false, msg: '鍑轰环鑷冲皯涓哄綋鍓嶆渶楂樹环 + ' + BID_STEP + ' Credits锛堝綋鍓嶆渶楂橈細' + currentPrice + '锛? });

  // 妫€鏌ヤ綑棰?  const users = readUsers();
  const uIdx = users.findIndex(u => u.id === session.id);
  if (uIdx === -1) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  const userCredit = users[uIdx].credit || 0;
  if (userCredit < amount) return res.json({ ok: false, msg: '浣欓涓嶈冻锛屽綋鍓嶄綑棰濓細' + userCredit + ' Credits' });

  // 鎵ｅ噺鍑轰环閲戦锛堝喕缁擄級
  changeCredit(session.id, -amount, '鏍″洯澧欐媿鍗栧嚭浠?- ' + slotLabel(slot) + ' - 鍑轰环 ' + amount + ' Credits');
  // 娣诲姞鍒扮珵浠疯褰曪紝榛樿寰呭鏍?  const bid = {
    id: 'bid_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: session.id, username: session.nickname || session.username,
    amount, content: content.trim(), anonymous: !!anonymous,
    time: new Date().toISOString(),
    reviewStatus: 'pending_review'
  };
  auction.bids.push(bid);
  writePickupAuctions(auctions);

  res.json({ ok: true, msg: '鍑轰环鎴愬姛锛佸唴瀹瑰凡鎻愪氦瀹℃牳锛岄€氳繃鍚庡皢鍦ㄥ搴旀椂娈靛睍绀恒€?, bid });
});

// 鑾峰彇鏌愪釜鏃舵鐨勫嚭浠疯鎯?app.get('/api/pickup/auction-detail/:slot', (req, res) => {
  const date = req.query.date || tomorrowStr(); // 鎷嶅崠鎶曠殑鏄浜屽ぉ鐨勬椂娈?  const slot = req.params.slot;
  if (!PICKUP_SLOTS.includes(slot)) return res.json({ ok: false, msg: '鏃犳晥鐨勬椂闂存' });

  const auctions = readPickupAuctions();
  const auction = auctions.find(a => a.slot === slot && a.date === date);
  if (!auction) return res.json({ ok: true, data: null });

  const currentPrice = auction.bids.length > 0 ? Math.max(...auction.bids.map(b => b.amount)) : BASE_BID;
  // 瀵圭敤鎴烽殣钘?userId
  const publicBids = auction.bids.map(b => ({
    username: b.anonymous ? '鍖垮悕鐢ㄦ埛' : b.username,
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

// 鑾峰彇褰撳墠鐢ㄦ埛鍦ㄦ墍鏈夋椂娈电殑鍑轰环璁板綍
app.get('/api/pickup/my-bids', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

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
  // 鎸夋椂闂村€掑簭
  myBids.sort((a, b) => new Date(b.time) - new Date(a.time));
  res.json({ ok: true, data: myBids });
});

// ===== 绠＄悊鍛橈細鎷嶅崠瀹℃牳 =====
// 鑾峰彇鎵€鏈夊緟瀹℃牳鐨勫嚭浠?app.get('/api/admin/pickup/bids', requireAdmin, (req, res) => {
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
  // 寰呭鏍哥殑鎺掑湪鏈€鍓嶉潰
  allBids.sort((a, b) => {
    if ((a.reviewStatus === 'pending_review') !== (b.reviewStatus === 'pending_review')) {
      return a.reviewStatus === 'pending_review' ? -1 : 1;
    }
    return new Date(b.time) - new Date(a.time);
  });
  res.json({ ok: true, data: allBids });
});

// 瀹℃牳閫氳繃/鎷掔粷
app.post('/api/admin/pickup/review/:bidId', requireAdmin, (req, res) => {
  const { action } = req.body; // 'approve' 鎴?'reject'
  if (!['approve', 'reject'].includes(action)) return res.json({ ok: false, msg: '鏃犳晥鎿嶄綔' });

  const auctions = readPickupAuctions();
  let found = false;
  for (let ai = 0; ai < auctions.length; ai++) {
    const auction = auctions[ai];
    for (let bi = 0; bi < auction.bids.length; bi++) {
      if (auction.bids[bi].id === req.params.bidId) {
        found = true;
        if (action === 'approve') {
          auction.bids[bi].reviewStatus = 'approved';
          // 鑷姩鍙戦€?T0 閫氱煡
          const bid = auction.bids[bi];
          const slotLabelStr = slotLabel(auction.slot);
          const notices = readNotices();
          notices.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            title: '馃弳 鎷嶅崠鍐呭宸查€氳繃瀹℃牳',
            content: '浣犲湪 ' + auction.date + ' ' + slotLabelStr + ' 鏃舵鎻愪氦鐨勬媿鍗栧唴瀹瑰凡閫氳繃瀹℃牳锛屽嵆灏嗗湪鏍″洯澧欐媿鍗栨爮灞曠ず銆俓n\n馃摑 灞曠ず鍐呭锛? + (bid.content || '(鏈～鍐?'),
            author: '绯荤粺',
            auto: true,
    level: 'T0',
            createdAt: new Date().toISOString(),
      targetUserId: bid.userId
          });
          writeNotices(notices);
        } else {
          // 鎷掔粷锛氭爣璁颁负rejected锛岄€€杩樺喕缁撶殑credit
          auction.bids[bi].reviewStatus = 'rejected';
          changeCredit(auction.bids[bi].userId, auction.bids[bi].amount, '鏍″洯澧欐媿鍗栧唴瀹瑰鏍告湭閫氳繃 - 閫€杩樺嚭浠?' + auction.bids[bi].amount + ' Credits');
        }
        writePickupAuctions(auctions);
        return res.json({ ok: true, msg: action === 'approve' ? '宸查€氳繃瀹℃牳' : '宸叉嫆缁濆苟閫€杩?' + auction.bids[bi].amount + ' Credits' });
      }
    }
  }
  if (!found) return res.json({ ok: false, msg: '鏈壘鍒拌鍑轰环璁板綍' });
});

// ===== 婊氬姩鏍忓睍绀哄唴瀹逛妇鎶?=====

// 鑾峰彇浠婂ぉ鎵€鏈夋椂娈靛綋鍓嶅睍绀虹殑鍐呭锛堝鏍搁€氳繃鐨勬渶楂樺嚭浠凤紝鍏ㄩ儴6涓椂娈碉級
app.get('/api/pickup/today-content', (req, res) => {
  const date = todayStr(); // 灞曠ず鐨勬槸浠婂ぉ鐨勫唴瀹癸紙鏄ㄥぉ鎷嶅崠涓爣鐨勶級
  const auctions = readPickupAuctions();
  const result = [];
  for (const slot of PICKUP_SLOTS) {
    const auction = auctions.find(a => a.slot === slot && a.date === date);
    if (!auction || auction.bids.length === 0) {
      // 璇ユ椂娈垫棤浠讳綍鍑轰环 鈫?鍗犱綅
      result.push({
        bidId: null, slot, slotLabel: slotLabel(slot),
        content: '娆㈣繋鏉ュ埌鏍″洯澧?馃槉', username: '', anonymous: false,
        amount: 0, time: '', placeholder: true
      });
      continue;
    }
    const approvedBids = auction.bids.filter(b => b.reviewStatus === 'approved');
    if (approvedBids.length === 0) {
      // 鏈夋椂娈典絾鏃犲鏍搁€氳繃鍐呭 鈫?鍗犱綅
      result.push({
        bidId: null, slot, slotLabel: slotLabel(slot),
        content: '娆㈣繋鏉ュ埌鏍″洯澧?馃槉', username: '', anonymous: false,
        amount: 0, time: '', placeholder: true
      });
      continue;
    }
    const highest = approvedBids.reduce((max, b) => b.amount > max.amount ? b : max, approvedBids[0]);
    result.push({
      bidId: highest.id, slot, slotLabel: slotLabel(slot),
      content: highest.content, username: highest.anonymous ? '鍖垮悕鐢ㄦ埛' : highest.username,
      anonymous: highest.anonymous, amount: highest.amount, time: highest.time,
      placeholder: false
    });
  }
  res.json({ ok: true, data: result });
});

// 鐢ㄦ埛涓炬姤灞曠ず鍐呭
app.post('/api/pickup/report-content/:bidId', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈?, code: 'TOKEN_EXPIRED' });

  const bidId = req.params.bidId;
  const { reason } = req.body;
  const auctions = readPickupAuctions();

  // 鏌ユ壘璇ュ嚭浠锋槸鍚﹀瓨鍦?  let foundBid = null;
  let foundAuction = null;
  for (const auction of auctions) {
    const bid = auction.bids.find(b => b.id === bidId);
    if (bid) { foundBid = bid; foundAuction = auction; break; }
  }
  if (!foundBid) return res.json({ ok: false, msg: '鏈壘鍒拌灞曠ず鍐呭' });
  if (foundBid.reviewStatus !== 'approved') return res.json({ ok: false, msg: '璇ュ唴瀹瑰凡涓嶅湪灞曠ず涓? });

  // 妫€鏌ユ槸鍚﹀凡涓炬姤
  const reports = readPickupReports();
  const existing = reports.find(r => r.bidId === bidId && r.reporterId === session.id);
  if (existing) return res.json({ ok: false, msg: '浣犲凡涓炬姤杩囪鍐呭锛岃绛夊緟澶勭悊' });

  // 鍒涘缓涓炬姤璁板綍
  const report = {
    id: 'pr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    bidId,
    auctionId: foundAuction.id,
    slot: foundAuction.slot,
    slotLabel: slotLabel(foundAuction.slot),
    date: foundAuction.date,
    content: foundBid.content,
    username: foundBid.anonymous ? '鍖垮悕鐢ㄦ埛' : foundBid.username,
    userId: foundBid.userId,
    amount: foundBid.amount,
    reason: (reason || '杩濊鍐呭').trim().slice(0, 200),
    reporterId: session.id,
    reporterName: session.nickname || session.username,
    status: 'pending', // pending / resolved_violation / resolved_dismissed
    time: new Date().toISOString()
  };
  reports.push(report);
  writePickupReports(reports);

  res.json({ ok: true, msg: '涓炬姤宸叉彁浜わ紝绠＄悊鍛樺皢灏藉揩澶勭悊' });
});

// 绠＄悊鍛橈細鑾峰彇鎷嶅崠鍐呭涓炬姤鍒楄〃
app.get('/api/admin/pickup/reports', requireAdmin, (req, res) => {
  const reports = readPickupReports();
  // 鎸夌姸鎬佹帓搴忥細pending 鎺掓渶鍓?  reports.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return new Date(b.time) - new Date(a.time);
  });
  res.json({ ok: true, data: reports });
});

// 绠＄悊鍛橈細澶勭悊鎷嶅崠鍐呭涓炬姤
app.post('/api/admin/pickup/report-action/:reportId', requireAdmin, (req, res) => {
  const { action } = req.body; // 'confirm'锛堢‘璁よ繚瑙勶級 鎴?'dismiss'锛堥┏鍥炰妇鎶ワ級
  if (!['confirm', 'dismiss'].includes(action)) return res.json({ ok: false, msg: '鏃犳晥鎿嶄綔' });

  const reports = readPickupReports();
  const rIdx = reports.findIndex(r => r.id === req.params.reportId);
  if (rIdx === -1) return res.json({ ok: false, msg: '涓炬姤涓嶅瓨鍦? });

  const report = reports[rIdx];
  if (report.status !== 'pending') return res.json({ ok: false, msg: '璇ヤ妇鎶ュ凡澶勭悊' });

  if (action === 'dismiss') {
    // 椹冲洖涓炬姤锛氫笉澶勭悊鍐呭锛屼粎鏍囪涓炬姤鐘舵€?    reports[rIdx].status = 'resolved_dismissed';
    reports[rIdx].resolvedAt = new Date().toISOString();
    reports[rIdx].resolvedBy = req.admin.username;
    writePickupReports(reports);
    return res.json({ ok: true, msg: '涓炬姤宸查┏鍥? });
  }

  // === 纭杩濊 ===
  // 1. 鎵惧嚭瀵瑰簲鐨勫嚭浠疯褰?  const auctions = readPickupAuctions();
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

  if (!targetBid) return res.json({ ok: false, msg: '鍑轰环璁板綍涓嶅瓨鍦ㄦ垨琚垹闄? });

  // 2. 鏍囪鍑轰环涓鸿繚瑙?  targetBid.reviewStatus = 'violated';
  targetBid.violatedAt = new Date().toISOString();

  // 3. 灏佺鐢ㄦ埛锛堜笉閫€杩?Credits锛?  const users = readUsers();
  const uIdx = users.findIndex(u => u.id === targetBid.userId);
  let banMsg = '';
  if (uIdx !== -1 && users[uIdx].status !== 'banned') {
    users[uIdx].status = 'banned';
    users[uIdx].bannedAt = new Date().toISOString();
    users[uIdx].banReason = '鏍″洯澧欐媿鍗栧睍绀哄唴瀹硅繚瑙勶紙涓炬姤澶勭悊锛?;
    writeUsers(users);
    banMsg = '锛屽凡灏佺鐢ㄦ埛 ' + users[uIdx].username;
  }

  // 4. 鏌ユ壘涓嬩竴涓鏍搁€氳繃鐨勭浜岄珮鍑轰环
  const approvedBids = targetAuction.bids
    .filter(b => b.reviewStatus === 'approved' && b.id !== report.bidId)
    .sort((a, b) => b.amount - a.amount);
  let replaceMsg = '';
  if (approvedBids.length > 0) {
    // 鏈変笅涓€涓鏍搁€氳繃鐨勫嚭浠?鈫?鑷姩鏇挎崲
    replaceMsg = '锛屽凡鑷姩鏇挎崲涓虹浜屽嚭浠疯€呭唴瀹?;
  } else {
    // 娌℃湁瀹℃牳閫氳繃鐨勫嚭浠?鈫?灏嗗湪 /api/pickup/current 涓繑鍥?null锛屽墠绔樉绀洪粯璁ゆ枃妗?    replaceMsg = '锛岃鏃舵鏆傛棤鍏朵粬瀹℃牳閫氳繃鍐呭';
  }

  writePickupAuctions(auctions);

  // 5. 鏇存柊涓炬姤鐘舵€?  reports[rIdx].status = 'resolved_violation';
  reports[rIdx].resolvedAt = new Date().toISOString();
  reports[rIdx].resolvedBy = req.admin.username;
  writePickupReports(reports);

  res.json({
    ok: true,
    msg: '宸茬‘璁よ繚瑙勶細鍐呭宸蹭笅鏋讹紝Credit 涓嶄簣閫€杩? + banMsg + replaceMsg
  });
});

// 鍚姩鏃朵慨澶嶅紓甯歌璇佹暟鎹細approved 鏃犲鏍歌褰?鈫?闄嶇骇
function fixCertDataOnStart() {
  try {
    const users = readUsers();
    let changed = false;
    users.forEach(u => {
      if (u.zhixueStatus === 'approved' && !u.zhixueReviewedBy) {
        console.warn('[鍚姩淇] 鐢ㄦ埛', u.id, '(' + u.nickname + ') 鐘舵€佷负 approved 浣嗙己灏戝鏍歌褰曪紝閲嶇疆涓?null');
        delete u.zhixueStatus;
        changed = true;
      }
      // nully 鐘舵€佺殑璁よ瘉娈嬬暀鏁版嵁涔熸竻鐞嗭紙鏈?zhixueUsername/manualNote 浣嗘棤 status锛?      if (!u.zhixueStatus && (u.zhixueUsername || u.zhixueManualNote)) {
        // 鏈夋彁浜ゆ暟鎹絾鐘舵€佷负绌?鈫?杩欏彲鑳芥槸 bug 瀵艰嚧鐨勬畫鐣欙紝璁句负 pending 浠ヨЕ鍙戝鏍?        u.zhixueStatus = 'pending';
        changed = true;
      }
    });
    if (changed) writeUsers(users);
  } catch (e) {
    console.error('[鍚姩淇] 璁よ瘉鏁版嵁妫€鏌ュけ璐?', e.message);
  }
}

// ===== 瀛︾敓浼氶€氱煡 =====
const SC_FILE = path.join(DATA_DIR, 'student_council.json');
const NOTICES_FILE = path.join(DATA_DIR, 'notices.json');

function readSC () { return db.readSC(); }

function writeSC (data) { db.writeSC(data); }

function writeNotices (data) { db.writeNotices(data); }

function readMaintenance () { return db.readMaintenance(); }
function writeMaintenance (data) { db.writeMaintenance(data); }

// 妫€娴嬫槸鍚﹀凡鍒濆鍖?app.get('/api/student-council/check-init', (req, res) => {
  const sc = readSC();
  res.json({ ok: true, data: { needInit: !sc } });
});

// 棣栨璁剧疆瀛︾敓浼氳处鍙?app.post('/api/student-council/init', (req, res) => {
  if (readSC()) return res.json({ ok: false, msg: '宸插垵濮嬪寲锛岃鐩存帴鐧诲綍' });

  const { id, password, name } = req.body;
  if (!id || !/^[a-zA-Z0-9_]{3,20}$/.test(id))
    return res.json({ ok: false, msg: '璐﹀彿鏍煎紡锛?-20浣嶅瓧姣嶃€佹暟瀛椼€佷笅鍒掔嚎' });
  if (!password || password.length < 6)
    return res.json({ ok: false, msg: '瀵嗙爜鑷冲皯6浣? });
  if (!name || !name.trim())
    return res.json({ ok: false, msg: '璇疯緭鍏ュ悕绉? });

  writeSC({
    id, name: name.trim(),
    password: hashPassword(password),
    createdAt: new Date().toISOString()
  });
  res.json({ ok: true, msg: '瀛︾敓浼氳处鍙峰凡鍒涘缓' });
});

// 瀛︾敓浼氱櫥褰曪紙鏀寔鍘熷鐢熶細璐﹀彿 + 鏍″洯澧欑敤鎴风櫥褰曪級
app.post('/api/student-council/login', (req, res) => {
  const { id, password, captchaId, captchaText } = req.body;

  // 楠岃瘉 captcha
  if (captchaId && captchaText) {
    const entry = captchaStore.get(captchaId);
    if (!entry || entry.text !== captchaText.toLowerCase()) {
      return res.json({ ok: false, msg: '楠岃瘉鐮侀敊璇? });
    }
    captchaStore.delete(captchaId);
  }

  if (!id || !password) return res.json({ ok: false, msg: '璇疯緭鍏ヨ处鍙峰拰瀵嗙爜' });

  // 灏濊瘯鍘熷鐢熶細璐﹀彿鐧诲綍
  const sc = readSC();
  if (sc && sc.id === id) {
    if (!verifyPassword(password, sc.password))
      return res.json({ ok: false, msg: '璐﹀彿鎴栧瘑鐮侀敊璇? });
    const token = signToken({ id: sc.id, loginAt: Date.now() });
    return res.json({ ok: true, data: { token, name: sc.name, type: 'sc' } });
  }

  // 灏濊瘯鏍″洯澧欑敤鎴风櫥褰曪紙闇€ noticePublisher 鏉冮檺锛?  const users = readUsers();
  const user = users.find(u => (u.nickname === id || u.id === id) && u.noticePublisher && u.status !== 'banned');
  if (user) {
    if (!verifyPassword(password, user.password)) {
      return res.json({ ok: false, msg: '璐﹀彿鎴栧瘑鐮侀敊璇? });
    }
    const token = signToken({ id: user.id, loginAt: Date.now() });
    return res.json({ ok: true, data: { token, name: user.nickname, type: 'user' } });
  }

  return res.json({ ok: false, msg: '璐﹀彿鎴栧瘑鐮侀敊璇? });
});

// ===== 绠＄悊鍛樼鐞嗗鐢熶細璐﹀彿 =====

// 鑾峰彇瀛︾敓浼氳处鍙蜂俊鎭紙浠呯鐞嗗憳锛?app.get('/api/admin/student-council', requireAdmin, (req, res) => {
  const sc = readSC();
  if (!sc) return res.json({ ok: false, msg: '瀛︾敓浼氳处鍙锋湭鍒濆鍖? });
  res.json({
    ok: true,
    data: {
      id: sc.id,
      name: sc.name,
      createdAt: sc.createdAt
    }
  });
});

// 閲嶇疆瀛︾敓浼氬瘑鐮侊紙浠呯鐞嗗憳锛?app.post('/api/admin/student-council/reset-pwd', requireAdmin, (req, res) => {
  const sc = readSC();
  if (!sc) return res.json({ ok: false, msg: '瀛︾敓浼氳处鍙锋湭鍒濆鍖? });
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.json({ ok: false, msg: '瀵嗙爜鑷冲皯 6 浣? });
  }
  sc.password = hashPassword(newPassword);
  writeSC(sc);
  res.json({ ok: true, msg: '瀛︾敓浼氬瘑鐮佸凡閲嶇疆' });
});

// 淇敼瀛︾敓浼氬悕绉帮紙浠呯鐞嗗憳锛?app.post('/api/admin/student-council/change-name', requireAdmin, (req, res) => {
  const sc = readSC();
  if (!sc) return res.json({ ok: false, msg: '瀛︾敓浼氳处鍙锋湭鍒濆鍖? });
  const { name } = req.body;
  if (!name || !name.trim()) return res.json({ ok: false, msg: '璇疯緭鍏ュ悕绉? });
  sc.name = name.trim();
  writeSC(sc);
  res.json({ ok: true, msg: '瀛︾敓浼氬悕绉板凡淇敼', data: { name: sc.name } });
});

// 淇敼瀵嗙爜
app.post('/api/student-council/change-pwd', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰? });
  const session = verifySignedToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  // 楠岃瘉锛氬鐢熶細璐﹀彿 鎴?鏍″洯澧欓€氱煡鍙戝竷鑰?  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher);
  if (!isSC && !isPublisher) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });

  const { oldPwd, newPwd } = req.body;
  if (!oldPwd || !newPwd) return res.json({ ok: false, msg: '璇峰～鍐欏畬鏁? });
  if (!verifyPassword(oldPwd, sc.password)) return res.json({ ok: false, msg: '鏃у瘑鐮侀敊璇? });
  if (newPwd.length < 6) return res.json({ ok: false, msg: '鏂板瘑鐮佽嚦灏?浣? });
  if (oldPwd === newPwd) return res.json({ ok: false, msg: '鏂版棫瀵嗙爜涓嶈兘鐩稿悓' });

  sc.password = hashPassword(newPwd);
  writeSC(sc);
  res.json({ ok: true, msg: '瀵嗙爜宸蹭慨鏀? });
});

// 淇敼鏄电О
app.post('/api/student-council/change-name', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '鏈櫥褰? });
  const session = verifySignedToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  // 楠岃瘉锛氬鐢熶細璐﹀彿 鎴?鏍″洯澧欓€氱煡鍙戝竷鑰?  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher);
  if (!isSC && !isPublisher) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });

  const { name } = req.body;
  if (!name || !name.trim()) return res.json({ ok: false, msg: '璇疯緭鍏ュ悕绉? });

  sc.name = name.trim();
  writeSC(sc);
  // 杩斿洖鏂?token 鍜屾柊鍚嶇О
  const newToken = signToken({ id: sc.id, loginAt: Date.now() });
  res.json({ ok: true, msg: '鏄电О宸蹭慨鏀?, data: { token: newToken, name: sc.name } });
});

// 閫氱煡鍙戝竷鑰呭垱寤烘姇绁紙闇€ x-sc-token锛屽鐢熶細璐﹀彿鎴栭€氱煡鍙戝竷鑰咃級
app.post('/api/notice/votes', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifySignedToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });

  // 楠岃瘉韬唤锛氬鐢熶細璐﹀彿 鎴?閫氱煡鍙戝竷鑰?  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const publisher = users.find(u => u.id === session.id && u.noticePublisher);
  if (!isSC && !publisher) return res.json({ ok: false, msg: '鏃犳潈闄愬垱寤烘姇绁? });

  const { title, options, multiple = false, allowCustom = false, endTime = null, sensitiveForce = false } = req.body;

  if (!title || title.trim().length < 2) return res.json({ ok: false, msg: '鏍囬鑷冲皯2涓瓧' });
  if (title.trim().length > 100) return res.json({ ok: false, msg: '鏍囬鏈€澶?00涓瓧' });
  if (!options || !Array.isArray(options) || options.length < 2) return res.json({ ok: false, msg: '鑷冲皯闇€瑕?涓€夐」' });
  if (options.length > 20) return res.json({ ok: false, msg: '鏈€澶?0涓€夐」' });
  for (const opt of options) {
    if (!opt || typeof opt !== 'string' || !opt.trim()) return res.json({ ok: false, msg: '閫夐」涓嶈兘涓虹┖' });
    if (opt.trim().length > 100) return res.json({ ok: false, msg: '閫夐」鏈€澶?00涓瓧' });
  }

  const checkText = (title.trim() + ' ' + options.join(' ')).trim();
  const sensitiveWords = checkSensitive(checkText);
  if (sensitiveWords.length > 0 && !sensitiveForce) {
    return res.json({ ok: false, warning: true, warningMsg: '鍐呭鍖呭惈鏁忔劅璇嶏紝璇蜂慨鏀瑰悗閲嶈瘯' });
  }
  const blockedNames = checkBullyingNames(checkText);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, warningMsg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€? });
  }

  const authorName = isSC ? sc.name : (publisher.nickname || '閫氱煡鍙戝竷鑰?);
  const votes = readVotes();
  const newVote = {
    id: 'vote_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    userId: 'sc:' + session.id,
    author: authorName,
    avatar: '',
    title: title.trim(),
    options: options.map((text, idx) => ({
      id: 'opt_' + idx + '_' + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      votes: 0
    })),
    multiple: !!multiple,
    allowCustom: !!allowCustom,
    endTime: endTime || null,
    createdAt: new Date().toISOString(),
    deleted: false
  };

  votes.push(newVote);
  writeVotes(votes);
  res.json({ ok: true, data: newVote });
});


// 鑾峰彇鐢ㄦ埛涓汉閫氱煡锛堢郴缁熻嚜鍔ㄥ彂閫佺殑涓撳睘閫氱煡锛?app.get('/api/user/notifications', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: true, data: [] });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: true, data: [] });
  const notices = readNotices();
  // 杩斿洖 targetUserId 涓哄綋鍓嶇敤鎴风殑閫氱煡
  const userNotices = notices.filter(n => n.targetUserId === session.id && !n.deleted);
  userNotices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: userNotices });
});

// 鑾峰彇閫氱煡鍒楄〃锛堝叕寮€锛岃繃婊ゅ凡鍒犻櫎锛?app.get('/api/notices', (req, res) => {
  const notices = readNotices();
  const active = notices.filter(n => !n.deleted && !n.targetUserId);
  const list = active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
  res.json({ ok: true, data: list });
});

// 鍙戝竷閫氱煡锛堥渶楠岃瘉token锛?app.post('/api/notices', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifySignedToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  // 楠岃瘉锛氬鐢熶細璐﹀彿 鎴?鏍″洯澧欓€氱煡鍙戝竷鑰?  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher);
  if (!isSC && !isPublisher) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });

  const { title, content, author, level, images } = req.body;
  if (!title || !title.trim()) return res.json({ ok: false, msg: '璇峰～鍐欐爣棰? });
  if (!content || !content.trim()) return res.json({ ok: false, msg: '璇峰～鍐欏唴瀹? });

  // 鏁忔劅璇嶆娴嬶紙閫氱煡鏍囬+鍐呭涓€璧锋鏌ワ級
  const combinedText = (title || '') + ' ' + (content || '');
  const sensitiveWords = checkSensitive(combinedText);
  const hasSensitive = sensitiveWords.length > 0;
  if (hasSensitive) {
    return res.json({ ok: false, warning: true, msg: '鍐呭鍖呭惈鏁忔劅璇?[' + sensitiveWords.join(', ') + ']锛岃淇敼鍚庨噸鏂版彁浜?, words: sensitiveWords });
  }
  // 闇稿噷濮撳悕妫€娴?  const blockedNames = checkBullyingNames(combinedText);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, msg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€? });
  }

  // 楠岃瘉鍥剧墖锛坆ase64 data URL锛屾瘡寮犫墹10MB锛?  var validImages = [];
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
  res.json({ ok: true, msg: '閫氱煡宸插彂甯? });
});

// 鍒犻櫎閫氱煡锛堥渶楠岃瘉token锛夆€斺€?杞垹闄わ紝60澶╁悗鑷姩娓呯悊
app.delete('/api/notices/:id', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifySignedToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });

  // 楠岃瘉锛氬鐢熶細璐﹀彿 鎴?鏍″洯澧欓€氱煡鍙戝竷鑰?  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned');
  if (!isSC && !isPublisher) {
    // 妫€鏌ユ槸鍚﹀瓨鍦ㄨ鐢ㄦ埛
    const userExists = users.find(u => u.id === session.id);
    if (!userExists) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦?, code: 'USER_NOT_FOUND' });
    return res.json({ ok: false, msg: '鏃犻€氱煡鍙戝竷鏉冮檺', code: 'NO_PERMISSION' });
  }

  const notices = readNotices();
  const notice = notices.find(n => n.id === req.params.id);
  if (!notice) return res.json({ ok: false, msg: '閫氱煡涓嶅瓨鍦? });
  if (notice.deleted) return res.json({ ok: false, msg: '閫氱煡宸茶鍒犻櫎' });

  notice.deleted = true;
  notice.deletedAt = new Date().toISOString();
  writeNotices(notices);
  res.json({ ok: true, msg: '閫氱煡宸插垹闄? });
});

// 缃《/鍙栨秷缃《閫氱煡
app.post('/api/notices/:id/pin', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifySignedToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned');
  if (!isSC && !isPublisher) {
    const userExists = users.find(u => u.id === session.id);
    if (!userExists) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦?, code: 'USER_NOT_FOUND' });
    return res.json({ ok: false, msg: '鏃犻€氱煡鍙戝竷鏉冮檺', code: 'NO_PERMISSION' });
  }

  const notices = readNotices();
  const notice = notices.find(n => n.id === req.params.id);
  if (!notice) return res.json({ ok: false, msg: '閫氱煡涓嶅瓨鍦? });
  if (notice.deleted) return res.json({ ok: false, msg: '閫氱煡宸茶鍒犻櫎' });

  notice.pinned = !notice.pinned;
  if (notice.pinned) {
    notice.pinnedAt = new Date().toISOString();
  } else {
    notice.pinnedAt = null;
  }
  notice.updatedAt = new Date().toISOString();
  writeNotices(notices);
  res.json({ ok: true, msg: notice.pinned ? '宸茬疆椤? : '宸插彇娑堢疆椤?, pinned: notice.pinned });
});

// 鍚屾閫氱煡鍒板叾浠栧钩鍙?app.post('/api/notices/:id/sync', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifySignedToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned');
  if (!isSC && !isPublisher) {
    const userExists = users.find(u => u.id === session.id);
    if (!userExists) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦?, code: 'USER_NOT_FOUND' });
    return res.json({ ok: false, msg: '鏃犻€氱煡鍙戝竷鏉冮檺', code: 'NO_PERMISSION' });
  }

  const notices = readNotices();
  const notice = notices.find(n => n.id === req.params.id);
  if (!notice) return res.json({ ok: false, msg: '閫氱煡涓嶅瓨鍦? });
  if (notice.deleted) return res.json({ ok: false, msg: '閫氱煡宸茶鍒犻櫎' });

  notice.synced = true;
  notice.syncedAt = new Date().toISOString();
  notice.updatedAt = new Date().toISOString();
  writeNotices(notices);
  res.json({ ok: true, msg: '鍚屾鎴愬姛' });
});

// 淇敼閫氱煡锛堥渶楠岃瘉token锛?app.put('/api/notices/:id', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍', code: 'NOT_LOGIN' });
  const session = verifySignedToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈? });
  // 楠岃瘉锛氬鐢熶細璐﹀彿 鎴?鏍″洯澧欓€氱煡鍙戝竷鑰?  const sc = readSC();
  const users = readUsers();
  const isSC = sc && sc.id === session.id;
  const isPublisher = users.find(u => u.id === session.id && u.noticePublisher && u.status !== 'banned');
  if (!isSC && !isPublisher) {
    // 妫€鏌ユ槸鍚﹀瓨鍦ㄨ鐢ㄦ埛
    const userExists = users.find(u => u.id === session.id);
    if (!userExists) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦?, code: 'USER_NOT_FOUND' });
    return res.json({ ok: false, msg: '鏃犻€氱煡鍙戝竷鏉冮檺', code: 'NO_PERMISSION' });
  }

  const { title, content, author, level, images, sensitiveForce } = req.body;
  if (!title || !title.trim()) return res.json({ ok: false, msg: '璇峰～鍐欐爣棰? });
  if (!content || !content.trim()) return res.json({ ok: false, msg: '璇峰～鍐欏唴瀹? });

  // 鏁忔劅璇嶆娴嬶紙sensitiveForce=true 鏃惰烦杩囨鏌ワ級
  const combinedText = (title || '') + ' ' + (content || '');
  const sensitiveWords = checkSensitive(combinedText);
  const hasSensitive = sensitiveWords.length > 0;
  if (hasSensitive && !sensitiveForce) {
    return res.json({ ok: false, warning: true, msg: '鍐呭鍖呭惈鏁忔劅璇?[' + sensitiveWords.join(', ') + ']锛岃淇敼鍚庨噸鏂版彁浜?, words: sensitiveWords });
  }
  // 闇稿噷濮撳悕妫€娴嬶紙濮嬬粓闃绘锛屼笉鍙己鍒讹級
  const blockedNames = checkBullyingNames(combinedText);
  if (blockedNames.length > 0) {
    return res.json({ ok: false, bullying: true, msg: '鍐呭娑夊強鍙椾繚鎶や汉鍛樺鍚嶏紝鏃犳硶鍙戦€? });
  }

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
  if (!notice) return res.json({ ok: false, msg: '閫氱煡涓嶅瓨鍦? });
  if (notice.deleted) return res.json({ ok: false, msg: '閫氱煡宸茶鍒犻櫎' });

  notice.title = title.trim();
  notice.content = content.trim();
  if (author && author.trim()) notice.author = author.trim();
  if (level) notice.level = level === 'T0' ? 'T0' : 'T1';
  if (Array.isArray(images)) {
    notice.images = validImages.length > 0 ? validImages : undefined;
  }
  notice.updatedAt = new Date().toISOString();
  writeNotices(notices);
  res.json({ ok: true, msg: '閫氱煡宸蹭慨鏀? });
});

// ===== 閫氱煡鍙戝竷璐﹀彿鐢宠 =====
const APP_FILE = path.join(DATA_DIR, 'notice_applications.json');
const PASSKEY_FILE = path.join(DATA_DIR, 'notice_passkey.json');

function readPasskey () { return db.readPasskey(); }

function writePasskey (data) { db.writePasskey(data); }

function readApps () { return db.readApps(); }

function writeApps (data) { db.writeApps(data); }

// 鎻愪氦鐢宠锛堝叕寮€锛岄渶 pass-key锛?app.post('/api/notice-account/apply', (req, res) => {
  const { name, department, contact, reason, passkey, captchaId, captchaText } = req.body;

  // 楠岃瘉鐢ㄦ埛鐧诲綍
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, msg: '璇峰厛鐧诲綍鏍″洯澧欒处鍙?, code: 'NOT_LOGIN' });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, msg: '鐧诲綍宸茶繃鏈燂紝璇烽噸鏂扮櫥褰?, code: 'TOKEN_EXPIRED' });

  // 楠岃瘉 captcha
  const entry = captchaStore.get(captchaId);
  if (!entry || entry.text !== (captchaText || '').toLowerCase()) {
    return res.json({ ok: false, msg: '楠岃瘉鐮侀敊璇? });
  }
  captchaStore.delete(captchaId);

  if (!name || !name.trim()) return res.json({ ok: false, msg: '璇峰～鍐欑敵璇蜂汉濮撳悕' });
  if (!department || !department.trim()) return res.json({ ok: false, msg: '璇峰～鍐欓儴闂?缁勭粐' });
  if (!contact || !contact.trim()) return res.json({ ok: false, msg: '璇峰～鍐欒仈绯绘柟寮? });
  if (!reason || !reason.trim()) return res.json({ ok: false, msg: '璇峰～鍐欑敵璇风悊鐢? });

  const apps = readApps();
  // 姣忎汉鍙兘鐢宠涓€娆★紙闄ら潪琚┏鍥烇級
  const existing = apps.find(a => a.userId === session.id && a.status !== 'rejected');
  if (existing) {
    const hint = existing.status === 'pending' ? '璇风瓑寰呭鏍哥粨鏋? : '浣犵殑鐢宠宸查€氳繃';
    return res.json({ ok: false, msg: '浣犲凡鎻愪氦杩囩敵璇凤紝' + hint });
  }

  // 楠岃瘉 pass-key锛堥€夊～锛?  const stored = readPasskey();
  const hasValidPasskey = stored && stored.key && passkey && passkey.trim() === stored.key;
  const hasPasskeyInput = passkey && passkey.trim().length > 0;

  if (hasValidPasskey) {
    // 閫氳鐮佹纭?鈫?鑷姩閫氳繃锛岀洿鎺ユ巿浜堥€氱煡鍙戝竷鏉冮檺
    const users = readUsers();
    const targetUser = users.find(u => u.id === session.id);
    if (targetUser) {
      targetUser.noticePublisher = true;
      targetUser.noticePublisherAddedAt = new Date().toISOString();
      targetUser._noticeAppNotification = {
        status: 'approved',
        message: '浣犵殑閫氱煡鍙戝竷鐢宠宸查€氳繃锛佷綘鍙互浣跨敤鏍″洯澧欒处鍙峰瘑鐮佺櫥褰?notice.html 绠＄悊閫氱煡',
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
      status: 'approved', // 鑷姩閫氳繃
      userId: session.id,
      userNickname: session.nickname || name.trim(),
      createdAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'system'
    });
    writeApps(apps);
    res.json({ ok: true, msg: '馃帀 閫氳鐮侀獙璇侀€氳繃锛屼綘宸茶幏寰楅€氱煡鍙戝竷鏉冮檺锛? });
  } else if (hasPasskeyInput) {
    // 鏈夐€氳鐮佷絾涓嶅尮閰?鈫?杩斿洖閿欒
    res.json({ ok: false, msg: '閫氳鐮侀敊璇紝璇风‘璁ゅ悗閲嶆柊杈撳叆' });
  } else {
    // 鏃犻€氳鐮?鈫?鎻愪氦鐢宠锛岀瓑寰呯鐞嗗憳瀹℃牳
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
    res.json({ ok: true, msg: '鐢宠宸叉彁浜わ紝璇风瓑寰呯鐞嗗憳瀹℃牳' });
  }
});

// 鑾峰彇鐢ㄦ埛鐨勯€氱煡鐢宠瀹℃牳缁撴灉閫氱煡锛堣鍙栧悗娓呴櫎锛?app.get('/api/user/notice-app-notification', (req, res) => {
  const token = req.headers['x-user-token'];
  if (!token) return res.json({ ok: false, data: null });
  const session = verifyUserToken(token);
  if (!session) return res.json({ ok: false, data: null });

  const users = readUsers();
  const user = users.find(u => u.id === session.id);
  if (!user || !user._noticeAppNotification) return res.json({ ok: true, data: null });

  const notif = user._noticeAppNotification;
  // 娓呴櫎閫氱煡锛堜竴娆℃€ц鍙栵級
  delete user._noticeAppNotification;
  writeUsers(users);

  res.json({ ok: true, data: notif });
});

// 鏌ョ湅鐢宠鍒楄〃锛堜粎绠＄悊鍛橈級
app.get('/api/admin/notice-applications', requireAdmin, (req, res) => {
  const apps = readApps().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, data: apps });
});

// 瀹℃牳鐢宠锛堜粎绠＄悊鍛橈級
app.post('/api/admin/notice-applications/:id/review', requireAdmin, (req, res) => {
  const { action, accountId, accountName, accountPwd } = req.body;
  if (!['approve', 'reject'].includes(action)) return res.json({ ok: false, msg: '鏃犳晥鎿嶄綔' });

  const apps = readApps();
  const app = apps.find(a => a.id === req.params.id);
  if (!app) return res.json({ ok: false, msg: '鐢宠涓嶅瓨鍦? });
  if (app.status !== 'pending') return res.json({ ok: false, msg: '璇ョ敵璇峰凡澶勭悊' });

  if (action === 'reject') {
    app.status = 'rejected';
    app.reviewedAt = new Date().toISOString();
    app.reviewedBy = req.admin.id;
    writeApps(apps);

    // 瀛樺偍閫氱煡鍒扮敤鎴疯褰?    const users = readUsers();
    const targetUser = users.find(u => u.id === app.userId);
    if (targetUser) {
      targetUser._noticeAppNotification = {
        status: 'rejected',
        message: '浣犵殑閫氱煡鍙戝竷鐢宠宸茶椹冲洖锛屽彲浠ラ噸鏂版彁浜ょ敵璇?,
        timestamp: new Date().toISOString()
      };
      writeUsers(users);
    }

    return res.json({ ok: true, msg: '宸叉嫆缁濊鐢宠' });
  }

  // 閫氳繃锛氭爣璁版牎鍥鐢ㄦ埛涓洪€氱煡鍙戝竷鑰?  const users = readUsers();
  const targetUser = users.find(u => u.id === app.userId);
  if (!targetUser) {
    return res.json({ ok: false, msg: '鏈壘鍒板搴旂殑鏍″洯澧欑敤鎴凤紝璇风‘璁よ鐢ㄦ埛宸叉敞鍐? });
  }

  targetUser.noticePublisher = true;
  targetUser.noticePublisherAddedAt = new Date().toISOString();
  targetUser._noticeAppNotification = {
    status: 'approved',
    message: '浣犵殑閫氱煡鍙戝竷鐢宠宸查€氳繃锛佷綘鍙互浣跨敤鏍″洯澧欒处鍙峰瘑鐮佺櫥褰?notice.html 绠＄悊閫氱煡',
    timestamp: new Date().toISOString()
  };
  writeUsers(users);

  app.status = 'approved';
  app.reviewedAt = new Date().toISOString();
  app.reviewedBy = req.admin.id;
  writeApps(apps);

  res.json({ ok: true, msg: '宸查€氳繃锛岃鐢ㄦ埛鍙娇鐢ㄦ牎鍥璐﹀彿瀵嗙爜鐧诲綍閫氱煡绠＄悊椤甸潰' });
});

// 鑾峰彇褰撳墠 pass-key锛堜粎绠＄悊鍛橈級
app.get('/api/admin/notice-passkey', requireAdmin, (req, res) => {
  const stored = readPasskey();
  res.json({ ok: true, data: { hasKey: !!stored && !!stored.key, key: stored ? stored.key : null, createdAt: stored ? stored.createdAt : null } });
});

// 鐢熸垚/鍒锋柊 pass-key锛堜粎绠＄悊鍛橈級
app.post('/api/admin/notice-passkey', requireAdmin, (req, res) => {
  const { action, key } = req.body;
  if (action === 'clear') {
    writePasskey({});
    return res.json({ ok: true, msg: '閫氳鐮佸凡娓呯┖锛屾殏鍋滅敵璇? });
  }

  // 鑷姩鐢熸垚鎴栨墜鍔ㄨ缃?  const newKey = (key && key.trim()) ? key.trim() : Math.random().toString(36).slice(2, 10).toUpperCase();
  writePasskey({ key: newKey, createdAt: new Date().toISOString(), createdBy: req.admin.id });
  res.json({ ok: true, msg: '閫氳鐮佸凡鐢熸垚', data: { key: newKey } });
});

// ===== 閫氱煡鍙戝竷鑰呯鐞嗭紙浠呯鐞嗗憳锛?=====
// 鑾峰彇鎵€鏈夐€氱煡鍙戝竷鑰咃紙鍚洿澶氱粺璁′俊鎭級
app.get('/api/admin/notice-publishers', requireAdmin, (req, res) => {
  const users = readUsers();
  const notices = readNotices();
  const publishers = users
    .filter(u => u.noticePublisher)
    .map(u => {
      // 缁熻璇ュ彂甯冭€呯殑閫氱煡鏁帮紙鎸?author 鏄电О鍖归厤锛?      const userNotices = notices.filter(n =>
        !n.deleted && !n.auto && !n.targetUserId &&
        (n.author === u.nickname || n.author === u.username)
      );
      const lastNotice = userNotices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
      return {
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        avatar: u.avatar,
        status: u.status || 'active',
        createdAt: u.noticePublisherAddedAt || u.createdAt || '',
        appsCount: (readApps().filter(a => a.userId === u.id && a.status === 'approved').length),
        noticeCount: userNotices.length,
        lastNoticeAt: lastNotice ? lastNotice.createdAt : null,
        lastNoticeTitle: lastNotice ? lastNotice.title : null
      };
    });
  res.json({ ok: true, data: publishers });
});

// 娣诲姞閫氱煡鍙戝竷鑰呮潈闄?app.post('/api/admin/notice-publishers/add', requireAdmin, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ ok: false, msg: '璇锋寚瀹氱敤鎴稩D' });
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if (user.noticePublisher) return res.json({ ok: false, msg: '璇ョ敤鎴峰凡鏄€氱煡鍙戝竷鑰? });

  user.noticePublisher = true;
  user.noticePublisherAddedAt = new Date().toISOString();
  writeUsers(users);
  res.json({ ok: true, msg: '宸叉巿浜堥€氱煡鍙戝竷鏉冮檺' });
});

// 绉婚櫎閫氱煡鍙戝竷鑰呮潈闄?app.post('/api/admin/notice-publishers/remove', requireAdmin, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.json({ ok: false, msg: '璇锋寚瀹氱敤鎴稩D' });
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ ok: false, msg: '鐢ㄦ埛涓嶅瓨鍦? });
  if (!user.noticePublisher) return res.json({ ok: false, msg: '璇ョ敤鎴蜂笉鏄€氱煡鍙戝竷鑰? });

  user.noticePublisher = false;
  writeUsers(users);
  res.json({ ok: true, msg: '宸茬Щ闄ゅ彂甯冩潈闄? });
});

// ===== 閫氱煡璐﹀彿姒傝缁熻 =====
app.get('/api/admin/notice-account-stats', requireAdmin, (req, res) => {
  const users = readUsers();
  const notices = readNotices();
  const apps = readApps();

  const publishers = users.filter(u => u.noticePublisher);
  const activePublishers = publishers.filter(u => u.status !== 'banned');
  const totalNotices = notices.filter(n => !n.deleted && !n.auto && !n.targetUserId).length;
  const pendingApps = apps.filter(a => a.status === 'pending').length;

  res.json({
    ok: true,
    data: {
      totalPublishers: publishers.length,
      activePublishers: activePublishers.length,
      totalNotices,
      pendingApps
    }
  });
});

// ===== 缁存姢鐘舵€佺鐞?=====
// 鑾峰彇褰撳墠缁存姢鐘舵€?app.get('/api/admin/maintenance/status', requireAdmin, (req, res) => {
  try {
    const data = readMaintenance() || { enabled: false };
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: true, data: { enabled: false } });
  }
});

// 鍒囨崲缁存姢鐘舵€?app.post('/api/admin/maintenance/toggle', requireAdmin, (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.json({ ok: false, msg: '鍙傛暟鏃犳晥' });
  }
  const data = {
    enabled,
    updatedAt: new Date().toISOString(),
    updatedBy: req.admin.name || req.admin.id
  };
  writeMaintenance(data);
  res.json({ ok: true, msg: enabled ? '宸插紑鍚淮鎶ゆā寮? : '宸插叧闂淮鎶ゆā寮?, data });
});

app.listen(PORT, () => {
  fixCertDataOnStart();
  cleanupOldDeletedData();
  console.log(`\n  馃搶 鏍″洯澧欐湇鍔″凡鍚姩`);
  console.log(`  鈫?http://localhost:${PORT}/`);
  console.log(`  鈫?http://localhost:${PORT}/admin.html`);
});

