// ===== routes/penalty.js - 处罚管理 / 申诉 / 安全中心 =====
const db = require('../db');
const { generateId, logIdAssignment } = require('../lib/uniqueId');
const { requireAdmin, requireSuper } = require('../lib/middleware');
const { verifyUserToken } = require('../lib/crypto');
const penalty = require('../lib/penalty');
const credibility = require('../lib/credibility');

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
  // 处罚自动叠加：同级别合并措施+最长时长，T0升级覆盖T1，T1在T0生效期间入队等待
  app.post('/api/admin/punishments', requireAdmin, (req, res) => {
    const { userId, level, measures, reason, durationDays, sourceReportId, credibilityDeduction } = req.body;
    if (!userId) return res.json({ ok: false, msg: '缺少被处罚用户ID' });
    if (!level || !['T0', 'T1'].includes(level)) return res.json({ ok: false, msg: '处罚级别无效' });
    if (!reason || !reason.trim()) return res.json({ ok: false, msg: '请填写违规原因' });
    const credDeduct = Math.max(0, parseInt(credibilityDeduction) || 0);
    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return res.json({ ok: false, msg: '用户不存在' });
    if (level === 'T1' && (!measures || !Array.isArray(measures) || measures.length === 0)) {
      return res.json({ ok: false, msg: 'T1 处罚至少选择一个限制措施' });
    }

    const now = new Date().toISOString();
    const nowTs = Date.now();
    const punishments = readPunishments();
    const existingActive = punishments.filter(p => p.userId === userId && p.status === 'active' && !(p.expiresAt && nowTs >= new Date(p.expiresAt).getTime()));
    const existingT0 = existingActive.find(p => p.level === 'T0');
    const existingT1 = existingActive.find(p => p.level === 'T1');

    // ===== T0 处罚 =====
    if (level === 'T0') {
      if (existingT0) {
        // T0 + T0: 合并到已有处罚，取最长时长
        existingT0.durationDays = Math.max(existingT0.durationDays || 0, durationDays || 0);
        existingT0.expiresAt = existingT0.durationDays ? calcExpiresAt(existingT0.durationDays) : null;
        existingT0.reason = existingT0.reason + '\n' + reason.trim();
        existingT0.credibilityDeducted = (existingT0.credibilityDeducted || 0) + credDeduct;
        db.updatePunishment(existingT0.punishmentId, existingT0);
        if (existingT1 && existingT1.status === 'active') {
          existingT1.status = 'overridden';
          db.updatePunishment(existingT1.punishmentId, existingT1);
        }
        if (credDeduct > 0) {
          credibility.deductCredibility(userId, credDeduct, '违规处罚追加扣除信用分: ' + (reason || '').slice(0, 100));
        }
        // 更新关联举报
        if (sourceReportId) {
          const report = readReports().find(r => r.reportId === sourceReportId);
          if (report) { report.handledResult = 'violation'; report.punishmentId = existingT0.punishmentId; report.status = 'resolved'; report.handledBy = req.admin.id; report.handledAt = now; db.writeReports(readReports()); }
        }
        penalty.notifyPunishmentIssued(userId, existingT0.punishmentId, existingT0);
        return res.json({ ok: true, data: { punishmentId: existingT0.punishmentId, stacked: true, msg: '已合并到现有T0处罚' } });
      }

      // 没有已有 T0，正常创建
      const punishmentId = generateId('PUNI');
      const p = {
        punishmentId, userId, level, reason: reason.trim(),
        measures: JSON.stringify(penalty.FEATURES),
        durationDays: durationDays || 0, status: 'active',
        sourceReportId: sourceReportId || null,
        appealUsed: 0, appealStatus: 'none',
        createdAt: now, expiresAt: calcExpiresAt(durationDays),
        revokedAt: null, revokedBy: null,
        credibilityDeducted: credDeduct || 0,
      };
      db.insertPunishment(p);
      logIdAssignment('punishment', punishmentId, (reason || '').slice(0, 100), db);
      if (credDeduct > 0) {
        credibility.deductCredibility(userId, credDeduct, '违规处罚扣除信用分: ' + (reason || '').slice(0, 100));
      }

      if (existingT1) {
        // T0 + 已有T1: 先执行T0，T1入队等T0结束再执行
        existingT1.status = 'queued';
        existingT1.queuedAfter = punishmentId;
        db.updatePunishment(existingT1.punishmentId, existingT1);
      }
      if (sourceReportId) {
        const report = readReports().find(r => r.reportId === sourceReportId);
        if (report) { report.handledResult = 'violation'; report.punishmentId = punishmentId; report.status = 'resolved'; report.handledBy = req.admin.id; report.handledAt = now; db.writeReports(readReports()); }
      }
      penalty.notifyPunishmentIssued(userId, punishmentId, p);
      return res.json({ ok: true, data: { punishmentId } });
    }

    // ===== T1 处罚 =====
    if (level === 'T1') {
      if (existingT1) {
        // T1 + T1: 合并措施（去重并集）+ 取最长时长
        const existingMeasures = new Set(penalty.parseMeasures(existingT1.measures));
        (measures || []).forEach(m => existingMeasures.add(m));
        existingT1.measures = JSON.stringify([...existingMeasures]);
        existingT1.durationDays = Math.max(existingT1.durationDays || 0, durationDays || 0);
        existingT1.expiresAt = existingT1.durationDays ? calcExpiresAt(existingT1.durationDays) : null;
        existingT1.reason = existingT1.reason + '\n' + reason.trim();
        existingT1.credibilityDeducted = (existingT1.credibilityDeducted || 0) + credDeduct;
        db.updatePunishment(existingT1.punishmentId, existingT1);
        if (credDeduct > 0) {
          credibility.deductCredibility(userId, credDeduct, '违规合并处罚追加扣除信用分: ' + (reason || '').slice(0, 100));
        }
        if (sourceReportId) {
          const report = readReports().find(r => r.reportId === sourceReportId);
          if (report) { report.handledResult = 'violation'; report.punishmentId = existingT1.punishmentId; report.status = 'resolved'; report.handledBy = req.admin.id; report.handledAt = now; db.writeReports(readReports()); }
        }
        penalty.notifyPunishmentIssued(userId, existingT1.punishmentId, existingT1);
        return res.json({ ok: true, data: { punishmentId: existingT1.punishmentId, stacked: true, msg: '已合并到现有T1处罚' } });
      }

      if (existingT0) {
        // T1 + 已有T0: 先执行T0，T1入队等待（T0结束后自动激活）
        const punishmentId = generateId('PUNI');
        const p = {
          punishmentId, userId, level: 'T1',
          reason: reason.trim(),
          measures: JSON.stringify(measures || []),
          durationDays: durationDays || 0,
          status: 'queued',
          sourceReportId: sourceReportId || null,
          appealUsed: 0, appealStatus: 'none',
          createdAt: now, expiresAt: calcExpiresAt(durationDays),
          revokedAt: null, revokedBy: null,
          queuedAfter: existingT0.punishmentId,
          credibilityDeducted: credDeduct || 0,
        };
        db.insertPunishment(p);
        logIdAssignment('punishment', punishmentId, (reason || '').slice(0, 100), db);
        if (credDeduct > 0) {
          credibility.deductCredibility(userId, credDeduct, '违规入队处罚扣除信用分: ' + (reason || '').slice(0, 100));
        }
        if (sourceReportId) {
          const report = readReports().find(r => r.reportId === sourceReportId);
          if (report) { report.handledResult = 'violation'; report.punishmentId = punishmentId; report.status = 'resolved'; report.handledBy = req.admin.id; report.handledAt = now; db.writeReports(readReports()); }
        }
        penalty.emitUserNotice(userId, '⚠️ 待执行处罚',
          '经校园墙安全中心认定，你的账号由于违反《校园墙用户公约》，有一条新的处罚记录将在当前处罚结束后自动生效。\n\n如需了解详情请前往「安全中心」。', 'T1');
        return res.json({ ok: true, data: { punishmentId, queued: true, msg: 'T0生效期间，T1处罚已入队等待' } });
      }

      // 没有已有处罚，正常创建 T1
      const punishmentId = generateId('PUNI');
      const p = {
        punishmentId, userId, level, reason: reason.trim(),
        measures: JSON.stringify(measures || []),
        durationDays: durationDays || 0, status: 'active',
        sourceReportId: sourceReportId || null,
        appealUsed: 0, appealStatus: 'none',
        createdAt: now, expiresAt: calcExpiresAt(durationDays),
        revokedAt: null, revokedBy: null,
        credibilityDeducted: credDeduct || 0,
      };
      db.insertPunishment(p);
      logIdAssignment('punishment', punishmentId, (reason || '').slice(0, 100), db);
      if (credDeduct > 0) {
        credibility.deductCredibility(userId, credDeduct, '违规处罚扣除信用分: ' + (reason || '').slice(0, 100));
      }
      if (sourceReportId) {
        const report = readReports().find(r => r.reportId === sourceReportId);
        if (report) { report.handledResult = 'violation'; report.punishmentId = punishmentId; report.status = 'resolved'; report.handledBy = req.admin.id; report.handledAt = now; db.writeReports(readReports()); }
      }
      penalty.notifyPunishmentIssued(userId, punishmentId, p);
      return res.json({ ok: true, data: { punishmentId } });
    }

    return res.json({ ok: false, msg: '无效的处罚级别' });
  });

  // 撤销处罚
  app.post('/api/admin/punishments/:id/revoke', requireAdmin, (req, res) => {
    const list = readPunishments();
    const p = list.find(x => x.punishmentId === req.params.id);
    if (!p) return res.json({ ok: false, msg: '处罚记录不存在' });
    if (p.status !== 'active') return res.json({ ok: false, msg: '该处罚已不是active状态，无需撤销' });
    const now = new Date().toISOString();
    const deducted = p.credibilityDeducted || 0;
    db.updatePunishment(p.punishmentId, { status: 'revoked', revokedAt: now, revokedBy: req.admin.id });
    if (deducted > 0) {
      credibility.restoreCredibility(p.userId, deducted, '处罚撤销，返还信用分');
    }
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
      const deducted = p.credibilityDeducted || 0;
      if (deducted > 0) {
        credibility.restoreCredibility(p.userId, deducted, '申诉通过，返还信用分');
      }
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
