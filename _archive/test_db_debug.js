const db = require('/www/wwwroot/campus-wall/db.js');

console.log('=== Current posts in DB ===');
const all = db.readPosts();
console.log('Total:', all.length);

// Show all posts with TEST in content
const testPosts = all.filter(p => String(p.content).includes('TEST'));
console.log('Test posts found:', testPosts.length);
testPosts.forEach(p => console.log('  -', p.id, ':', p.content));

// Check what the "newest" (first returned) post looks like
console.log('\n=== First post (newest) ===');
const first = all[0];
console.log('ID:', first.id);
console.log('Content:', first.content);
console.log('Keys:', Object.keys(first));
console.log('Has deleted?', 'deleted' in first, 'value:', first.deleted);
console.log('Has deletedAt?', 'deletedAt' in first);
console.log('Has deletedBy?', 'deletedBy' in first);
console.log('Has rotate?', 'rotate' in first, 'value:', first.rotate);

// Check a middle post
console.log('\n=== A middle post (index 14) ===');
const mid = all[14] || all[0];
console.log('ID:', mid.id);
console.log('Keys:', Object.keys(mid));

// Check the oldest post
console.log('\n=== Last post (oldest) ===');
const last = all[all.length - 1];
console.log('ID:', last.id);
console.log('Keys:', Object.keys(last));

// Now test the write - issue might be Object.keys(rows[0]) having wrong columns
// Let's check what happens when a NEW post (fewer keys) is unshifted
console.log('\n=== Simulating writePosts ===');
const newPost = {
  id: 'debug_' + Date.now(),
  type: 'text',
  content: 'DEBUG_TEST_INSERT',
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

// Copy the array and add new post
const copy = [...all];
copy.unshift(newPost);

console.log('rows[0] keys:', Object.keys(copy[0]));
console.log('rows[0] has deleted?', 'deleted' in copy[0]);
console.log('rows[1] keys:', Object.keys(copy[1]));
console.log('rows[1] has deleted?', 'deleted' in copy[1]);

// The INSERT SQL would use cols from rows[0] (newPost - no deleted/deletedAt/deletedBy)
// This means `deleted`, `deletedAt`, `deletedBy` won't be in the INSERT
// But these columns exist in the table with NULL defaults, so it should be fine

// Write to DB
console.log('\nCalling writePosts...');
db.writePosts(copy);

// Read back
const after = db.readPosts();
const debugPost = after.filter(p => p.content === 'DEBUG_TEST_INSERT');
console.log('After write - total:', after.length);
console.log('Debug post found:', debugPost.length);
if (debugPost.length > 0) {
  console.log('SUCCESS! Debug post persisted:', debugPost[0].id);
} else {
  console.log('FAILED! Debug post not found!');
  // Check using different connection to rule out WAL issue
}

// Direct SQLite check
const Database = require('better-sqlite3');
const d = new Database('/www/wwwroot/campus-wall/data/campus.db');
d.pragma('journal_mode = WAL');
const sqliteCount = d.prepare("SELECT COUNT(*) as c FROM posts WHERE content LIKE '%DEBUG_TEST_INSERT%'").get();
console.log('Direct SQLite query:', sqliteCount);
d.close();

// Also check that the issue is with cols from newPost vs old posts
console.log('\n=== Is the issue with column mismatch? ===');
// Test: write without unshifting - just write the exact same data back
console.log('Testing write with original data (no new post)...');
const original = db.readPosts();
console.log('Original count:', original.length);
db.writePosts(original);
const verifyOriginal = db.readPosts();
console.log('After write original back:', verifyOriginal.length);
console.log('First post content:', verifyOriginal[0] ? verifyOriginal[0].content : 'N/A');
