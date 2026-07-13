// ===== routes/penalty.js - 处罚管理 / 申诉 / 安全中心 =====
const db = require('../db');
const { generateId, logIdAssignment } = require('../lib/uniqueId');
const { requireAdmin, requireSuper } = require('../lib/middleware');
const { verifyUserToken } = require('../lib/crypto');
const penalty = require('../lib/penalty');

function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readPunishments() { return db.readPunishments(); }
function writePunishments(data) { db.writePunishments(data); }
function readAppeals() { return db.readAppeals(); }
function writeAppeals(data) { db.writeAppeals(data); }
function readReports() { return db.readReports(); }

// 计算过期时间
function calcExpiresAt(durationDays) {
  if (!durationDays || durationDays === 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + durationDays);
  return d.toISOString();
}

// 被举报内容冗余（取证据快照）
function getEvidenceFromReport(sourceReportId) {
  if (!sourceReportId) return null;
  const report = readReports().find(r => r.reportId === sourceReportId);
  if (!report) return null;
  let evidence = {};
  try { evidence = report.evidenceContent ? JSON.parse(report.evidenceContent) : {}; } catch { evidence = {}; }
  return evidence;
}

module.exports = function (app) {
  // ===================== 管理员：处罚管理 =====================

  // 处罚列表
  app.get('/api/admin/punishments', requireAdmin, (req, res) => {
    const list = readPunishments();
    const { status, userId } = req.query;
    let filtered = list;
    if (status) filtered = filtered.filter(p => p.status === status);
    if (userId) filtered = filtered.filter(p => p.userId === userId);
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    // 附带用户名
    const users = readUsers();
    const enriched = filtered.map(p => {
      const u = users.find(u => u.id === p.userId);
      return { ...p, userNickname: u ? u.nickname : '未知', userUid: u ? u.uid : null };
    });
    res.json({ ok: true, data: enriched });
  });

  // 申诉列表（管理员，关联处罚 + 用户信息）
  app.get('/api/admin/appeals', requireAdmin, (req, res) => {
    const { status } = req.query;
    let filtered = readAppeals();
    if (status) filtered = filtered.filter(a => a.status === status);
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const punishments = readPunishments();
    const users = readUsers();
    const enriched = filtered.map(a => {
      const p = punishments.find(x => x.punishmentId === a.punishmentId) || null;
      const u = p ? users.find(x => x.id === p.userId) : null;
      return {
        ...a,
        punishment: p ? {
          punishmentId: p.punishmentId, level: p.level, reason: p.reason,
          status: p.status, measures: p.measures, durationDays: p.durationDays,
          expiresAt: p.expiresAt, appealStatus: p.appealStatus,
        } : null,
        userNickname: u ? u.nickname : '未知',
        userUid: u ? u.uid : null,
      };
    });
    res.json({ ok: true, data: enriched });
  });

  // 处罚详情（含证据快照 + 关联申诉记录）
  app.get('/api/admin/punishments/:id', requireAdmin, (req, res) => {
    const list = readPunishments();
    const p = list.find(x => x.punishmentId === req.params.id);
    if (!p) return res.json({ ok: false, msg: '处罚记录不存在' });
    const evidence = getEvidenceFromReport(p.sourceReportId);
    const appeals = readAppeals().filter(a => a.punishmentId === p.punishmentId);
    const users = readUsers();
    const u = users.find(u => u.id === p.userId);
    res.json({ ok: true, data: { ...p, evidence, appeals, userNickname: u ? u.nickname : '未知', userUid: u ? u.uid : null } });
  });

  // 新建处罚（管理员按 UID 直接创建 / 从举报处理）
  app.post('/api/admin/punishments', requireAdmin, (req, res) => {
    const { userId, level, measures, reason, durationDays, sourceReportId } = req.body;
    if (!userId) return res.json({ ok: false, msg: '缺少被处罚用户ID' });
    if (!level || !['T0', 'T1'].includes(level)) return res.json({ ok: false, msg: '处罚级别无效' });
    if (!reason || !reason.trim()) return res.json({ ok: false, msg: '请填写违规原因' });
    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.json({ ok: false, msg: '用户不存在' });
    if (level === 'T1' && (!measures || !Array.isArray(measures) || measures.length === 0)) {
      return res.json({ ok: false, msg: 'T1 处罚至少选择一个限制措施' });
    }
    const punishmentId = generateId('PUNI');
    const now = new Date().toISOString();
    const p = {
      punishmentId,
      userId,
      level,
      reason: reason.trim(),
      measures: level === 'T0' ? JSON.stringify(penalty.FEATURES) : JSON.stringify(measures || []),
      durationDays: durationDays || 0,
      status: 'active',
      sourceReportId: sourceReportId || null,
      appealUsed: 0,
      appealStatus: 'none',
      createdAt: now,
      expiresAt: calcExpiresAt(durationDays),
      revokedAt: null,
      revokedBy: null,
    };
    db.insertPunishment(p);
    logIdAssignment('punishment', punishmentId, (reason || '').slice(0, 100), db);

    // 如果是从举报处理而来，更新举报的处理结果
    if (sourceReportId) {
      const reports = readReports();
      const report = reports.find(r => r.reportId === sourceReportId);
      if (report) {
        report.handledResult = 'violation';
        report.punishmentId = punishmentId;
        report.status = 'resolved';
        report.handledBy = req.admin.id;
        report.handledAt = now;
        db.writeReports(reports);
        // 通知举报人
        if (report.reportedBy) {
          penalty.notifyReportReceived(report.reportedBy, sourceReportId,
            '举报类型：' + (report.type || '') + '\n举报原因：' + (report.reason || '') + '\n\n已确认违规并施加处罚，感谢你的举报！');
        }
      }
    }

    // 发 T0 处罚通知给被处罚者
    penalty.notifyPunishmentIssued(userId, punishmentId, p);
    res.json({ ok: true, data: { punishmentId } });
  });

  // 撤销处罚
  app.post('/api/admin/punishments/:id/revoke', requireAdmin, (req, res) => {
    const list = readPunishments();
    const p = list.find(x => x.punishmentId === req.params.id);
    if (!p) return res.json({ ok: false, msg: '处罚记录不存在' });
    if (p.status !== 'active') return res.json({ ok: false, msg: '该处罚已不是active状态，无需撤销' });
    const now = new Date().toISOString();
    db.updatePunishment(p.punishmentId, { status: 'revoked', revokedAt: now, revokedBy: req.admin.id });
    res.json({ ok: true, msg: '处罚已撤销' });
  });

  // 处理申诉（管理员：通过/驳回）
  app.post('/api/admin/punishments/:id/appeal-action', requireAdmin, (req, res) => {
    const { action, note } = req.body;
    if (!['approved', 'rejected'].includes(action)) return res.json({ ok: false, msg: '操作无效' });
    const list = readPunishments();
    const p = list.find(x => x.punishmentId === req.params.id);
    if (!p) return res.json({ ok: false, msg: '处罚记录不存在' });
    if (p.appealStatus !== 'pending') return res.json({ ok: false, msg: '没有待处理的申诉' });

    const now = new Date().toISOString();
    const appeals = readAppeals();
    const appeal = appeals.find(a => a.punishmentId === p.punishmentId && a.status === 'pending');
    if (appeal) {
      db.updateAppeal(appeal.id, { status: action, handledAt: now, handledBy: req.admin.id, resultNote: note || '' });
    }

    if (action === 'approved') {
      db.updatePunishment(p.punishmentId, { appealStatus: 'approved', status: 'revoked', revokedAt: now, revokedBy: req.admin.id });
      penalty.notifyAppealResult(p.userId, p.punishmentId, true, note);
      res.json({ ok: true, msg: '申诉通过，处罚已撤销' });
    } else {
      db.updatePunishment(p.punishmentId, { appealStatus: 'rejected' });
      penalty.notifyAppealResult(p.userId, p.punishmentId, false, note);
      res.json({ ok: true, msg: '申诉已驳回' });
    }
  });

  // ===================== 用户：处罚与安全中心 =====================

  // 我的处罚列表
  app.get('/api/user/punishments', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const list = readPunishments().filter(p => p.userId === session.id);
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const active = list.filter(p => p.status === 'active' && !(p.expiresAt && Date.now() >= new Date(p.expiresAt).getTime()));
    const history = list.filter(p => p.status !== 'active' || (p.expiresAt && Date.now() >= new Date(p.expiresAt).getTime()));
    res.json({ ok: true, data: { active, history } });
  });

  // 处罚详情（含证据快照 + 可申诉状态）
  app.get('/api/user/punishments/:id', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const list = readPunishments();
    const p = list.find(x => x.punishmentId === req.params.id && x.userId === session.id);
    if (!p) return res.json({ ok: false, msg: '处罚记录不存在' });
    const evidence = getEvidenceFromReport(p.sourceReportId);
    const canAppeal = p.status === 'active' && !p.appealUsed;
    res.json({ ok: true, data: { ...p, evidence, canAppeal } });
  });

  // 提交申诉
  app.post('/api/user/punishments/:id/appeal', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });
    const { content } = req.body;
    if (!content || !content.trim()) return res.json({ ok: false, msg: '请填写申诉说明' });
    const list = readPunishments();
    const p = list.find(x => x.punishmentId === req.params.id && x.userId === session.id);
    if (!p) return res.json({ ok: false, msg: '处罚记录不存在' });
    if (p.appealUsed) return res.json({ ok: false, msg: '该处罚已使用过申诉机会' });
    if (p.status !== 'active') return res.json({ ok: false, msg: '该处罚已非active状态，无法申诉' });

    const appealId = generateId('APP');
    const now = new Date().toISOString();
    db.insertAppeal({
      id: appealId,
      punishmentId: p.punishmentId,
      userId: session.id,
      content: content.trim(),
      status: 'pending',
      createdAt: now,
      handledAt: null,
      handledBy: null,
      resultNote: null,
    });
    db.updatePunishment(p.punishmentId, { appealUsed: 1, appealStatus: 'pending' });
    logIdAssignment('appeal', appealId, (content || '').slice(0, 100), db);
    penalty.notifyAppealSubmitted(session.id, p.punishmentId);
    res.json({ ok: true, data: { appealId } });
  });

  // 安全中心聚合数据
  app.get('/api/user/safety-center', (req, res) => {
    const token = req.headers['x-user-token'];
    const session = verifyUserToken(token);
    if (!session) return res.json({ ok: false, msg: '请先登录', code: 'NOT_LOGIN' });

    const allPunishments = readPunishments().filter(p => p.userId === session.id);
    allPunishments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const now = Date.now();
    const activePunishment = allPunishments.find(p => p.status === 'active' && !(p.expiresAt && now >= new Date(p.expiresAt).getTime())) || null;
    const history = allPunishments.filter(p => p.status !== 'active' || (p.expiresAt && now >= new Date(p.expiresAt).getTime()));

    // 我的举报
    const reports = readReports().filter(r => r.reportedBy === session.id);
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const myReports = reports.map(r => ({
      reportId: r.reportId, type: r.type, reason: r.reason,
      status: r.status, handledResult: r.handledResult,
      punishmentId: r.punishmentId, createdAt: r.createdAt,
    }));

    res.json({ ok: true, data: { activePunishment, history, myReports } });
  });
};

module.exports.penalty = penalty;
