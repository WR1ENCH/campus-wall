const { hashPassword, verifyPassword, makeToken, verifySignedToken } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { requireAdmin, requireSuper, rateLimitLogin, recordLoginFail } = require('../lib/middleware');
const { readAdmins, writeAdmins, readLogs, writeLogs } = require('../db');
const { broadcastSSE } = require('../lib/sse');

function hasAdmins() {
  return readAdmins().length > 0;
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

module.exports = function(app, opts) {
  app.get('/api/admin/check-init', (req, res) => {
    res.json({ ok: true, data: { needInit: !hasAdmins() } });
  });

  app.post('/api/admin/init', (req, res) => {
    if (hasAdmins()) {
      return res.json({ ok: false, msg: '系统已初始化，请直接登录', code: 'ALREADY_INIT' });
    }
    const { id, password, name } = req.body;
    if (!id || !/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
      return res.json({ ok: false, msg: '账号格式：3-20位字母、数字、下划线', code: 'INVALID_ID' });
    }
    if (!password || password.length < 6) {
      return res.json({ ok: false, msg: '密码至少6位', code: 'INVALID_PWD' });
    }
    if (!name || name.trim().length === 0) {
      return res.json({ ok: false, msg: '请输入管理员昵称', code: 'INVALID_NAME' });
    }
    const newAdmin = {
      id: id.trim(),
      password: hashPassword(password),
      name: name.trim(),
      role: 'super',
      createdAt: new Date().toISOString()
    };
    writeAdmins([newAdmin]);
    console.log('✅ 首个管理员已创建: ' + id);
    res.json({
      ok: true,
      data: { token: makeToken(newAdmin), id: newAdmin.id, name: newAdmin.name, role: newAdmin.role }
    });
  });

  app.post('/api/admin/login', rateLimitLogin('id'), (req, res) => {
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
      recordLoginFail(res); // ponytail: 记一次失败，触发 ip|account 限流
      return res.json({ ok: false, msg: '账号或密码错误' });
    }
    addLoginLog('admin', admin.name, true, ip, ua);
    res.json({
      ok: true,
      data: { token: makeToken(admin), id: admin.id, name: admin.name, role: admin.role }
    });
  });

  app.post('/api/admin/change-pwd', requireAdmin, (req, res) => {
    const { oldPwd, newPwd } = req.body;
    if (!oldPwd || !newPwd) return res.json({ ok: false, msg: '请填写完整' });
    if (newPwd.length < 6) return res.json({ ok: false, msg: '新密码至少6位' });
    const admins = readAdmins();
    const idx = admins.findIndex(a => a.id === req.admin.id);
    if (idx === -1) return res.json({ ok: false, msg: '管理员不存在' });
    if (!verifyPassword(oldPwd, admins[idx].password)) {
      return res.json({ ok: false, msg: '旧密码错误' });
    }
    admins[idx].password = hashPassword(newPwd);
    writeAdmins(admins);
    res.json({ ok: true, msg: '密码修改成功，请重新登录' });
  });

  app.get('/api/admin/me', requireAdmin, (req, res) => {
    const admins = readAdmins();
    const admin = admins.find(a => a.id === req.admin.id);
    if (!admin) return res.json({ ok: false, msg: '管理员不存在', code: 'NOT_FOUND' });
    res.json({ ok: true, data: { id: admin.id, name: admin.name, role: admin.role } });
  });

  app.get('/api/admin/login-logs', requireAdmin, (req, res) => {
    const logs = readLogs();
    res.json({ ok: true, data: logs });
  });

  app.get('/api/admin/list', requireAdmin, requireSuper, (req, res) => {
    const admins = readAdmins();
    res.json({
      ok: true,
      data: admins.map(a => ({ id: a.id, name: a.name, role: a.role, createdAt: a.createdAt }))
    });
  });

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
    admins.push({ id, password: hashPassword(password), name, role, createdAt: new Date().toISOString() });
    writeAdmins(admins);
    res.json({ ok: true, data: { id, name, role, createdAt: new Date().toISOString() } });
  });

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
};
