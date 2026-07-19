// ===== routes/user.js - 用户相关路由 =====
const { hashPassword, verifyPassword, encryptCert, decryptCert, signToken, verifySignedToken, makeUserToken, verifyUserToken, getDisplayZhixueStatus } = require('../lib/crypto');
const { generateId } = require('../lib/uniqueId');
const { getClientIP } = require('../lib/helpers');
const { broadcastSSE } = require('../lib/sse');
const { captchaStore, postRateLimit, qrCodeStore, redeemRateLimit, onlineUsers, captchaGrantLimit, CAPTCHA_GRANT_WINDOW_MS, CAPTCHA_GRANT_MAX } = require('../lib/state');
const { rateLimitLogin, recordLoginFail } = require('../lib/middleware');
const db = require('../db');
const nodeCrypto = require('crypto');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');
const maintenance = require('../maintenance');
const credibility = require('../lib/credibility');

// ===== 本地数据访问包装（兼容旧式 readXxx/writeXxx 调用模式） =====
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readTrustTokens() { return db.readTrustTokens(); }
function writeTrustTokens(tokens) { db.writeTrustTokens(tokens); }
function readCreditLogs() { return db.readCreditLogs(); }
function writeCreditLogs(logs) { db.writeCreditLogs(logs); }
function readCreditCards() { return db.readCreditCards(); }
function writeCreditCards(cards) { db.writeCreditCards(cards); }
function readApps() { return db.readApps(); }
function writeApps(apps) { db.writeApps(apps); }
function readPasskey() { return db.readPasskey(); }
function readPosts() { return db.readPosts(); }
function writePosts(posts) { db.writePosts(posts); broadcastSSE('postUpdate', { t: Date.now() }); }
function readAdmins() { return db.readAdmins(); }
function readNotices() { return db.readNotices(); }
function writeNotices(notices) { db.writeNotices(notices); broadcastSSE('noticeUpdate', { t: Date.now() }); }
function readUserNotifications() { return db.readUserNotifications(); }
function getUnreadCount(userId) { return db.getUnreadCount(userId); }
const CHECKIN_REWARD = 10;

function saveDeletedItem(type, item, deletedBy, extra) {
  db.addDeletedItem({
    id: item.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: type,
    content: typeof item.content === 'string' ? item.content.substring(0, 500) : '',
    author: item.author || item.nickname || item.createdBy || '未知',
    userId: item.userId || item.createdBy || null,
    deletedAt: new Date().toISOString(),
    deletedBy: deletedBy,
    extra: extra || ''
  });
}

function deleteSyncedDiscComment(postId) {
  try {
    var comments = db.readDiscussionComments();
    var matched = comments.filter(function(c) { return c.syncPostId === postId; });
    if (matched.length > 0) {
      matched.forEach(function(c) { saveDeletedItem('disc_comment', c, 'system'); });
      comments = comments.filter(function(c) { return c.syncPostId !== postId; });
      db.writeDiscussionComments(comments);
    }
  } catch(e) { console.warn('[delete] deleteSyncedDiscComment failed:', e.message); }
}

function addLoginLog(type, account, success, ip, ua) {
  const cutoff = Date.now() - 100 * 24 * 60 * 60 * 1000;
  const logs = db.readLogs().filter(l => new Date(l.time).getTime() >= cutoff);
  logs.unshift({ id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, account: account || '未登录用户', success, ip: ip || '-', ua: ua || '-', time: new Date().toISOString() });
  db.writeLogs(logs);
}

function generateUID() {
  return require('../lib/uniqueId').generateUID();
}

function luhnModN(code) {
  // ponytail: 必须与 routes/admin.js 的生成算法（CARD_CHARS / mod 32 / Luhn 拆位）
  // 完全一致，否则每张卡密都通不过校验。旧实现用 mod 10 且无拆位 → "校验码不匹配"。
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const n = chars.length;
  let factor = 2;
  let sum = 0;
  for (let i = code.length - 2; i >= 0; i--) {
    const val = chars.indexOf(code[i]);
    if (val === -1) return false;
    const add = val * factor;
    sum += Math.floor(add / n) + (add % n);
    factor = factor === 2 ? 1 : 2;
  }
  const expected = (n - (sum % n)) % n;
  return chars[expected] === code[code.length - 1];
}

