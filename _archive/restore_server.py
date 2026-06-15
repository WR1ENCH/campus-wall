import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Step 1: Try git stash pop first (the patched version might still be stashed)
print('=== Try git stash pop ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git stash pop 2>&1', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:300])

# Step 2: Check if db require exists
si, so, se = c.exec_command('grep "require.*db" /www/wwwroot/campus-wall/server.js', timeout=10)
out = so.read().decode('utf-8', errors='replace')
if out:
    print('✅ db require found')
else:
    print('❌ db require NOT found - need to re-patch')
    
    # Step 3: Upload patch script and run
    print('\nRe-patching server.js...')
    
    # Use node to add const db = require('./db') and replace all data functions
    patch_code = r'''
const fs = require('fs');
let content = fs.readFileSync('/www/wwwroot/campus-wall/server.js', 'utf8');

// 1. Add db require
const marker = "const cookieParser = require('cookie-parser');";
if (!content.includes('const db = require')) {
  content = content.replace(marker, marker + '\nconst db = require(\'./db\');');
  console.log('Added db require');
}

// 2. Replace data functions with db aliases
const replacements = [
  ['readPosts', 'return db.readPosts()'],
  ['writePosts(posts)', 'db.writePosts(posts)'],
  ['readAdmins', 'return db.readAdmins()'],
  ['writeAdmins(admins)', 'db.writeAdmins(admins)'],
  ['readUsers', 'return db.readUsers()'],
  ['writeUsers(users)', 'db.writeUsers(users)'],
  ['readTrustTokens', 'return db.readTrustTokens()'],
  ['writeTrustTokens(tokens)', 'db.writeTrustTokens(tokens)'],
  ['readLogs', 'return db.readLogs()'],
  ['writeLogs(logs)', 'db.writeLogs(logs)'],
  ['readReports', 'return db.readReports()'],
  ['writeReports(reports)', 'db.writeReports(reports)'],
  ['readFeedbacks', 'return db.readFeedbacks()'],
  ['writeFeedbacks(feedbacks)', 'db.writeFeedbacks(feedbacks)'],
  ['readBullying', 'return db.readBullying()'],
  ['writeBullying(data)', 'db.writeBullying(data)'],
  ['readCreditLogs', 'return db.readCreditLogs()'],
  ['writeCreditLogs(logs)', 'db.writeCreditLogs(logs)'],
  ['readCreditCards', 'return db.readCreditCards()'],
  ['writeCreditCards(cards)', 'db.writeCreditCards(cards)'],
  ['readAnnouncement', 'return db.readAnnouncement()'],
  ['writeAnnouncement(data)', 'db.writeAnnouncement(data)'],
  ['readDiscussions', 'return db.readDiscussions()'],
  ['writeDiscussions(discussions)', 'db.writeDiscussions(discussions)'],
  ['readDiscussionComments', 'return db.readDiscussionComments()'],
  ['writeDiscussionComments(comments)', 'db.writeDiscussionComments(comments)'],
  ['readQAQuestions', 'return db.readQAQuestions()'],
  ['writeQAQuestions(data)', 'db.writeQAQuestions(data)'],
  ['readQAAnswers', 'return db.readQAAnswers()'],
  ['writeQAAnswers(data)', 'db.writeQAAnswers(data)'],
  ['readPickupAuctions', 'return db.readPickupAuctions()'],
  ['writePickupAuctions(data)', 'db.writePickupAuctions(data)'],
  ['readPickupReports', 'return db.readPickupReports()'],
  ['writePickupReports(data)', 'db.writePickupReports(data)'],
  ['readSC', 'return db.readSC()'],
  ['writeSC(data)', 'db.writeSC(data)'],
  ['readNotices', 'return db.readNotices()'],
  ['writeNotices(data)', 'db.writeNotices(data)'],
  ['readPasskey', 'return db.readPasskey()'],
  ['writePasskey(data)', 'db.writePasskey(data)'],
  ['readApps', 'return db.readApps()'],
  ['writeApps(data)', 'db.writeApps(data)'],
];

let count = 0;
for (const [fn, body] of replacements) {
  const search = 'function ' + fn;
  const idx = content.indexOf(search);
  if (idx === -1) continue;
  const start = idx;
  const afterParen = content.indexOf(')', start);
  if (afterParen === -1) continue;
  const afterOpen = content.indexOf('{', afterParen);
  if (afterOpen === -1) continue;
  // Find matching close brace
  let depth = 1;
  let end = afterOpen + 1;
  while (depth > 0 && end < content.length) {
    if (content[end] === '{') depth++;
    else if (content[end] === '}') depth--;
    end++;
  }
  const fullFunc = content.slice(start, end);
  // Build replacement
  const funcName = fn.includes('(') ? fn.split('(')[0] : fn;
  const params = fn.includes('(') ? fn.slice(fn.indexOf('(')) : '()';
  const newFunc = 'function ' + funcName + params + ' { ' + body + '; }';
  content = content.replace(fullFunc, newFunc);
  count++;
}

// Fix ensureDir (just in case)
content = content.replace(
  'function ensureDir()',
  'function _ensureDir()'
);

fs.writeFileSync('/www/wwwroot/campus-wall/server.js', content, 'utf8');
console.log('Replaced ' + count + ' functions');
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/patch.js', 'w') as f:
        f.write(patch_code)

si, so, se = c.exec_command(NODE + ' /tmp/patch.js 2>&1', timeout=15)
out = so.read().decode('utf-8', errors='replace')
err = se.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:300])

# Syntax check
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Syntax:', out or 'OK')

# Verify
si, so, se = c.exec_command('grep -c "require.*db" /www/wwwroot/campus-wall/server.js; echo "---"; grep -c "db\\.readPosts" /www/wwwroot/campus-wall/server.js', timeout=10)
out = so.read().decode('utf-8', errors='replace')
parts = out.split('---')
print('db require:', parts[0].strip())
print('db.readPosts:', parts[1].strip() if len(parts) > 1 else '?')

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:100])
time.sleep(2)

# Verify API
si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Admin check:', out[:100])

si, so, se = c.exec_command('curl -s http://localhost:3000/api/posts | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get(\"data\",[])),\'posts\')"', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Posts:', out.strip())

si, so, se = c.exec_command('curl -s http://localhost:3000/api/notices | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get(\"data\",[])),\'notices\')"', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Notices:', out.strip())

c.close()
