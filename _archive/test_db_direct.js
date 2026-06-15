// 直接测试 db.js 的读写
const db = require('/www/wwwroot/campus-wall/db.js');

console.log('Before write - posts count:', db.readPosts().length);

// 模拟一个简单的帖子
const testPost = {
  id: 'test_' + Date.now(),
  type: 'text',
  content: 'TEST_DB_DIRECT',
  avatar: 'X',
  author: 'DirectTest',
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

// 模拟写流程：read + push + write
const posts = db.readPosts();
console.log('Read posts count:', posts.length);
console.log('First post keys:', Object.keys(posts[0]));
console.log('Test post keys:', Object.keys(testPost));

posts.unshift(testPost);
db.writePosts(posts);

// 验证
const after = db.readPosts();
const found = after.filter(p => p.content === 'TEST_DB_DIRECT');
console.log('After write - posts count:', after.length);
console.log('Found test post:', found.length);
if (found.length > 0) {
  console.log('Test post in DB!', found[0].id);
} else {
  console.log('TEST POST NOT FOUND IN DB - BUG!');
  // Debug: check raw SQLite
  const Database = require('better-sqlite3');
  const d = new Database('/www/wwwroot/campus-wall/data/campus.db');
  const rows = d.prepare("SELECT id, content FROM posts WHERE content LIKE '%TEST_DB_DIRECT%'").all();
  console.log('Direct SQLite query:', rows);
  d.close();
}
