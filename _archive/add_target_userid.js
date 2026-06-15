const fs = require('fs');
let c = fs.readFileSync('C:\\Users\\wyxgg\\Desktop\\test\\server.js', 'utf8');

// === 1. Add targetUserId to each auto notice ===

// Helper: after "createdAt: new Date().toISOString()" insert targetUserId
const patternEnd = "createdAt: new Date().toISOString()";
const patterns = [
  // Report notice - has post.id
  { 
    search: "title: '📮 举报已收到'",
    insertAfter: patternEnd,
    insert: ',',
    targetUserId: 'null /* public-ish, but user-specific */'
  },
];

// Report submit: has `session.id` available
let idx = c.indexOf("title: '📮 举报已收到'");
if (idx > 0) {
  // Find the createdAt line and insert targetUserId: session.id after it
  let createdIdx = c.indexOf(patternEnd, idx);
  if (createdIdx > 0) {
    let end = createdIdx + patternEnd.length;
    // Check if already added
    if (!c.slice(end, end + 30).includes('targetUserId')) {
      // Find session.id from the enclosing function - it's in req body handler
      c = c.slice(0, end) + ',\n      targetUserId: session.id' + c.slice(end);
      console.log('Added targetUserId to report notice');
    }
  }
}

// Bully report: has reporterUserId
idx = c.indexOf("title: '🛡️ 霸凌举报已收到'");
if (idx > 0) {
  let createdIdx = c.indexOf(patternEnd, idx);
  if (createdIdx > 0) {
    let end = createdIdx + patternEnd.length;
    if (!c.slice(end, end + 30).includes('targetUserId')) {
      c = c.slice(0, end) + ',\n      targetUserId: reporterUserId' + c.slice(end);
      console.log('Added targetUserId to bully report notice');
    }
  }
}

// Bully review: has reports[idx].userId
idx = c.indexOf("title: '🛡️ 霸凌举报已确认处理'");
if (idx > 0) {
  let createdIdx = c.indexOf(patternEnd, idx);
  if (createdIdx > 0) {
    let end = createdIdx + patternEnd.length;
    if (!c.slice(end, end + 30).includes('targetUserId')) {
      c = c.slice(0, end) + ',\n      targetUserId: reports[idx].userId' + c.slice(end);
      console.log('Added targetUserId to bully review notice');
    }
  }
}

// Auction approve: has bid.userId
idx = c.indexOf("title: '🏆 拍卖内容已通过审核'");
if (idx > 0) {
  let createdIdx = c.indexOf(patternEnd, idx);
  if (createdIdx > 0) {
    let end = createdIdx + patternEnd.length;
    if (!c.slice(end, end + 30).includes('targetUserId')) {
      c = c.slice(0, end) + ',\n      targetUserId: bid.userId' + c.slice(end);
      console.log('Added targetUserId to auction notice');
    }
  }
}

// === 2. Create GET /api/user/notifications endpoint ===
// Insert before the existing GET /api/notices
const noticesEndpoint = "// 获取通知列表（公开，过滤已删除）";
const userNotifEndpoint = `
// 获取用户个人通知（系统自动发送的专属通知）
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

` + noticesEndpoint;

if (c.includes(noticesEndpoint) && !c.includes("/api/user/notifications")) {
  c = c.replace(noticesEndpoint, userNotifEndpoint);
  console.log('Added GET /api/user/notifications endpoint');
}

// === 3. Update public GET /api/notices to only show notices WITHOUT targetUserId ===
const oldPublicFilter = "notices.filter(n => !n.deleted && n.auto !== true)";
const newPublicFilter = "notices.filter(n => !n.deleted && n.auto !== true && !n.targetUserId)";
if (c.includes(oldPublicFilter)) {
  c = c.replace(oldPublicFilter, newPublicFilter);
  console.log('Updated public notices filter');
}

fs.writeFileSync('C:\\Users\\wyxgg\\Desktop\\test\\server.js', c, 'utf8');
console.log('Done');