const QR_CODE_TTL = 5 * 60 * 1000;

function persistQrCodes() {
  try {
    const fs = require('fs');
    const qrDbPath = require('path').join(__dirname, '..', 'data', 'qrcodes.json');
    const arr = [];
    for (const [token, data] of qrCodeStore) { arr.push({ token, data }); }
    fs.writeFileSync(qrDbPath, JSON.stringify(arr, null, 2), 'utf8');
  } catch(e) { console.warn('[qrcode] 持久化失败:', e.message); }
}

function cleanupQrCodes() {
  const now = Date.now();
  let changed = false;
  for (const [token, qr] of qrCodeStore) {
    if (now - qr.createdAt > QR_CODE_TTL) { qr.status = 'expired'; qrCodeStore.delete(token); changed = true; }
  }
  if (changed) persistQrCodes();
}

module.exports = function(app) {
  app.post('/api/slider-captcha/grant', (req, res) => {
    // 服务端限流：单 IP 60 秒内最多下发 CAPTCHA_GRANT_MAX 次，防止机器人批量刷 captcha token
    const ip = getClientIP(req);
    const now = Date.now();
    const hits = (captchaGrantLimit.get(ip) || []).filter(ts => now - ts < CAPTCHA_GRANT_WINDOW_MS);
    if (hits.length >= CAPTCHA_GRANT_MAX) {
      return res.json({ ok: false, msg: '操作过于频繁，请稍后再试', code: 'RATE_LIMITED' });
    }
    hits.push(now);
    captchaGrantLimit.set(ip, hits);
    const id = 'sc_' + now.toString(36) + Math.random().toString(36).slice(2, 6);
    captchaStore.set(id, { verified: true, t: now });
    res.json({ ok: true, data: { token: id } });
  });
  app.post('/api/user/register', (req, res) => {
    const { username, password, nickname, captchaId, captchaText } = req.body;
    if (!username || !password || !nickname) {
      return res.json({ ok: false, msg: '账号、密码、昵称均为必填项' });
    }
    // 滑块验证码校验（Bot-Testing 模式下跳过）
    if (!maintenance.isBotTesting()) {
      const entry = captchaStore.get(captchaId);
      if (!entry || !entry.verified) {
        return res.json({ ok: false, msg: '请完成人机验证' });
      }
    }
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
      return res.json({ ok: false, msg: '账号需 3-16 位字母、数字、下划线' });
    }
    if (password.length < 6) {
      return res.json({ ok: false, msg: '密码至少 6 位' });
    }
    if (nickname.includes(' ')) {
      return res.json({ ok: false, msg: '昵称不能包含空格' });
    }
    if (nickname.length < 2 || nickname.length > 12) {
      return res.json({ ok: false, msg: '昵称需 2-12 个字符' });
    }

    const users = readUsers();
    if (users.find(u => u.username === username)) {
      return res.json({ ok: false, msg: '账号已被注册' });
    }
    if (users.find(u => u.nickname && u.nickname.toLowerCase() === nickname.toLowerCase())) {
      return res.json({ ok: false, msg: '昵称已被使用' });
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
      bindAdminRole: null,
      credibility_score: 90,
      credibility_exchanged_total: 0,
      credibility_last_refresh: new Date().toISOString()
    };
    users.push(newUser);
    writeUsers(users);
    if (!maintenance.isBotTesting()) captchaStore.delete(captchaId);
  
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
  app.post('/api/user/login', rateLimitLogin('username'), (req, res) => {
    const { username, password, captchaId, captchaText } = req.body;
    const ip = getClientIP(req);
    const ua = req.headers['user-agent'] || '-';

    if (!username || !password) {
      addLoginLog('user', null, false, ip, ua);
      return res.json({ ok: false, msg: '请输入账号和密码' });
    }
    // 滑块验证码校验（Bot-Testing 模式下跳过）
    if (!maintenance.isBotTesting()) {
      const entry = captchaStore.get(captchaId);
      if (!entry || !entry.verified) {
        return res.json({ ok: false, msg: '请完成人机验证' });
      }
    }

    const users = readUsers();
    const user = users.find(u => u.username === username);
    if (!user || !verifyPassword(password, user.password)) {
      addLoginLog('user', username, false, ip, ua);
      recordLoginFail(res); // ponytail: 记一次失败，触发 ip|account 限流
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
    if (!maintenance.isBotTesting()) captchaStore.delete(captchaId);
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
  app.post('/api/user/zhixue-login', (req, res) => {
    const { zhixueUsername, password, captchaId, captchaText } = req.body;
    const ip = getClientIP(req);
    const ua = req.headers['user-agent'] || '-';
  
    // 滑块验证码校验（Bot-Testing 模式下跳过）
    if (!maintenance.isBotTesting()) {
      const entry = captchaStore.get(captchaId);
      if (!entry || !entry.verified) {
        return res.json({ ok: false, msg: '请完成人机验证' });
      }
    }

    if (!zhixueUsername || !password) {
      addLoginLog('user', null, false, ip, ua);
      return res.json({ ok: false, msg: '请输入绑定的智学网账号和密码' });
    }
  
    const users = readUsers();
    let user = users.find(u => String(u.zhixueUsername) === String(zhixueUsername) && (u.zhixueStatus === 'approved' || u.zhixueStatus === 'pending_confirm'));
    // 防御：approved 必须有审核记录
    if (user && user.zhixueStatus === 'approved' && !user.zhixueReviewedBy) {
      console.warn('[zhixue-login] 用户', user.id, '状态为 approved 但缺少审核记录，拒绝登录');
      user = null;
    }
    if (!user) {
      addLoginLog('user', zhixueUsername, false, ip, ua);
      return res.json({ ok: false, msg: '当前账号可能错误或者未绑定校园墙账号' });
    }
    const decryptedZhixuePwd = user.zhixuePassword ? (decryptCert(user.zhixuePassword) || '') : '';
    if (password !== decryptedZhixuePwd) {
      // 旧版代码在审核通过时会清空 zhixuePassword（已知 bug），
      // 用户密码已不可恢复。此时允许用户重新提交密码来绑定。
      if (!user.zhixuePassword) {
        const idx = users.findIndex(u => u.id === user.id);
        users[idx].zhixuePassword = encryptCert(password);
        writeUsers(users);
        console.log('[zhixue-login] 已恢复用户', user.id, '的智学密码');
      } else {
        addLoginLog('user', zhixueUsername, false, ip, ua);
        return res.json({ ok: false, msg: '当前密码错误' });
      }
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
    if (!maintenance.isBotTesting()) captchaStore.delete(captchaId);
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
  app.post('/api/user/check-zhixue-unique', (req, res) => {
    const { zhixueUsername } = req.body;
    if (!zhixueUsername) return res.json({ ok: false, msg: '请提供智学网账号' });
    const users = readUsers();
    const existing = users.find(u =>
      String(u.zhixueUsername) === String(zhixueUsername) &&
      u.zhixueStatus === 'approved'
    );
    res.json({ ok: true, data: { available: !existing } });
  });
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
  app.post('/api/user/revoke-trust', (req, res) => {
    const { trustToken } = req.body;
    if (!trustToken) return res.json({ ok: false, msg: '缺少信任令牌' });
    const tokens = readTrustTokens();
    delete tokens[trustToken];
    writeTrustTokens(tokens);
    res.json({ ok: true });
  });
  app.get('/api/user/qrcode/generate', (req, res) => {
    const { userToken, captchaId } = req.query;
    // 滑块验证码校验（Bot-Testing 模式下跳过）
    if (!maintenance.isBotTesting()) {
      const entry = captchaStore.get(captchaId);
      if (!entry || !entry.verified) {
        return res.json({ ok: false, msg: '请完成人机验证' });
      }
      captchaStore.delete(captchaId);
    }
    let linkedUser = null;
    if (userToken) {
      const session = verifyUserToken(userToken);
      if (session) {
        const users = readUsers();
        linkedUser = users.find(u => u.id === session.id);
      }
    }
    const qrToken = nodeCrypto.randomBytes(16).toString('hex');
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
        token: nodeCrypto.randomBytes(24).toString('hex')
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
  app.post('/api/user/forgot-password', (req, res) => {
    const { zhixueUsername, zhixuePassword, newPassword, confirmPassword } = req.body;
  
    if (!zhixueUsername) {
      return res.json({ ok: false, msg: '请输入绑定的智学网账号' });
    }
    if (!zhixuePassword) {
      return res.json({ ok: false, msg: '请输入绑定的智学网密码以验证身份' });
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
  
    // 身份验证：必须提供与绑定时一致的智学网密码，证明是账号本人
    const storedZhixuePassword = decryptCert(users[userIndex].zhixuePassword);
    if (!storedZhixuePassword || storedZhixuePassword !== zhixuePassword) {
      return res.json({ ok: false, msg: '智学网密码不正确，无法验证身份' });
    }
  
    users[userIndex].password = hashPassword(newPassword);
    writeUsers(users);
  
    res.json({ ok: true, msg: '密码重置成功，请使用新密码登录' });
  });
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
  app.get('/api/user/credit-logs', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  
    const logs = readCreditLogs();
    const userLogs = logs.filter(l => l.userId === session.id).reverse();
    res.json({ ok: true, data: userLogs });
  });
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

    // 滑块验证码校验（Bot-Testing 模式下跳过）
    if (!maintenance.isBotTesting()) {
      const { captchaId, captchaText } = req.body;
      const entry = captchaStore.get(captchaId);
      if (!entry || !entry.verified) {
        return res.json({ ok: false, msg: '请完成人机验证' });
      }
      captchaStore.delete(captchaId);
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
      users[userIndex].zhixuePassword = encryptCert(zhixuePassword);
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
    credibility.addZhixueBonus(session.id);
    res.json({ ok: true, msg: '认证信息已确认，欢迎！' });
  });
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

// ===== 用户公开主页（个人中心页 user.html 调用）=====
// aeed436「路由拆分 + SPA」重构时从旧 server.js 删除后未迁移，导致 user.html
// 请求 /api/users/:id 与 /api/users/:id/posts 命中 404 返回 HTML，前端
// JSON 解析报 "Unexpected token '<'"。此处按原逻辑恢复。
// ===== 用户搜索 =====
app.get('/api/users/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ ok: true, data: { accounts: [], nicknames: [], uids: [], names: [] } });

  const users = readUsers();
  const results = { accounts: [], nicknames: [], uids: [], names: [] };
  const seen = new Set();
  const ql = q.toLowerCase();
  const LIMIT = 20;

  for (const user of users) {
    if (user.status === 'banned') continue;
    const base = { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, zhixueStatus: user.zhixueStatus || null, certRealName: user.certRealName || null };

    if (user.username && user.username.toLowerCase().includes(ql) && results.accounts.length < LIMIT && !seen.has('a' + user.id)) {
      results.accounts.push(base); seen.add('a' + user.id);
    }
    if (user.nickname && user.nickname.toLowerCase().includes(ql) && results.nicknames.length < LIMIT && !seen.has('n' + user.id)) {
      results.nicknames.push(base); seen.add('n' + user.id);
    }
    if (user.id && user.id.toLowerCase().includes(ql) && results.uids.length < LIMIT && !seen.has('u' + user.id)) {
      results.uids.push(base); seen.add('u' + user.id);
    }
    const decryptedName = user.certRealName ? (decryptCert(user.certRealName) || '') : '';
    const matchedName = (decryptedName && decryptedName.includes(q)) || (user.zhixueManualName && user.zhixueManualName.includes(q));
    if (matchedName && results.names.length < LIMIT && !seen.has('r' + user.id)) {
      results.names.push(base); seen.add('r' + user.id);
    }
  }

  res.json({ ok: true, data: results });
});

app.get('/api/users/:id', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.status === 'banned') return res.json({ ok: false, msg: '该账号已被禁用', code: 'BANNED' });
  // 不返回密码等敏感信息
  res.json({ ok: true, data: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar, createdAt: user.createdAt, postCount: user.postCount || 0, status: user.status, bindAdminId: user.bindAdminId, bindAdminRole: user.bindAdminRole, zhixueStatus: getDisplayZhixueStatus(user) } });
});

app.get('/api/users/:id/posts', (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.json({ ok: false, msg: '用户不存在' });
  if (user.status === 'banned') return res.json({ ok: false, msg: '该账号已被禁用', code: 'BANNED' });
  const posts = readPosts();
  const userPosts = posts.filter(p => !p.deleted && (p.userId === user.id || p.author === user.nickname));
  res.json({ ok: true, data: userPosts });
});

  app.delete('/api/user/posts/:id', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });
  
    let posts = readPosts();
    const post = posts.find(p => p.id === req.params.id);
    if (!post) return res.json({ ok: false, msg: '帖子不存在' });
    if (post.deleted) return res.json({ ok: false, msg: '帖子已被删除' });
    if (post.userId !== session.id) return res.json({ ok: false, msg: '无权删除他人的帖子' });
  
    saveDeletedItem('post', post, 'user');
    posts = posts.filter(p => p.id !== req.params.id);
    writePosts(posts);
    deleteSyncedDiscComment(req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/user/heartbeat', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) { onlineUsers.set('anon_' + getClientIP(req), Date.now()); return res.json({ ok: true }); }
    const session = verifyUserToken(token);
    if (!session || !session.id) { onlineUsers.set('anon_' + getClientIP(req), Date.now()); return res.json({ ok: true }); }
    onlineUsers.set(session.id, Date.now());
    res.json({ ok: true });
  });
  app.get('/api/user/notifications', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: true, data: [] });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: true, data: [] });
    const notices = readNotices();
    // 返回 targetUserId 为当前用户的通知
    const userNotices = notices.filter(n => n.targetUserId === session.id && !n.deleted);
    userNotices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, data: userNotices });
  });
  app.post('/api/notice-account/apply', (req, res) => {
    const { name, department, contact, reason, passkey, captchaId, captchaText } = req.body;
  
    // 验证用户登录
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录校园墙账号', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });
  
    // 滑块验证码校验（Bot-Testing 模式下跳过）
    if (!maintenance.isBotTesting()) {
      const entry = captchaStore.get(captchaId);
      if (!entry || !entry.verified) {
        return res.json({ ok: false, msg: '请完成人机验证' });
      }
      captchaStore.delete(captchaId);
    }
  
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
  // ===== 用户通知未读状态 API =====
  app.get('/api/user/notifications/unread-count', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const count = getUnreadCount(session.id);
    res.json({ ok: true, data: { count } });
  });

  app.post('/api/user/notifications/mark-read', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const { notificationId } = req.body;
    if (!notificationId) return res.json({ ok: false, msg: '缺少通知ID' });
    markNotificationRead(session.id, notificationId);
    res.json({ ok: true, msg: '已标记为已读' });
  });

  app.post('/api/user/notifications/mark-all-read', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const notifications = readUserNotifications().filter(n => n.userId === session.id && !n.read);
    notifications.forEach(n => markNotificationRead(session.id, n.notificationId));
    res.json({ ok: true, msg: '全部已标记为已读' });
  });

  // ===== 信用分（Credibility Score） API =====
  app.get('/api/user/credibility-info', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const info = credibility.getScore(session.id);
    if (!info) return res.json({ ok: false, msg: '用户不存在' });
    const users = readUsers();
    const user = users.find(u => u.id === session.id);
    if (user) credibility.checkAndRefresh(user);
    const logs = db.readCredibilityLogs()
      .filter(l => l.userId === session.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const rate = credibility.getExchangeRate(info.exchangedTotal);
    const maxExchange = credibility.CREDIBILITY_MAX_EXCHANGE;
    const remainingExchange = maxExchange - info.exchangedTotal;
    res.json({
      ok: true,
      data: {
        score: info.score,
        exchangedTotal: info.exchangedTotal,
        lastRefresh: info.lastRefresh,
        credit: info.credit,
        exchangeRate: rate,
        remainingExchange,
        maxExchange,
        logs,
        thresholds: credibility.THRESHOLDS,
      }
    });
  });

  app.post('/api/user/exchange-credibility', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const { credits } = req.body;
    const amount = parseInt(credits);
    if (!amount || amount <= 0) return res.json({ ok: false, msg: '请输入有效的 credits 数量' });
    const result = credibility.exchangeCredits(session.id, amount);
    res.json(result);
  });

  app.get('/api/user/credibility-logs', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期' });
    const logs = db.readCredibilityLogs()
      .filter(l => l.userId === session.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ ok: true, data: logs });
  });

  // ===== PLUS++ 卡密兑换 =====
  app.post('/api/user/redeem-plus-card', (req, res) => {
    const token = req.headers['x-user-token'];
    if (!token) return res.json({ ok: false, msg: '未登录', code: 'NOT_LOGIN' });
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '登录已过期', code: 'TOKEN_EXPIRED' });

    const now = Date.now();
    const rlKey = 'rplus_' + session.id;
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
    if (!/^PLUS-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(cleanCode)) {
      return res.json({ ok: false, msg: '卡密格式不正确' });
    }
    const codePart = cleanCode.replace(/-/g, '').slice(4);
    if (!luhnModN(codePart)) {
      return res.json({ ok: false, msg: '卡密无效（校验码不匹配）' });
    }

    const now2 = new Date();

    try {
      const result = db.getDb().transaction(() => {
        const plusCards = db.readPlusCards();
        const card = plusCards.find(c => c.code === cleanCode);
        if (!card) return { error: '卡密不存在' };
        if (card.status !== 'unused') return { error: '该卡密已被使用' };

        card.status = 'used';
        card.usedBy = session.id;
        card.usedAt = now2.toISOString();
        db.writePlusCards(plusCards);

        const plan = card.plan;
        const duration = card.duration || 1;
        const durationMs = plan === 'weekly'
          ? duration * 7 * 24 * 3600 * 1000
          : duration * 30 * 24 * 3600 * 1000;

        const subs = db.readSubscriptions();
        const activeSub = subs.find(s => s.userId === session.id && s.status === 'active' && s.endTime > now2.toISOString());

        let subscription;
        if (activeSub) {
          const oldEndTime = new Date(activeSub.endTime);
          const baseTime = Math.max(oldEndTime.getTime(), now2.getTime());
          const newEndTime = new Date(baseTime + durationMs);
          db.updateSubscription(activeSub.id, { endTime: newEndTime.toISOString() });
          subscription = { ...activeSub, endTime: newEndTime.toISOString() };
        } else {
          const sub = {
            id: generateId('SUBS'),
            userId: session.id,
            plan,
            startTime: now2.toISOString(),
            endTime: new Date(now2.getTime() + durationMs).toISOString(),
            price: 0,
            paymentMethod: 'card',
            cardCode: cleanCode,
            status: 'active',
            renewedFrom: null,
            createdAt: now2.toISOString()
          };
          db.addSubscription(sub);
          subscription = sub;
        }
        return { subscription, plan, duration };
      })();

      if (result.error) return res.json({ ok: false, msg: result.error });

      const { subscription, plan, duration } = result;
      const notificationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const notices = readNotices();
      notices.push({
        id: notificationId,
        title: 'PLUS++ 订阅已激活',
        content: '恭喜！你已通过卡密兑换激活 PLUS++ ' + (plan === 'weekly' ? '周卡' : '月卡') + ' x' + duration + '，有效期至 ' + new Date(subscription.endTime).toLocaleDateString('zh-CN'),
        author: '系统', auto: true, level: 'T1',
        createdAt: new Date().toISOString(),
        targetUserId: session.id
      });
      writeNotices(notices);
      db.addUserNotification({ notificationId, userId: session.id, read: 0, createdAt: new Date().toISOString() });

      console.warn('[AUDIT] 用户 ' + session.id + ' 通过卡密 ' + cleanCode + ' 兑换 PLUS++ 订阅');
      res.json({ ok: true, msg: '兑换成功！PLUS++ 权益已激活', data: { subscription } });
    } catch (e) {
      console.error('[user] redeem-plus-card tx failed:', e.message);
      res.json({ ok: false, msg: '兑换失败，请稍后重试' });
    }
  });
};
