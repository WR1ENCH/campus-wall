// ===== idMigration.js - 启动时旧 ID 迁移到新前缀格式 =====
const { generateId, generateUID, isValidIdFormat, logIdAssignment } = require('./uniqueId');

const NEW_ID_RE = /^(POST|POCM|DISC|DICM|QAQU|QAAN|VOTE|AURQ)-[A-Z0-9]{16}$/;
const UID_RE = /^[0-9]{16}$/;

function needsMigration(id, isUid) {
  if (isUid) return !UID_RE.test(id);
  return !NEW_ID_RE.test(id);
}

function ensureUniqueIds(db) {
  const summary = { posts: 0, discussions: 0, questions: 0, votes: 0, auctions: 0, users: 0 };
  const logs = []; // collect log entries, write after transaction commits

  const d = db.getDb();
  const migrate = d.transaction(() => {
    // 1. Posts — post comments are JSON in posts.comments column, no separate table
    try {
      const rows = db.allSql('SELECT id, content FROM posts');
      for (const row of rows) {
        if (!needsMigration(row.id, false)) continue;
        try {
          const newId = generateId('POST');
          db.runSql('UPDATE posts SET id = ? WHERE id = ?', [newId, row.id]);
          logs.push({ type: 'post', id: newId, content: row.content || '' });
          summary.posts++;
        } catch (e) { console.warn('[idMigration] post migrate failed:', row.id, e.message); }
      }
    } catch (e) { console.warn('[idMigration] posts query failed:', e.message); }

    // 2. Discussions — cascade FK to discussion_comments and posts.discussionId
    try {
      const rows = db.allSql('SELECT id, title FROM discussions');
      for (const row of rows) {
        if (!needsMigration(row.id, false)) continue;
        try {
          const newId = generateId('DISC');
          db.runSql('UPDATE discussions SET id = ? WHERE id = ?', [newId, row.id]);
          db.runSql('UPDATE discussion_comments SET discussionId = ? WHERE discussionId = ?', [newId, row.id]);
          db.runSql('UPDATE posts SET discussionId = ? WHERE discussionId = ?', [newId, row.id]);
          logs.push({ type: 'discussion', id: newId, content: row.title || '' });
          summary.discussions++;
        } catch (e) { console.warn('[idMigration] discussion migrate failed:', row.id, e.message); }
      }
    } catch (e) { console.warn('[idMigration] discussions query failed:', e.message); }

    // 3. QA Questions — cascade FK to qa_answers
    try {
      const rows = db.allSql('SELECT id, title, content FROM qa_questions');
      for (const row of rows) {
        if (!needsMigration(row.id, false)) continue;
        try {
          const newId = generateId('QAQU');
          db.runSql('UPDATE qa_questions SET id = ? WHERE id = ?', [newId, row.id]);
          db.runSql('UPDATE qa_answers SET questionId = ? WHERE questionId = ?', [newId, row.id]);
          logs.push({ type: 'qa_question', id: newId, content: row.title || row.content || '' });
          summary.questions++;
        } catch (e) { console.warn('[idMigration] qa_question migrate failed:', row.id, e.message); }
      }
    } catch (e) { console.warn('[idMigration] qa_questions query failed:', e.message); }

    // 4. Votes
    try {
      const rows = db.allSql('SELECT id, title FROM votes');
      for (const row of rows) {
        if (!needsMigration(row.id, false)) continue;
        try {
          const newId = generateId('VOTE');
          db.runSql('UPDATE votes SET id = ? WHERE id = ?', [newId, row.id]);
          logs.push({ type: 'vote', id: newId, content: row.title || '' });
          summary.votes++;
        } catch (e) { console.warn('[idMigration] vote migrate failed:', row.id, e.message); }
      }
    } catch (e) { console.warn('[idMigration] votes query failed:', e.message); }

    // 5. Auctions
    try {
      const rows = db.allSql('SELECT id, content FROM pickup_auctions');
      for (const row of rows) {
        if (!needsMigration(row.id, false)) continue;
        try {
          const newId = generateId('AURQ');
          db.runSql('UPDATE pickup_auctions SET id = ? WHERE id = ?', [newId, row.id]);
          logs.push({ type: 'auction', id: newId, content: row.content || '' });
          summary.auctions++;
        } catch (e) { console.warn('[idMigration] auction migrate failed:', row.id, e.message); }
      }
    } catch (e) { console.warn('[idMigration] auctions query failed:', e.message); }

    // 6. Users — upgrade short UIDs to 16-digit
    try {
      const rows = db.allSql('SELECT id, uid, nickname, username FROM users');
      for (const row of rows) {
        if (row.uid && UID_RE.test(String(row.uid))) continue;
        try {
          const newUid = generateUID();
          db.runSql('UPDATE users SET uid = ? WHERE id = ?', [newUid, row.id]);
          logs.push({ type: 'user', id: newUid, content: `${row.nickname || ''}(${row.username || ''})` });
          summary.users++;
        } catch (e) { console.warn('[idMigration] user migrate failed:', row.id, e.message); }
      }
    } catch (e) { console.warn('[idMigration] users query failed:', e.message); }
  });

  // Execute transaction — all or nothing
  migrate();

  // Write ID assignment logs after transaction commits (non-fatal)
  for (const entry of logs) {
    logIdAssignment(entry.type, entry.id, entry.content, db);
  }

  return summary;
}

module.exports = { ensureUniqueIds };
