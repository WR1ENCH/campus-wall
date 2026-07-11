const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '..', 'data', 'test_campus_migration.db');

function oldFormatId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
}

describe('idMigration', () => {
  let db;

  before(() => {
    process.env.CW_DB_PATH = TEST_DB;
    // Clear require cache so db.js picks up the new CW_DB_PATH
    delete require.cache[require.resolve('../db')];
    db = require('../db');
  });

  after(() => {
    delete process.env.CW_DB_PATH;
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
    try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}
    delete require.cache[require.resolve('../db')];
  });

  beforeEach(() => {
    const d = db.getDb();
    d.exec('DELETE FROM posts');
    d.exec('DELETE FROM users');
    d.exec('DELETE FROM discussions');
    d.exec('DELETE FROM discussion_comments');
    d.exec('DELETE FROM qa_questions');
    d.exec('DELETE FROM qa_answers');
    d.exec('DELETE FROM votes');
    d.exec('DELETE FROM pickup_auctions');
    d.exec('DELETE FROM pickup_reports');
    d.exec('DELETE FROM ID_input');
  });

  describe('ensureUniqueIds', () => {
    it('migrates old-format post IDs', () => {
      const { ensureUniqueIds } = require('../lib/idMigration');

      const oldId = oldFormatId();
      db.insertPost({
        id: oldId,
        content: 'test post',
        author: 'tester',
        time: new Date().toISOString(),
      });

      const result = ensureUniqueIds(db);
      assert.ok(result.posts >= 1, 'should have migrated at least 1 post');

      // old post should be gone
      const oldPost = db.getById('posts', oldId);
      assert.equal(oldPost, null, 'old-format post should no longer exist');

      // find the new post
      const allPosts = db.readPosts();
      const migrated = allPosts.find(p => /^POST-[A-Z0-9]{16}$/.test(p.id));
      assert.ok(migrated, 'should have a post with new format ID');
      assert.equal(migrated.content, 'test post');
    });

    it('does not re-migrate already migrated IDs', () => {
      const { ensureUniqueIds } = require('../lib/idMigration');

      const newId = 'POST-ABCDEFGH12345678';
      db.insertPost({
        id: newId,
        content: 'already migrated',
        author: 'tester',
        time: new Date().toISOString(),
      });

      const result = ensureUniqueIds(db);
      assert.equal(result.posts, 0, 'should not migrate anything');

      const post = db.getById('posts', newId);
      assert.ok(post, 'post with new ID should still exist');
      assert.equal(post.id, newId, 'ID should be unchanged');
    });

    it('cascades discussion ID to discussion_comments and posts', () => {
      const { ensureUniqueIds } = require('../lib/idMigration');

      const oldDiscId = oldFormatId();
      const commentId = 'dc_' + Date.now();

      // Insert discussion with old format ID
      db.insertRow('discussions', {
        id: oldDiscId,
        title: 'test discussion',
        createdBy: 'tester',
        createdAt: new Date().toISOString(),
      });

      // Insert discussion comment referencing old discussion ID
      db.insertRow('discussion_comments', {
        id: commentId,
        discussionId: oldDiscId,
        content: 'comment on old discussion',
        author: 'commenter',
        createdAt: new Date().toISOString(),
      });

      // Insert post referencing old discussion ID
      const postId = 'POST-ALREADYMIGRATE01';
      db.insertPost({
        id: postId,
        content: 'post linked to discussion',
        author: 'tester',
        time: new Date().toISOString(),
        discussionId: oldDiscId,
      });

      const result = ensureUniqueIds(db);
      assert.ok(result.discussions >= 1, 'should have migrated discussion');

      // find new discussion ID
      const allDiscs = db.readDiscussions();
      const newDisc = allDiscs.find(d => d.title === 'test discussion');
      assert.ok(newDisc, 'migrated discussion should exist');

      // comment should reference new discussion ID
      const comments = db.queryRows('discussion_comments', '1=1');
      const migratedComment = comments.find(c => c.id === commentId);
      assert.ok(migratedComment, 'comment should still exist');
      assert.equal(migratedComment.discussionId, newDisc.id,
        'comment should reference new discussion ID');

      // post should also reference new discussion ID
      const post = db.getById('posts', postId);
      assert.ok(post, 'post should exist');
      assert.equal(post.discussionId, newDisc.id,
        'post should reference new discussion ID');
    });

    it('migrates users to 16-digit UIDs', () => {
      const { ensureUniqueIds } = require('../lib/idMigration');

      const userId = 'user_' + Date.now();
      db.insertUser({
        id: userId,
        username: 'testuser_' + Date.now(),
        password: 'hashed',
        nickname: 'Tester',
        uid: '12345',
      });

      const result = ensureUniqueIds(db);
      assert.ok(result.users >= 1, 'should have migrated at least 1 user');

      const user = db.readUsers().find(u => u.id === userId);
      assert.ok(user, 'user should exist');
      assert.match(String(user.uid), /^[0-9]{16}$/, 'uid should be 16 digits');
    });

    it('returns correct counts', () => {
      const { ensureUniqueIds } = require('../lib/idMigration');

      db.insertPost({
        id: oldFormatId(),
        content: 'old1',
        author: 'tester',
        time: new Date().toISOString(),
      });
      db.insertPost({
        id: oldFormatId(),
        content: 'old2',
        author: 'tester',
        time: new Date().toISOString(),
      });
      db.insertPost({
        id: 'POST-ALREADYGOOD0001',
        content: 'already good',
        author: 'tester',
        time: new Date().toISOString(),
      });

      const result = ensureUniqueIds(db);
      assert.equal(typeof result.posts, 'number');
      assert.equal(typeof result.users, 'number');
      assert.ok(result.posts >= 2, 'should report at least 2 migrated posts');
    });
  });
});
