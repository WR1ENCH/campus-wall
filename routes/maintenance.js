const { signToken, verifySignedToken } = require('../lib/crypto');
const { requireAdmin } = require('../lib/middleware');
const { captchaStore } = require('../lib/state');
const db = require('../db');
const maintenance = require('../maintenance');

module.exports = function(app) {

// 公开接口：维护页面轮询用（不暴露敏感信息）
app.get('/api/maintenance/info', (req, res) => {
  try {
    const data = db.readMaintenance() || { enabled: false };
    res.json({
      ok: true,
      data: {
        enabled: data.enabled === true || data.enabled === 'true',
        message: data.message || null,
        updatedAt: data.updatedAt || null
      }
    });
  } catch (e) {
    res.json({ ok: true, data: { enabled: false } });
  }
});

// 公开：验证测试密钥 + 验证码，通过后返回临时访问令牌
app.post('/api/maintenance/verify', (req, res) => {
  const { testKey, captchaId, captchaText } = req.body;

  // 滑块验证码校验
  const entry = captchaStore.get(captchaId);
  if (!entry || !entry.verified) {
    return res.json({ ok: false, msg: '请完成人机验证' });
  }
  captchaStore.delete(captchaId);

  // 验证测试密钥
  const result = maintenance.verifyTestKey(testKey);
  if (!result.valid) {
    return res.json({ ok: false, msg: result.msg });
  }

  // 签发临时访问令牌（有效期 4 小时）
  const token = signToken({
    type: 'maintenance_bypass',
    issuedAt: Date.now(),
    loginAt: Date.now()
  });

  res.json({ ok: true, msg: '验证通过，正在进入…', data: { token } });
});

// 管理员：生成测试密钥
app.post('/api/admin/maintenance/test-key/create', requireAdmin, (req, res) => {
  try {
    const result = maintenance.createTestKey();
    res.json({ ok: true, data: result });
  } catch (e) {
    res.json({ ok: false, msg: '生成失败: ' + e.message });
  }
});

// 管理员：获取测试密钥列表
app.get('/api/admin/maintenance/test-key/list', requireAdmin, (req, res) => {
  try {
    const keys = maintenance.listTestKeys();
    res.json({ ok: true, data: keys });
  } catch (e) {
    res.json({ ok: false, msg: '获取失败' });
  }
});

// 管理员：删除测试密钥
app.delete('/api/admin/maintenance/test-key/:key', requireAdmin, (req, res) => {
  try {
    maintenance.deleteTestKey(req.params.key);
    res.json({ ok: true, msg: '已删除' });
  } catch (e) {
    res.json({ ok: false, msg: '删除失败' });
  }
});

};
