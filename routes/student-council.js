const { signToken, verifySignedToken, hashPassword, verifyPassword } = require('../lib/crypto');
const { broadcastSSE } = require('../lib/sse');
const { captchaStore } = require('../lib/state');
const db = require('../db');
const maintenance = require('../maintenance');

function readSC() { return db.readSC(); }
function writeSC(data) { db.writeSC(data); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }

module.exports = function(app) {

// 检查是否需要首次初始化
app.get('/api/student-council/check-init', (req, res) => {
  const sc = readSC();
  res.json({ ok: true, data: { needInit: !sc || !sc.id } });
});

// 首次初始化学生会账号
app.post('/api/student-council/init', (req, res) => {
  const { id, name, password } = req.body;
  if (!id || !name || !password) return res.json({ ok: false, msg: '请填写完整信息' });
  if (id.length < 3 || id.length > 20) return res.json({ ok: false, msg: '账号长度3-20位' });
  if (password.length < 6) return res.json({ ok: false, msg: '密码至少6位' });

  const sc = readSC();
  if (sc && sc.id) return res.json({ ok: false, msg: '学生会账号已存在' });

  writeSC({ id, name, password: hashPassword(password) });
  res.json({ ok: true, msg: '创建成功，请登录' });
});

// 验证学生会 token 是否有效
app.get('/api/student-council/me', (req, res) => {
  const token = req.headers['x-sc-token'];
  if (!token) return res.json({ ok: false, msg: '未登录' });
  const session = verifySignedToken(token);
  if (!session) return res.json({ ok: false, msg: 'token无效' });
  const sc = readSC();
  if (!sc) return res.json({ ok: false, msg: '学生会账号不存在' });
  res.json({ ok: true, data: { name: sc.name } });
});

// 学生会登录（支持原学生会账号 + 校园墙用户登录）
app.post('/api/student-council/login', (req, res) => {
  const { id, password, captchaId, captchaText } = req.body;

  // 滑块验证码校验（Bot-Testing 模式下跳过）
  if (captchaId && captchaText && !maintenance.isBotTesting()) {
    const entry = captchaStore.get(captchaId);
    if (!entry || !entry.verified) {
      return res.json({ ok: false, msg: '请完成人机验证' });
    }
    captchaStore.delete(captchaId);
  }

  if (!id || !password) return res.json({ ok: false, msg: '请输入账号和密码' });

  // 尝试原学生会账号登录
  const sc = readSC();
  if (sc && sc.id === id) {
    if (!verifyPassword(password, sc.password))
      return res.json({ ok: false, msg: '账号或密码错误' });
    const token = signToken({ id: sc.id, loginAt: Date.now() });
    return res.json({ ok: true, data: { token, name: sc.name, type: 'sc' } });
  }

  // 尝试校园墙用户登录（需 noticePublisher 权限）
  const users = readUsers();
  const user = users.find(u => (u.nickname === id || u.id === id) && u.noticePublisher && u.status !== 'banned');
  if (user) {
    if (!verifyPassword(password, user.password)) {
      return res.json({ ok: false, msg: '账号或密码错误' });
    }
    const token = signToken({ id: user.id, loginAt: Date.now() });
    return res.json({ ok: true, data: { token, name: user.nickname, type: 'user' } });
  }

  return res.json({ ok: false, msg: '账号或密码错误' });
});

};
