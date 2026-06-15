// 带错误日志的 dropAndInsert 调试
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'campus.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 读取当前帖子
const all = db.prepare('SELECT * FROM posts').all();
console.log('Current posts:', all.length);
console.log('First post keys:', Object.keys(all[0]));
console.log('First post content:', all[0].content);

// 创建新帖子（15个键，没有 deleted/deletedAt/deletedBy）
const newPost = {
  id: 'debug_' + Date.now(),
  type: 'text',
  content: 'DEBUG_CAUSE_ANALYSIS',
  avatar: 'D',
  author: 'Debug',
  userId: null,
  time: new Date().toISOString(),
  likes: 0,
  comments: 0,
  commentsCount: 0,
  liked: false,
  rotate: 0,
  zIndex: 1,
  authorAdminRole: null,
  authorBindAdminId: null
};

// 模拟 writePosts
const rows = [...all];
rows.unshift(newPost);

console.log('\nrows[0] keys:', Object.keys(rows[0]).length);
console.log('rows[1] keys:', Object.keys(rows[1]).length);

const cols = Object.keys(rows[0]);
console.log('cols:', cols);
console.log('cols count:', cols.length);

// DELETE (outside transaction)
console.log('\nDELETE all posts...');
db.exec('DELETE FROM posts');

// INSERT with error logging
const ph = cols.map(() => '?').join(',');
const ins = db.prepare(`INSERT INTO posts (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${ph})`);

let success = 0, fail = 0;
const tx = db.transaction((data) => {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const vals = cols.map(c => {
      const v = row[c];
      return v !== null && v !== undefined && typeof v === 'object' ? JSON.stringify(v) : v;
    });
    try {
      ins.run(vals);
      success++;
    } catch(e) {
      fail++;
      console.log('ROW', i, 'FAILED:', e.message);
      console.log('  vals:', JSON.stringify(vals));
      if (fail <= 3) {
        cols.forEach((c, idx) => {
          console.log('  ' + c + ':', typeof vals[idx], '=', vals[idx]);
        });
      }
    }
  }
});

tx(rows);
console.log('\nInserted:', success, 'Failed:', fail);

// Verify
const after = db.prepare("SELECT id, content FROM posts WHERE content LIKE '%DEBUG%'").all();
console.log('Debug posts found:', after.length);
after.forEach(p => console.log('  -', p.id));

const total = db.prepare('SELECT COUNT(*) as c FROM posts').get();
console.log('Total after:', total.c);

db.close();
