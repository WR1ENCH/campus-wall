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
    migrate();
  }
  return db;
}

// ===== 自动迁移：新增列和表 =====
function migrate() {
  // 创建 deleted_items 表（如果不存在）
  db.exec(`CREATE TABLE IF NOT EXISTS "deleted_items" (
    "_id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "id" TEXT, "type" TEXT, "content" TEXT,
    "author" TEXT, "userId" TEXT,
    "deletedAt" TEXT, "deletedBy" TEXT,
    "extra" TEXT
  )`);
  // 创建 votes 表（投票功能）
  db.exec(`CREATE TABLE IF NOT EXISTS "votes" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "author" TEXT,
    "avatar" TEXT,
    "title" TEXT,
    "options" TEXT,
    "multiple" INTEGER,
    "endTime" TEXT,
    "createdAt" TEXT,
    "deleted" INTEGER
  )`);
  // 创建 vote_records 表（投票记录）
  db.exec(`CREATE TABLE IF NOT EXISTS "vote_records" (
    "id" TEXT PRIMARY KEY,
    "voteId" TEXT,
    "optionId" TEXT,
    "userId" TEXT,
    "createdAt" TEXT
  )`);
  // 创建 vote_ip_records 表（IP 投票记录，用于同 IP 去重）
  db.exec(`CREATE TABLE IF NOT EXISTS "vote_ip_records" (
    "id" TEXT PRIMARY KEY,
    "voteId" TEXT,
    "ip" TEXT,
    "userId" TEXT,
    "createdAt" TEXT
  )`);
  // 已有表的列迁移
  const tableMigrations = [
    { name: 'posts', columns: ['images', 'discussionId', 'likedBy', 'comments', 'commentsCount'] },
  ];
  for (const t of tableMigrations) {
    let existingCols = [];
    try {
      const colInfo = db.prepare(`PRAGMA table_info("${t.name}")`).all();
      existingCols = colInfo.map(r => r.name);
    } catch { continue; }
    for (const col of t.columns) {
      if (!existingCols.includes(col)) {
        try {
          db.exec(`ALTER TABLE "${t.name}" ADD COLUMN "${col}" TEXT`);
          console.log(`[db.js] ✅ 已添加列 ${t.name}.${col}`);
        } catch (e) {
          console.warn(`[db.js] ⚠️ 添加列 ${t.name}.${col} 失败:`, e.message);
        }
      }
    }
  }
}

// ---- helpers ----
function tryParse(v) {
  if (typeof v !== 'string') return v;
  // 解析布尔值
  if (v === 'true') return true;
  if (v === 'false') return false;
  // 尝试解析 JSON 数组或对象
  if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'))) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

function all(table) {
  try {
    const rows = getDb().prepare(`SELECT * FROM "${table}"`).all();
    // 自动恢复 JSON.stringified 的数组/对象
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        row[k] = tryParse(row[k]);
      }
    }
    return rows;
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
  const rows = getDb().prepare('SELECT * FROM "student_council"').all();
  if (!rows || rows.length === 0) return null;
  const obj = {};
  for (const r of rows) {
    obj[r._key] = r._value;
  }
  return obj;
}
function writeSC(data) {
  const d = getDb();
  d.exec('DELETE FROM "student_council"');
  if (!data || Object.keys(data).length === 0) return;
  const ins = d.prepare('INSERT INTO "student_council" ("_key", "_value") VALUES (?, ?)');
  const tx = d.transaction(() => {
    for (const [k, v] of Object.entries(data)) {
      ins.run(k, String(v));
    }
  });
  tx();
}

// Notices
function readNotices() { return all('notices'); }
function writeNotices(data) { dropAndInsert('notices', data); }

// Maintenance mode
function readMaintenance() {
  const rows = getDb().prepare('SELECT * FROM "maintenance"').all();
  if (!rows || rows.length === 0) return null;
  const obj = {};
  for (const r of rows) {
    obj[r._key] = tryParse(r._value);
  }
  return obj;
}
function writeMaintenance(data) {
  const d = getDb();
  d.exec(`CREATE TABLE IF NOT EXISTS "maintenance" ("_key" TEXT PRIMARY KEY, "_value" TEXT)`);
  d.exec('DELETE FROM "maintenance"');
  if (!data || Object.keys(data).length === 0) return;
  const ins = d.prepare('INSERT INTO "maintenance" ("_key", "_value") VALUES (?, ?)');
  const tx = d.transaction(() => {
    for (const [k, v] of Object.entries(data)) {
      ins.run(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
  });
  tx();
}

// Passkey
function readPasskey() {
  // 表结构为 _key / _value，需要重构为对象
  const rows = getDb().prepare('SELECT * FROM "notice_passkey"').all();
  if (!rows || rows.length === 0) return null;
  const obj = {};
  for (const r of rows) {
    obj[r._key] = r._value;
  }
  return obj;
}
function writePasskey(data) {
  const d = getDb();
  d.exec('DELETE FROM "notice_passkey"');
  if (!data || Object.keys(data).length === 0) return;
  // 将对象展平为 _key / _value 行
  const ins = d.prepare('INSERT INTO "notice_passkey" ("_key", "_value") VALUES (?, ?)');
  const tx = d.transaction(() => {
    for (const [k, v] of Object.entries(data)) {
      ins.run(k, String(v));
    }
  });
  tx();
}

// Apps (notice applications)
function readApps() { return all('notice_applications'); }
function writeApps(data) { dropAndInsert('notice_applications', data); }

// Votes
function readVotes() { return all('votes'); }
function writeVotes(data) { dropAndInsert('votes', data); }

// Vote records (who voted on which option)
function readVoteRecords() { return all('vote_records'); }
function writeVoteRecords(data) { dropAndInsert('vote_records', data); }

// Vote IP records (which IP voted on which poll — one IP one vote per poll)
function readVoteIpRecords() { return all('vote_ip_records'); }
function writeVoteIpRecords(data) { dropAndInsert('vote_ip_records', data); }

// ===== 已删除内容记录 =====
function readDeletedItems() { return all('deleted_items'); }
function writeDeletedItems(data) { dropAndInsert('deleted_items', data); }
function addDeletedItem(item) {
  const items = all('deleted_items');
  items.push(item);
  dropAndInsert('deleted_items', items);
}

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
  readMaintenance, writeMaintenance,
  readNotices, writeNotices,
  readPasskey, writePasskey,
  readApps, writeApps,
  readDeletedItems, writeDeletedItems, addDeletedItem,
  readVotes, writeVotes,
  readVoteRecords, writeVoteRecords,
  readVoteIpRecords, writeVoteIpRecords,
};
