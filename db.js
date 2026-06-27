// ===== db.js - SQLite 数据库模块 =====
// 替代 JSON 文件存储，提供与原来完全相同的 readXxx / writeXxx 接口

const Database = require('better-sqlite3');
const path = require('path');
const cache = require('./lib/cache');

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
  // 创建 trust_score_logs 表
  db.exec(`CREATE TABLE IF NOT EXISTS "trust_score_logs" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "amount" INTEGER,
    "score" INTEGER,
    "reason" TEXT,
    "createdAt" TEXT
  )`);
  // 创建 whispers 表
  db.exec(`CREATE TABLE IF NOT EXISTS "whispers" (
    "id" TEXT PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "receiverName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "notifLevel" TEXT DEFAULT 'T1',
    "createdAt" TEXT NOT NULL,
    "deleted" INTEGER DEFAULT 0
  )`);
  // ===== 核心业务表 =====
  db.exec(`CREATE TABLE IF NOT EXISTS "admins" (
    "id" TEXT PRIMARY KEY,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT DEFAULT 'admin',
    "createdAt" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY,
    "username" TEXT UNIQUE,
    "password" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar" TEXT,
    "uid" TEXT,
    "regIp" TEXT,
    "createdAt" TEXT,
    "status" TEXT DEFAULT 'active',
    "postCount" INTEGER DEFAULT 0,
    "bindAdminId" TEXT,
    "bindAdminRole" TEXT,
    "credit" INTEGER DEFAULT 0,
    "checkedInDate" TEXT,
    "checkinStreak" INTEGER DEFAULT 0,
    "banUntil" TEXT,
    "zhixueStatus" TEXT,
    "certData" TEXT,
    "zhixueReviewedBy" TEXT,
    "zhixueReviewedAt" TEXT,
    "noticePublisher" INTEGER DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "posts" (
    "id" TEXT PRIMARY KEY,
    "content" TEXT,
    "author" TEXT,
    "avatar" TEXT,
    "userId" TEXT,
    "time" TEXT,
    "type" TEXT DEFAULT 'text',
    "deleted" INTEGER DEFAULT 0,
    "pinned" INTEGER DEFAULT 0,
    "images" TEXT,
    "isAnonymous" INTEGER DEFAULT 0,
    "likes" INTEGER DEFAULT 0,
    "likedBy" TEXT,
    "comments" TEXT,
    "commentsCount" INTEGER DEFAULT 0,
    "discussionId" TEXT,
    "rotate" INTEGER DEFAULT 0,
    "zIndex" INTEGER DEFAULT 0,
    "liked" TEXT,
    "deletedAt" TEXT,
    "deletedBy" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "login_logs" (
    "id" TEXT PRIMARY KEY,
    "type" TEXT,
    "account" TEXT,
    "success" INTEGER,
    "ip" TEXT,
    "ua" TEXT,
    "time" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "reports" (
    "id" TEXT PRIMARY KEY,
    "type" TEXT,
    "targetId" TEXT,
    "postId" TEXT,
    "reason" TEXT,
    "reportedBy" TEXT,
    "reporterName" TEXT,
    "createdAt" TEXT,
    "status" TEXT DEFAULT 'pending',
    "handledBy" TEXT,
    "handledAt" TEXT,
    "action" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "feedbacks" (
    "id" TEXT PRIMARY KEY,
    "type" TEXT,
    "description" TEXT,
    "contact" TEXT,
    "images" TEXT,
    "time" TEXT,
    "status" TEXT DEFAULT 'pending',
    "handledBy" TEXT,
    "handledAt" TEXT,
    "handleNote" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "bullying" (
    "id" TEXT PRIMARY KEY,
    "reporterRole" TEXT,
    "victimName" TEXT,
    "bullyType" TEXT,
    "description" TEXT,
    "involved" TEXT,
    "location" TEXT,
    "incidentTime" TEXT,
    "contact" TEXT,
    "anonymous" INTEGER DEFAULT 0,
    "images" TEXT,
    "time" TEXT,
    "status" TEXT DEFAULT 'pending',
    "handledBy" TEXT,
    "handledAt" TEXT,
    "handleNote" TEXT,
    "userId" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "credit_logs" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "amount" INTEGER,
    "reason" TEXT,
    "createdAt" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "credit_cards" (
    "id" TEXT PRIMARY KEY,
    "code" TEXT UNIQUE,
    "value" INTEGER,
    "status" TEXT DEFAULT 'active',
    "createdBy" TEXT,
    "createdAt" TEXT,
    "usedBy" TEXT,
    "usedAt" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "announcement" (
    "_id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "title" TEXT,
    "content" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT,
    "publishedAt" TEXT,
    "publishedBy" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "discussions" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT,
    "expiresAt" TEXT,
    "deleted" INTEGER DEFAULT 0,
    "createdAt" TEXT,
    "createdBy" TEXT,
    "commentCount" INTEGER DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "discussion_comments" (
    "id" TEXT PRIMARY KEY,
    "discussionId" TEXT,
    "parentId" TEXT,
    "content" TEXT,
    "author" TEXT,
    "avatar" TEXT,
    "userId" TEXT,
    "createdAt" TEXT,
    "deleted" INTEGER DEFAULT 0,
    "syncPostId" TEXT,
    "likes" INTEGER DEFAULT 0,
    "likedBy" TEXT,
    "hidden" INTEGER DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "qa_questions" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT,
    "author" TEXT,
    "avatar" TEXT,
    "title" TEXT,
    "content" TEXT,
    "bounty" INTEGER DEFAULT 0,
    "deadline" TEXT,
    "status" TEXT DEFAULT 'open',
    "acceptedAnswerId" TEXT,
    "distributedCredits" INTEGER DEFAULT 0,
    "createdAt" TEXT,
    "deleted" INTEGER DEFAULT 0,
    "images" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "qa_answers" (
    "id" TEXT PRIMARY KEY,
    "questionId" TEXT,
    "userId" TEXT,
    "author" TEXT,
    "avatar" TEXT,
    "content" TEXT,
    "likes" INTEGER DEFAULT 0,
    "likedBy" TEXT,
    "accepted" INTEGER DEFAULT 0,
    "reward" INTEGER DEFAULT 0,
    "createdAt" TEXT,
    "deleted" INTEGER DEFAULT 0,
    "images" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "pickup_auctions" (
    "id" TEXT PRIMARY KEY,
    "slot" INTEGER,
    "date" TEXT,
    "userId" TEXT,
    "content" TEXT,
    "anonymous" INTEGER DEFAULT 0,
    "amount" INTEGER DEFAULT 0,
    "time" TEXT,
    "reviewStatus" TEXT DEFAULT 'pending_review',
    "isHighest" INTEGER DEFAULT 0,
    "approvalStatus" TEXT,
    "bids" TEXT,
    "status" TEXT DEFAULT 'open',
    "createdAt" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "pickup_reports" (
    "id" TEXT PRIMARY KEY,
    "bidId" TEXT,
    "slot" INTEGER,
    "content" TEXT,
    "reason" TEXT,
    "reporterId" TEXT,
    "reporterName" TEXT,
    "status" TEXT DEFAULT 'pending',
    "time" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "student_council" (
    "_key" TEXT PRIMARY KEY,
    "_value" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "notices" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT,
    "content" TEXT,
    "author" TEXT,
    "auto" INTEGER DEFAULT 0,
    "level" TEXT DEFAULT 'T1',
    "createdAt" TEXT,
    "deleted" INTEGER DEFAULT 0,
    "pinned" INTEGER DEFAULT 0,
    "synced" INTEGER DEFAULT 0,
    "targetUserId" TEXT,
    "images" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "notice_passkey" (
    "_key" TEXT PRIMARY KEY,
    "_value" TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS "notice_applications" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT,
    "department" TEXT,
    "contact" TEXT,
    "reason" TEXT,
    "userId" TEXT,
    "userNickname" TEXT,
    "status" TEXT DEFAULT 'pending',
    "createdAt" TEXT,
    "reviewedAt" TEXT,
    "reviewedBy" TEXT
  )`);
  // trust_tokens 表（由 writeTrustTokens 内联创建，此处也提前创建）
  db.exec(`CREATE TABLE IF NOT EXISTS "trust_tokens" (
    "_key" TEXT,
    "userId" TEXT,
    "userAgent" TEXT,
    "createdAt" TEXT,
    "expiresAt" TEXT
  )`);
  // maintenance 表（由 writeMaintenance 内联创建，这里提前创建确保迁移一致性）
  db.exec(`CREATE TABLE IF NOT EXISTS "maintenance" ("_key" TEXT PRIMARY KEY, "_value" TEXT)`);
  // ===== 数据库索引 =====
  const INDEXES = [
    'CREATE INDEX IF NOT EXISTS idx_posts_deleted ON posts(deleted)',
    'CREATE INDEX IF NOT EXISTS idx_posts_userId ON posts(userId)',
    'CREATE INDEX IF NOT EXISTS idx_posts_time ON posts("time" DESC)',
    'CREATE INDEX IF NOT EXISTS idx_users_id ON users(id)',
    'CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)',
    'CREATE INDEX IF NOT EXISTS idx_discussions_deleted ON discussions(deleted)',
    'CREATE INDEX IF NOT EXISTS idx_discussion_comments_discussionId ON discussion_comments(discussionId)',
    'CREATE INDEX IF NOT EXISTS idx_qa_questions_status ON qa_questions(status)',
  ];
  for (const sql of INDEXES) {
    try { db.exec(sql); } catch (e) { /* index may already exist */ }
  }
  // 已有表的列迁移
  const tableMigrations = [
    { name: 'posts', columns: ['type', 'likes', 'images', 'discussionId', 'likedBy', 'comments', 'commentsCount', 'liked', 'rotate', 'zIndex', 'isAnonymous'] },
    { name: 'votes', columns: ['allowCustom'] },
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
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '1') return true;
  if (v === '0') return false;
  // 解析数字字符串
  if (/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (isFinite(n)) return Number.isInteger(n) ? n : n;
  }
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

