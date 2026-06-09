// ===== db.js - SQLite 数据库模块 =====
// 替代 JSON 文件存储，提供与原来完全相同的 readXxx / writeXxx 接口

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'campus.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

// ---- helpers ----
function all(table) {
  try {
    return getDb().prepare(`SELECT * FROM "${table}"`).all();
  } catch { return []; }
}

function toSqlValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function dropAndInsert(table, rows) {
  const d = getDb();
  const tx = d.transaction(() => {
    d.exec(`DELETE FROM "${table}"`);
    if (!rows || rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const ph = cols.map(() => '?').join(',');
    const ins = d.prepare(`INSERT INTO "${table}" (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${ph})`);
    for (const row of rows) {
      const vals = cols.map(c => toSqlValue(row[c]));
      try { ins.run(vals); } catch (e) { console.error('[db.js] INSERT failed:', e.message); }
    }
  });
  tx();
}

function getById(table, id) {
  try {
    return getDb().prepare(`SELECT * FROM "${table}" WHERE "id" = ?`).get(id) || null;
  } catch { return null; }
}

// ---- 兼容原 read/write 接口 ----

// Posts
function readPosts() { return all('posts'); }
function writePosts(data) { dropAndInsert('posts', data); }

// Admins
function readAdmins() { return all('admins'); }
function writeAdmins(data) { dropAndInsert('admins', data); }

// Users
function readUsers() { return all('users'); }
function writeUsers(data) { dropAndInsert('users', data); }

// Trust tokens
function readTrustTokens() {
  const rows = all('trust_tokens');
  // 原格式是 { token: { userId, userAgent, createdAt, expiresAt } }
  const map = {};
  for (const r of rows) {
    let key = r._key || r.token;
    if (!key) continue;
    const { _key, token, ...rest } = r;
    map[key] = { ...rest };
    if (r.userAgent !== undefined) map[key].userAgent = r.userAgent;
    if (r.userId !== undefined) map[key].userId = r.userId;
    if (r.createdAt !== undefined) map[key].createdAt = r.createdAt;
    if (r.expiresAt !== undefined) map[key].expiresAt = r.expiresAt;
  }
  return map;
}
function writeTrustTokens(map) {
  const d = getDb();
  d.exec('DELETE FROM "trust_tokens"');
  if (!map || typeof map !== 'object') return;
  const cols = ['_key', 'userId', 'userAgent', 'createdAt', 'expiresAt'];
  d.exec(`CREATE TABLE IF NOT EXISTS "trust_tokens" ("_key" TEXT, "userId" TEXT, "userAgent" TEXT, "createdAt" TEXT, "expiresAt" TEXT)`);
  const ins = d.prepare('INSERT INTO "trust_tokens" (_key, userId, userAgent, createdAt, expiresAt) VALUES (?,?,?,?,?)');
  const tx = d.transaction((entries) => {
    for (const [key, val] of entries) {
      ins.run(key, val.userId || null, val.userAgent || null, val.createdAt || null, val.expiresAt || null);
    }
  });
  tx(Object.entries(map));
}

// Logs
function readLogs() { return all('login_logs'); }
function writeLogs(data) { dropAndInsert('login_logs', data); }

// Reports
function readReports() { return all('reports'); }
function writeReports(data) { dropAndInsert('reports', data); }

// Feedbacks
function readFeedbacks() { return all('feedbacks'); }
function writeFeedbacks(data) { dropAndInsert('feedbacks', data); }

// Bullying
function readBullying() { return all('bullying'); }
function writeBullying(data) { dropAndInsert('bullying', data); }

// Credit logs
function readCreditLogs() { return all('credit_logs'); }
function writeCreditLogs(data) { dropAndInsert('credit_logs', data); }

// Credit cards
function readCreditCards() { return all('credit_cards'); }
function writeCreditCards(data) { dropAndInsert('credit_cards', data); }

// Announcement
function readAnnouncement() {
  const row = getDb().prepare('SELECT * FROM "announcement" LIMIT 1').get();
  if (!row) return null;
  const { _id, ...rest } = row;
  return rest;
}
function writeAnnouncement(data) {
  const d = getDb();
  d.exec('DELETE FROM "announcement"');
  if (!data) return;
  const cols = Object.keys(data);
  const ph = cols.map(() => '?').join(',');
  d.prepare(`INSERT INTO "announcement" (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${ph})`).run(cols.map(c => data[c]));
}

// Discussions
function readDiscussions() { return all('discussions'); }
function writeDiscussions(data) { dropAndInsert('discussions', data); }

// Discussion comments
function readDiscussionComments() { return all('discussion_comments'); }
function writeDiscussionComments(data) { dropAndInsert('discussion_comments', data); }

// QA
function readQAQuestions() { return all('qa_questions'); }
function writeQAQuestions(data) { dropAndInsert('qa_questions', data); }
function readQAAnswers() { return all('qa_answers'); }
function writeQAAnswers(data) { dropAndInsert('qa_answers', data); }

// Pickup auctions
function readPickupAuctions() { return all('pickup_auctions'); }
function writePickupAuctions(data) { dropAndInsert('pickup_auctions', data); }
function readPickupReports() { return all('pickup_reports'); }
function writePickupReports(data) { dropAndInsert('pickup_reports', data); }

// Student council
function readSC() {
  const row = getDb().prepare('SELECT * FROM "student_council" LIMIT 1').get();
  return row || null;
}
function writeSC(data) {
  const d = getDb();
  d.exec('DELETE FROM "student_council"');
  if (!data) return;
  const cols = Object.keys(data);
  d.prepare(`INSERT INTO "student_council" (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(cols.map(c => data[c]));
}

// Notices
function readNotices() { return all('notices'); }
function writeNotices(data) { dropAndInsert('notices', data); }

// Passkey
function readPasskey() {
  const row = getDb().prepare('SELECT * FROM "notice_passkey" LIMIT 1').get();
  return row || null;
}
function writePasskey(data) {
  const d = getDb();
  d.exec('DELETE FROM "notice_passkey"');
  if (!data || Object.keys(data).length === 0) return;
  const cols = Object.keys(data);
  d.prepare(`INSERT INTO "notice_passkey" (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
    .run(cols.map(c => data[c]));
}

// Apps (notice applications)
function readApps() { return all('notice_applications'); }
function writeApps(data) { dropAndInsert('notice_applications', data); }

// ===== 导出 =====
module.exports = {
  readPosts, writePosts,
  readAdmins, writeAdmins,
  readUsers, writeUsers,
  readTrustTokens, writeTrustTokens,
  readLogs, writeLogs,
  readReports, writeReports,
  readFeedbacks, writeFeedbacks,
  readBullying, writeBullying,
  readCreditLogs, writeCreditLogs,
  readCreditCards, writeCreditCards,
  readAnnouncement, writeAnnouncement,
  readDiscussions, writeDiscussions,
  readDiscussionComments, writeDiscussionComments,
  readQAQuestions, writeQAQuestions,
  readQAAnswers, writeQAAnswers,
  readPickupAuctions, writePickupAuctions,
  readPickupReports, writePickupReports,
  readSC, writeSC,
  readNotices, writeNotices,
  readPasskey, writePasskey,
  readApps, writeApps,
};
