const fs = require('fs');

let content = fs.readFileSync('/www/wwwroot/campus-wall/server.js', 'utf8');

// Find all functions that need db.* equivalents
// Check which function NAMES are missing
const allDbFuncs = {
  'readPosts': true, 'writePosts': true,
  'readAdmins': true, 'writeAdmins': true,
  'hasAdmins': true,
  'readUsers': true, 'writeUsers': true,
  'readTrustTokens': true, 'writeTrustTokens': true,
  'readLogs': true, 'writeLogs': true,
  'readReports': true, 'writeReports': true,
  'readFeedbacks': true, 'writeFeedbacks': true,
  'readBullying': true, 'writeBullying': true,
  'readCreditLogs': true, 'writeCreditLogs': true,
  'readCreditCards': true, 'writeCreditCards': true,
  'readAnnouncement': true, 'writeAnnouncement': true,
  'readDiscussions': true, 'writeDiscussions': true,
  'readDiscussionComments': true, 'writeDiscussionComments': true,
  'readQAQuestions': true, 'writeQAQuestions': true,
  'readQAAnswers': true, 'writeQAAnswers': true,
  'readPickupAuctions': true, 'writePickupAuctions': true,
  'readPickupReports': true, 'writePickupReports': true,
  'readSC': true, 'writeSC': true,
  'readNotices': true, 'writeNotices': true,
  'readPasskey': true, 'writePasskey': true,
  'readApps': true, 'writeApps': true,
};

const insertAfter = {};

for (const [fnName, _] of Object.entries(allDbFuncs)) {
  const funcRe = new RegExp('function ' + fnName + '\\s*\\([^)]*\\)\\s*\\{');
  if (!funcRe.test(content)) {
    // Missing! Determine return type for write functions
    const isWrite = fnName.startsWith('write');
    const isRead = fnName.startsWith('read') || fnName === 'hasAdmins';
    
    // Find what to insert and where
    const baseName = fnName.replace(/^(read|write|has)/, '');
    const lcBase = baseName.charAt(0).toLowerCase() + baseName.slice(1);
    
    // Generate the code for this function
    let code;
    if (fnName === 'hasAdmins') {
      code = 'function hasAdmins() { return db.readAdmins().length > 0; }';
    } else if (isRead) {
      code = 'function ' + fnName + '() { return db.' + fnName + '(); }';
    } else {
      code = 'function ' + fnName + '(data) { db.' + fnName + '(data); }';
    }
    
    // Find a place to insert: after the db import or near similar functions
    // Look for the most similar function that already exists
    const similarOrder = [
      'read' + baseName, 'write' + baseName,
    ];
    
    let insertPt = null;
    for (const sib of similarOrder) {
      if (sib !== fnName) {
        const sibMatch = content.match(new RegExp('function ' + sib + '\\s*\\([^)]*\\)\\s*\\{[^}]*\\}[ \\t]*\\n'));
        if (sibMatch) {
          insertPt = sibMatch.index + sibMatch[0].length;
          break;
        }
      }
    }
    
    if (insertPt === null) {
      // Insert at the last db.* function definition
      const lastDef = content.match(/function \w+\([^)]*\)\s*\{[^}]*db\.\w+[^}]*\}[ \t]*\n/g);
      if (lastDef && lastDef.length > 0) {
        const last = lastDef[lastDef.length - 1];
        insertPt = content.lastIndexOf(last) + last.length;
      }
    }
    
    if (insertPt !== null) {
      content = content.slice(0, insertPt) + '\n' + code + '\n' + content.slice(insertPt);
      console.log('Added: ' + code);
    } else {
      console.log('Could not find insertion point for: ' + fnName);
    }
  }
}

fs.writeFileSync('/www/wwwroot/campus-wall/server.js', content, 'utf8');
console.log('Fix complete.');