// ===== 缓存集成 =====
function invalidateCache(table) {
  cache.invalidate(table);
  cache.invalidate(table + '_count');
}

// ===== 新增 SQL 过滤查询 =====

function getPosts(opts = {}) {
  const d = getDb();
  let sql = 'SELECT * FROM posts WHERE 1=1';
  const params = [];
  if (opts.deleted !== undefined) { sql += ' AND IFNULL(deleted,0) = ?'; params.push(opts.deleted ? 1 : 0); }
  if (opts.type) { sql += ' AND type = ?'; params.push(opts.type); }
  if (opts.userId) { sql += ' AND userId = ?'; params.push(opts.userId); }
  if (opts.today) { sql += ' AND date("time") = ?'; params.push(opts.today); }
  sql += ' ORDER BY "time" DESC';
  if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
  if (opts.offset) { sql += ' OFFSET ?'; params.push(opts.offset); }
  const rows = d.prepare(sql).all(...params);
  for (const row of rows) { for (const k of Object.keys(row)) row[k] = tryParse(row[k]); }
  return rows;
}

function getPostCount(opts = {}) {
  const d = getDb();
  let sql = 'SELECT COUNT(*) as cnt FROM posts WHERE 1=1';
  const params = [];
  if (opts.deleted !== undefined) { sql += ' AND IFNULL(deleted,0) = ?'; params.push(opts.deleted ? 1 : 0); }
  if (opts.type) { sql += ' AND type = ?'; params.push(opts.type); }
  if (opts.today) { sql += ' AND date("time") = ?'; params.push(opts.today); }
  const row = d.prepare(sql).get(...params);
  return row ? row.cnt : 0;
}

