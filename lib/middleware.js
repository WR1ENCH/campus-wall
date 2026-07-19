// ===== lib/middleware.js - Express 中间件 =====

const { verifySignedToken } = require('./crypto');
const { getClientIP } = require('./helpers');
const { loginFailures, LOGIN_WINDOW_MS, LOGIN_MAX_FAILS } = require('./state');

// ponytail: 登录暴破限流中间件。按 ip|account 记失败次数，窗口内超限返回 429。
// GitHub Code Review 报 server.js “Missing rate limiting”——登录口无失败封顶可被暴破。
// 无新依赖，复用 lib/state.js 的 Map+时间戳清理模式。accountField 指定从 body 取哪个字段。
function rateLimitLogin(accountField) {
  return function (req, res, next) {
    const ip = getClientIP(req);
    const account = (req.body && req.body[accountField]) ? String(req.body[accountField]) : '';
    const key = ip + '|' + account;
    const now = Date.now();
    const fails = (loginFailures.get(key) || []).filter(ts => now - ts < LOGIN_WINDOW_MS);
    if (fails.length >= LOGIN_MAX_FAILS) {
      return res.status(429).json({ ok: false, msg: '登录失败次数过多，请 15 分钟后再试', code: 'RATE_LIMITED' });
    }
    // 把当前 key 挂到 res，供路由在密码校验失败时调用 recordLoginFail
    res.locals.loginFailKey = key;
    next();
  };
}
function recordLoginFail(res) {
  const key = res.locals.loginFailKey;
  if (!key) return;
  const fails = (loginFailures.get(key) || []).filter(ts => Date.now() - ts < LOGIN_WINDOW_MS);
  fails.push(Date.now());
  loginFailures.set(key, fails);
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.json({ ok: false, msg: '未登录，请先登录', code: 'NOT_LOGIN' });
  const session = verifySignedToken(token);
  if (!session || !session.id || !session.loginAt) {
    return res.json({ ok: false, msg: '登录信息无效', code: 'INVALID_TOKEN' });
  }
  if (!['super', 'admin'].includes(session.role)) {
    return res.json({ ok: false, msg: '登录信息无效', code: 'INVALID_TOKEN' });
  }
  if (Date.now() - session.loginAt > 24 * 3600 * 1000) {
    return res.json({ ok: false, msg: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });
  }
  req.admin = session;
  next();
}

function requireSuper(req, res, next) {
  if (req.admin.role !== 'super') {
    return res.json({ ok: false, msg: '权限不足，仅超级管理员可用', code: 'FORBIDDEN' });
  }
  next();
}

function createCheckMaintenance(readMaintenance, writeMaintenance, verifySignedToken) {
  return function checkMaintenance(req, res, next) {
    const reqPath = req.path;
    if (reqPath.startsWith('/api/admin') || reqPath === '/admin.html' || reqPath === '/maintenance.html' || reqPath.startsWith('/api/maintenance') || reqPath === '/api/slider-captcha/grant') {
      return next();
    }
    try {
      const data = readMaintenance();
      let enabled = data && (data.enabled === true || data.enabled === 'true');
      const now = Date.now();
      let stateChanged = false;
      if (data && data.autoStart && data.autoEnd) {
        const start = new Date(data.autoStart).getTime();
        const end = new Date(data.autoEnd).getTime();
        if (now >= start && now <= end && !enabled) { enabled = true; stateChanged = true; }
        else if (now > end && enabled) { enabled = false; stateChanged = true; }
      } else if (data && data.autoStart && !data.autoEnd) {
        const start = new Date(data.autoStart).getTime();
        if (now >= start && !enabled) { enabled = true; stateChanged = true; }
      }
      if (stateChanged) { data.enabled = enabled; writeMaintenance(data); }
      if (enabled) {
        const adminToken = req.headers['x-admin-token'];
        if (adminToken) {
          const adminSession = verifySignedToken(adminToken);
          if (adminSession && adminSession.id && Date.now() - adminSession.loginAt < 24 * 3600 * 1000) return next();
        }
        const bypassToken = req.cookies && req.cookies.maintenance_bypass;
        if (bypassToken) {
          const session = verifySignedToken(bypassToken);
          if (session && session.type === 'maintenance_bypass' && Date.now() - session.loginAt < 4 * 3600 * 1000) return next();
        }
        const referer = req.headers.referer || req.headers.referrer || '';
        if (referer.indexOf('/admin.html') !== -1) return next();
        const noticeBypass = data && (data.noticeBypass === true || data.noticeBypass === 'true');
        if (noticeBypass) {
          if (reqPath === '/notice.html') return next();
          if (reqPath === '/api/notices' || reqPath.startsWith('/api/notices/') ||
              reqPath === '/api/discussions' || reqPath.startsWith('/api/discussions/') ||
              reqPath === '/api/votes' || reqPath.startsWith('/api/votes/') ||
              reqPath === '/api/notice/votes' || reqPath === '/api/announcement' ||
              reqPath === '/api/student-council' || reqPath.startsWith('/api/student-council/')) return next();
        }
        if (req.accepts('html')) return res.redirect('/maintenance.html');
        return res.json({ ok: false, msg: '系统维护中，暂时无法访问', code: 'MAINTENANCE' });
      }
    } catch (e) { console.error('[maintenance] 读取维护状态失败:', e.message); }
    next();
  };
}

// 全局输入过滤
const SPECIAL_CHAR_REGEX = /[~!@#$%^&*()+=\[\]{}|\\;:'",./<>?`]/;
function sanitizeString(val) {
  if (typeof val === 'string') return val.replace(SPECIAL_CHAR_REGEX, '');
  if (Array.isArray(val)) return val.map(sanitizeString);
  if (val && typeof val === 'object') {
    const cleaned = {};
    for (const k in val) cleaned[k] = sanitizeString(val[k]);
    return cleaned;
  }
  return val;
}

function inputSanitize(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    const { avatar, manualImages, manualEmail, images, content, title, text, body, reason, answer, question, description, options, password, zhixuePassword, oldPwd, newPwd, adminPassword, newPassword, confirmPassword, oldPassword, plan, payment, cardCode, duration, ...rest } = req.body;
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
      ...(description !== undefined ? { description } : {}),
      ...(options !== undefined ? { options } : {}),
      ...(password !== undefined ? { password } : {}),
      ...(zhixuePassword !== undefined ? { zhixuePassword } : {}),
      ...(oldPwd !== undefined ? { oldPwd } : {}),
      ...(newPwd !== undefined ? { newPwd } : {}),
      ...(adminPassword !== undefined ? { adminPassword } : {}),
      ...(newPassword !== undefined ? { newPassword } : {}),
      ...(confirmPassword !== undefined ? { confirmPassword } : {}),
      ...(oldPassword !== undefined ? { oldPassword } : {}),
      ...(plan !== undefined ? { plan } : {}),
      ...(payment !== undefined ? { payment } : {}),
      ...(cardCode !== undefined ? { cardCode } : {}),
      ...(duration !== undefined ? { duration } : {})
    };
  }
  next();
}

module.exports = { requireAdmin, requireSuper, createCheckMaintenance, inputSanitize, rateLimitLogin, recordLoginFail };
