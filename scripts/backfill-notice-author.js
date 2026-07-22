// ===== One-time backfill: set author='校园墙' for legacy notices without author =====
// Run: node scripts/backfill-notice-author.js
// Context: frontend fallback changed from '学生会' to '校园墙'. Legacy notices
// that never had an author stored should be backfilled so they display consistently.
// Also catches notices that got '学生会' from a previous incorrect run.
// Safe to re-run: idempotent.

const db = require('../db');

function main() {
  const notices = db.readNotices();
  const toFix = notices.filter(n => !n.author || n.author === '学生会');
  if (toFix.length === 0) {
    console.log('All notices already have an author. Nothing to backfill.');
    return;
  }

  console.log(`Found ${toFix.length} notice(s) to backfill with '校园墙'...`);
  for (const n of toFix) {
    n.author = '校园墙';
  }
  db.writeNotices(notices);
  console.log(`Done. ${toFix.length} notice(s) updated.`);

  const verify = db.readNotices();
  const remaining = verify.filter(n => !n.author || n.author === '学生会');
  if (remaining.length > 0) {
    console.log(`WARNING: ${remaining.length} notice(s) still not updated after backfill.`);
  } else {
    console.log('Verification passed: all notices have author set to 校园墙.');
  }
}

main();