function getUsers(opts = {}) {
  const d = getDb();
  let sql = 'SELECT * FROM users WHERE 1=1';
  const params = [];
  if (opts.status) { sql += ' AND status = ?'; params.push(opts.status); }
  if (opts.search) { sql += ' AND (username LIKE ? OR nickname LIKE ?)'; params.push(`%${opts.search}%`, `%${opts.search}%`); }
  sql += ' ORDER BY rowid DESC';
  if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
  if (opts.offset) { sql += ' OFFSET ?'; params.push(opts.offset); }
  const rows = d.prepare(sql).all(...params);
  for (const row of rows) { for (const k of Object.keys(row)) row[k] = tryParse(row[k]); }
  return rows;
}

function getReports(opts = {}) {
  const d = getDb();
  let sql = 'SELECT * FROM reports WHERE 1=1';
  const params = [];
  if (opts.status) { sql += ' AND status = ?'; params.push(opts.status); }
  sql += ' ORDER BY rowid DESC';
  if (opts.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
  if (opts.offset) { sql += ' OFFSET ?'; params.push(opts.offset); }
  const rows = d.prepare(sql).all(...params);
  for (const row of rows) { for (const k of Object.keys(row)) row[k] = tryParse(row[k]); }
  return rows;
}

function queryRows(table, where, params = []) {
  try {
    const rows = getDb().prepare(`SELECT * FROM "${table}" WHERE ${where}`).all(...params);
    for (const row of rows) { for (const k of Object.keys(row)) row[k] = tryParse(row[k]); }
    return rows;
  } catch { return []; }
}

function countRows(table, where, params = []) {
  try {
    const row = getDb().prepare(`SELECT COUNT(*) as cnt FROM "${table}" WHERE ${where}`).get(...params);
    return row ? row.cnt : 0;
  } catch { return 0; }
}

// ===== 新增增量写入 =====

function insertRow(table, row) {
  const d = getDb();
  const cols = Object.keys(row);
  const ph = cols.map(() => '?').join(',');
  const vals = cols.map(c => toSqlValue(row[c]));
  d.prepare(`INSERT INTO "${table}" (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${ph})`).run(vals);
  invalidateCache(table);
}

function updateRow(table, id, updates) {
  const d = getDb();
  const cols = Object.keys(updates);
  const setClause = cols.map(c => `"${c}" = ?`).join(',');
  const vals = cols.map(c => toSqlValue(updates[c]));
  d.prepare(`UPDATE "${table}" SET ${setClause} WHERE id = ?`).run(...vals, id);
  invalidateCache(table);
}

function deleteRow(table, id) {
  getDb().prepare(`DELETE FROM "${table}" WHERE id = ?`).run(id);
  invalidateCache(table);
}

function insertPost(post) {
  insertRow('posts', post);
}

function updatePost(id, updates) {
  updateRow('posts', id, updates);
}

function softDeletePost(id, deletedAt, deletedBy) {
  updateRow('posts', id, { deleted: 1, deletedAt, deletedBy });
}

function insertUser(user) {
  insertRow('users', user);
}

function updateUser(id, updates) {
  updateRow('users', id, updates);
}

// ===== 悄悄话 =====
function readWhispers() { return all('whispers'); }
function writeWhispers(data) { dropAndInsert('whispers', data); }
function addWhisper(whisper) { insertRow('whispers', whisper); }

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
  readWhispers, writeWhispers, addWhisper,
  // 新增 SQL 过滤查询
  getById,
  getPosts, getPostCount,
  getUsers,
  getReports,
  queryRows, countRows,
  // 新增增量写入
  insertPost, updatePost, softDeletePost,
  insertUser, updateUser,
  insertRow, updateRow, deleteRow,
};
