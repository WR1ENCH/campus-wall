const fs = require('fs');

let content = fs.readFileSync('C:\\Users\\wyxgg\\Desktop\\test\\server.js', 'utf8');

// 1. Add db require
const marker = "const cookieParser = require('cookie-parser');";
if (!content.includes('const db = require')) {
  content = content.replace(marker, marker + '\nconst db = require(\'./db\');');
  console.log('Added db require');
}

// 2. Remove old file path constants (optional)

// 3. Replace ALL data read/write functions with db aliases
const funcs = [
  ['function readPosts()', 'return db.readPosts()'],
  ['function writePosts(posts)', 'db.writePosts(posts)'],
  ['function readAdmins()', 'return db.readAdmins()'],
  ['function writeAdmins(admins)', 'db.writeAdmins(admins)'],
  ['function readUsers()', 'return db.readUsers()'],
  ['function writeUsers(users)', 'db.writeUsers(users)'],
  ['function readTrustTokens()', 'return db.readTrustTokens()'],
  ['function writeTrustTokens(tokens)', 'db.writeTrustTokens(tokens)'],
  ['function readLogs()', 'return db.readLogs()'],
  ['function writeLogs(logs)', 'db.writeLogs(logs)'],
  ['function readReports()', 'return db.readReports()'],
  ['function writeReports(reports)', 'db.writeReports(reports)'],
  ['function readFeedbacks()', 'return db.readFeedbacks()'],
  ['function writeFeedbacks(feedbacks)', 'db.writeFeedbacks(feedbacks)'],
  ['function readBullying()', 'return db.readBullying()'],
  ['function writeBullying(data)', 'db.writeBullying(data)'],
  ['function readCreditLogs()', 'return db.readCreditLogs()'],
  ['function writeCreditLogs(logs)', 'db.writeCreditLogs(logs)'],
  ['function readCreditCards()', 'return db.readCreditCards()'],
  ['function writeCreditCards(cards)', 'db.writeCreditCards(cards)'],
  ['function readAnnouncement()', 'return db.readAnnouncement()'],
  ['function writeAnnouncement(data)', 'db.writeAnnouncement(data)'],
  ['function readDiscussions()', 'return db.readDiscussions()'],
  ['function writeDiscussions(discussions)', 'db.writeDiscussions(discussions)'],
  ['function readDiscussionComments()', 'return db.readDiscussionComments()'],
  ['function writeDiscussionComments(comments)', 'db.writeDiscussionComments(comments)'],
  ['function readQAQuestions()', 'return db.readQAQuestions()'],
  ['function writeQAQuestions(data)', 'db.writeQAQuestions(data)'],
  ['function readQAAnswers()', 'return db.readQAAnswers()'],
  ['function writeQAAnswers(data)', 'db.writeQAAnswers(data)'],
  ['function readPickupAuctions()', 'return db.readPickupAuctions()'],
  ['function writePickupAuctions(data)', 'db.writePickupAuctions(data)'],
  ['function readPickupReports()', 'return db.readPickupReports()'],
  ['function writePickupReports(data)', 'db.writePickupReports(data)'],
  ['function readSC()', 'return db.readSC()'],
  ['function writeSC(data)', 'db.writeSC(data)'],
  ['function readNotices()', 'return db.readNotices()'],
  ['function writeNotices(data)', 'db.writeNotices(data)'],
  ['function readPasskey()', 'return db.readPasskey()'],
  ['function writePasskey(data)', 'db.writePasskey(data)'],
  ['function readApps()', 'return db.readApps()'],
  ['function writeApps(data)', 'db.writeApps(data)'],
];

let count = 0;
for (const [funcSig, body] of funcs) {
  // Find this function definition
  const idx = content.indexOf(funcSig);
  if (idx === -1) {
    console.log('NOT FOUND: ' + funcSig);
    continue;
  }
  
  // Find the opening brace after the signature
  const afterParen = content.indexOf(')', idx);
  const openBrace = content.indexOf('{', afterParen);
  if (openBrace === -1) continue;
  
  // Find matching closing brace
  let depth = 1;
  let end = openBrace + 1;
  while (depth > 0 && end < content.length) {
    if (content[end] === '{') depth++;
    else if (content[end] === '}') depth--;
    end++;
  }
  
  const fullFunc = content.slice(idx, end);
  
  // Extract function name
  const nameMatch = funcSig.match(/function (\w+)\(/);
  const paramsMatch = funcSig.match(/\(([^)]*)\)/);
  const name = nameMatch ? nameMatch[1] : '';
  const params = paramsMatch ? paramsMatch[1] : '';
  const paramStr = params ? ' (' + params + ')' : ' ()';
  
  const replacement = 'function ' + name + paramStr + ' { ' + body + '; }';
  content = content.replace(fullFunc, replacement);
  count++;
}

console.log('Replaced ' + count + ' functions');

// 4. Remove ensureDir (no longer needed since all functions use db)
// But keep it as a no-op to avoid breaking calls

fs.writeFileSync('C:\\Users\\wyxgg\\Desktop\\test\\server.js', content, 'utf8');
console.log('Done');
