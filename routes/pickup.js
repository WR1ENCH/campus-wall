const { verifyUserToken, verifySignedToken } = require('../lib/crypto');
const { getClientIP } = require('../lib/helpers');
const { requireAdmin } = require('../lib/middleware');
const { broadcastSSE } = require('../lib/sse');
const db = require('../db');
const uniqueId = require('../lib/uniqueId');
const { check: checkSensitive } = require('../sensitiveWords');
const { check: checkBullyingNames } = require('../bullyingNames');
const { isFeatureBlocked } = require('../lib/penalty');
const credibility = require('../lib/credibility');
const { createReport } = require('../routes/reports');

function readPickupAuctions() { return db.readPickupAuctions(); }
function writePickupAuctions(data) { db.writePickupAuctions(data); broadcastSSE('pickupUpdate', { t: Date.now() }); }
function readPickupReports() { return db.readPickupReports(); }
function writePickupReports(data) { db.writePickupReports(data); }
function readUsers() { return db.readUsers(); }
function writeUsers(users) { db.writeUsers(users); }
function readNotices() { return db.readNotices(); }
function writeNotices(notices) { db.writeNotices(notices); broadcastSSE('noticeUpdate', { t: Date.now() }); }
function changeCredit(userId, amount, reason) {
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return false;
  user.credit = (user.credit || 0) + amount;
  writeUsers(users);
  const logs = db.readCreditLogs();
  logs.push({ id: 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), userId, amount, reason, createdAt: new Date().toISOString() });
  db.writeCreditLogs(logs);
  return true;
}

// ===== 校园墙拍卖系统 =====
const PICKUP_SLOTS = ['00-04', '04-08', '08-12', '12-16', '16-20', '20-23'];
const BASE_BID = 300;
const BID_STEP = 50;

module.exports = function(app) {

// 获取或创建今天某个时间槽的拍卖
function getOrCreateAuction(slot, dateStr) {
  let auctions = readPickupAuctions();
  let idx = auctions.findIndex(a => a.slot === slot && a.date === dateStr);
  if (idx === -1) {
    const newAuction = {
      id: uniqueId.generateId('AURQ'),
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

  // 信用分检测
  if (credibility.isFeatureBlocked(session.id, 'anonymous_post')) {
    return res.json({ ok: false, msg: '你的信用分不足，无法使用此功能', code: 'CREDIBILITY_BLOCKED' });
  }

  // 处罚限制检测
  if (isFeatureBlocked(session.id, 'auction')) {
    return res.json({ ok: false, code: 'PUNISHED', msg: '账号功能受限' });
  }

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
          const notificationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const notices = readNotices();
          notices.push({
            id: notificationId,
            title: '🏆 拍卖内容已通过审核',
            content: '你在 ' + auction.date + ' ' + slotLabelStr + ' 时段提交的拍卖内容已通过审核，即将在校园墙拍卖栏展示。\n\n📝 展示内容：' + (bid.content || '(未填写)'),
            author: '系统',
            auto: true,
            level: 'T0',
            createdAt: new Date().toISOString(),
      targetUserId: bid.userId
          });
          writeNotices(notices);
          // 同时写入 user_notifications 表
          db.addUserNotification({
            notificationId,
            userId: bid.userId,
            read: 0,
            createdAt: new Date().toISOString()
          });
        } else {
          // 拒绝：标记为rejected，退还冻结的credit
          auction.bids[bi].reviewStatus = 'rejected';
          changeCredit(auction.bids[bi].userId, auction.bids[bi].amount, '校园墙拍卖内容审核未通过 - 退还出价 ' + auction.bids[bi].amount + ' Credits');
          // 发送 T1 通知
          const bid = auction.bids[bi];
          const slotLabelStr = slotLabel(auction.slot);
          const notificationId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const notices = readNotices();
          notices.push({
            id: notificationId,
            title: '❌ 拍卖内容未通过审核',
            content: '你在 ' + auction.date + ' ' + slotLabelStr + ' 时段提交的拍卖内容未通过审核，已退还 ' + bid.amount + ' Credits。\n\n📝 内容：' + (bid.content || '(未填写)'),
            author: '系统',
            auto: true,
            level: 'T1',
            createdAt: new Date().toISOString(),
            targetUserId: bid.userId
          });
          writeNotices(notices);
          db.addUserNotification({
            notificationId,
            userId: bid.userId,
            read: 0,
            createdAt: new Date().toISOString()
          });
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

  // 同步创建统一举报记录（便于统一管理和用户安全中心查看）
  try {
    createReport({
      type: 'auction', targetId: foundBid.id,
      reason: (reason || '违规内容').trim().slice(0, 200),
      reporterId: session.id, reporterName: session.nickname || session.username,
      extra: { pickupBidId: foundBid.id, pickupSlot: foundAuction.slot, pickupDate: foundAuction.date }
    });
  } catch (e) { console.error('[pickup] 同步统一举报失败:', e.message); }

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
    // 通知举报人
    if (report.reporterId) {
      try {
        const nid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const notices = readNotices();
        notices.push({
          id: nid, title: '📋 拍卖内容举报已驳回',
          content: '你对拍卖栏"' + report.slotLabel + '"时段内容的举报经管理员核实，未发现违规行为，已驳回。',
          author: '系统', auto: true, level: 'T1',
          createdAt: new Date().toISOString(), targetUserId: report.reporterId
        });
        writeNotices(notices);
        db.addUserNotification({ notificationId: nid, userId: report.reporterId, read: 0, createdAt: new Date().toISOString() });
      } catch (e) { console.error('发送拍卖举报驳回通知失败:', e.message); }
    }
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

  // 通知举报人
  if (report.reporterId) {
    try {
      const nid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const notices = readNotices();
      notices.push({
        id: nid, title: '📋 拍卖内容举报已确认',
        content: '你对拍卖栏"' + report.slotLabel + '"时段内容的举报经管理员核实，确认违规，相关内容已下架。' + banMsg,
        author: '系统', auto: true, level: 'T1',
        createdAt: new Date().toISOString(), targetUserId: report.reporterId
      });
      writeNotices(notices);
      db.addUserNotification({ notificationId: nid, userId: report.reporterId, read: 0, createdAt: new Date().toISOString() });
    } catch (e) { console.error('发送拍卖举报确认通知失败:', e.message); }
  }

  res.json({
    ok: true,
    msg: '已确认违规：内容已下架，Credit 不予退还' + banMsg + replaceMsg
  });
});
};
