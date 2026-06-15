import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# First revert the broken file - git checkout the clean version
print('=== Revert broken file ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git checkout -- server.js 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])

# Now apply a clean patch with proper brace matching
patch_code = r'''
const fs = require('fs');
let c = fs.readFileSync('/www/wwwroot/campus-wall/server.js', 'utf8');

// 1. Add db require
if (!c.includes('const db = require')) {
  c = c.replace("const cookieParser = require('cookie-parser');",
    "const cookieParser = require('cookie-parser');\nconst db = require('./db');");
}

// 2. All function replacements: [funcName, paramName, newBody]
const funcs = [
  ['readPosts', '', 'return db.readPosts()'],
  ['writePosts', 'posts', 'db.writePosts(posts)'],
  ['readAdmins', '', 'return db.readAdmins()'],
  ['writeAdmins', 'admins', 'db.writeAdmins(admins)'],
  ['hasAdmins', '', 'return db.readAdmins().length > 0'],
  ['readUsers', '', 'return db.readUsers()'],
  ['writeUsers', 'users', 'db.writeUsers(users)'],
  ['readTrustTokens', '', 'return db.readTrustTokens()'],
  ['writeTrustTokens', 'tokens', 'db.writeTrustTokens(tokens)'],
  ['readLogs', '', 'return db.readLogs()'],
  ['writeLogs', 'logs', 'db.writeLogs(logs)'],
  ['readReports', '', 'return db.readReports()'],
  ['writeReports', 'reports', 'db.writeReports(reports)'],
  ['readFeedbacks', '', 'return db.readFeedbacks()'],
  ['writeFeedbacks', 'feedbacks', 'db.writeFeedbacks(feedbacks)'],
  ['readBullying', '', 'return db.readBullying()'],
  ['writeBullying', 'data', 'db.writeBullying(data)'],
  ['readCreditLogs', '', 'return db.readCreditLogs()'],
  ['writeCreditLogs', 'logs', 'db.writeCreditLogs(logs)'],
  ['readCreditCards', '', 'return db.readCreditCards()'],
  ['writeCreditCards', 'cards', 'db.writeCreditCards(cards)'],
  ['readAnnouncement', '', 'return db.readAnnouncement()'],
  ['writeAnnouncement', 'data', 'db.writeAnnouncement(data)'],
  ['readDiscussions', '', 'return db.readDiscussions()'],
  ['writeDiscussions', 'discussions', 'db.writeDiscussions(discussions)'],
  ['readDiscussionComments', '', 'return db.readDiscussionComments()'],
  ['writeDiscussionComments', 'comments', 'db.writeDiscussionComments(comments)'],
  ['readQAQuestions', '', 'return db.readQAQuestions()'],
  ['writeQAQuestions', 'data', 'db.writeQAQuestions(data)'],
  ['readQAAnswers', '', 'return db.readQAAnswers()'],
  ['writeQAAnswers', 'data', 'db.writeQAAnswers(data)'],
  ['readPickupAuctions', '', 'return db.readPickupAuctions()'],
  ['writePickupAuctions', 'data', 'db.writePickupAuctions(data)'],
  ['readPickupReports', '', 'return db.readPickupReports()'],
  ['writePickupReports', 'data', 'db.writePickupReports(data)'],
  ['readSC', '', 'return db.readSC()'],
  ['writeSC', 'data', 'db.writeSC(data)'],
  ['readNotices', '', 'return db.readNotices()'],
  ['writeNotices', 'data', 'db.writeNotices(data)'],
  ['readPasskey', '', 'return db.readPasskey()'],
  ['writePasskey', 'data', 'db.writePasskey(data)'],
  ['readApps', '', 'return db.readApps()'],
  ['writeApps', 'data', 'db.writeApps(data)'],
];

let n = 0;
for (const [fn, param, body] of funcs) {
  const search = 'function ' + fn + '(';
  let idx = c.indexOf(search);
  if (idx < 0) continue;

  // Find the matching close brace
  const startBrace = c.indexOf('{', idx);
  if (startBrace < 0) continue;

  let depth = 1;
  let end = startBrace + 1;
  while (depth > 0 && end < c.length) {
    if (c[end] === '{') depth++;
    else if (c[end] === '}') depth--;
    end++;
  }

  const oldFunc = c.slice(idx, end);
  const newFunc = 'function ' + fn + '(' + param + ') { ' + body + '; }';
  c = c.replace(oldFunc, newFunc);
  n++;
}

fs.writeFileSync('/www/wwwroot/campus-wall/server.js', c, 'utf8');
console.log('Patched ' + n + ' functions');
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/patch_clean.js', 'w') as f:
        f.write(patch_code)

si, so, se = c.exec_command(NODE + ' /tmp/patch_clean.js 2>&1')
print(so.read().decode('utf-8', errors='replace'))

si, so, se = c.exec_command(NODE + ' -c /www/wwwroot/campus-wall/server.js 2>&1')
print('Syntax:', so.read().decode('utf-8', errors='replace') or 'OK')

# Verify all functions
print('\n=== Verify ===')
for fn in ['readPosts','writePosts','readNotices','writeNotices','readBullying','writeBullying']:
    si, so, se = c.exec_command('grep "function ' + fn + '" /www/wwwroot/campus-wall/server.js', timeout=3)
    out = so.read().decode('utf-8', errors='replace').strip()
    status = '✅' if 'db.' in out else '❌'
    print(f'{status} {fn}: {out[:70]}')

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Test
si, so, se = c.exec_command('curl -s http://localhost:3000/api/notices 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get(\\"data\\",[])),\'notices\')"', timeout=10)
print('Notices:', so.read().decode('utf-8', errors='replace').strip())

si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1')
print('Admin:', so.read().decode('utf-8', errors='replace')[:60])

c.close()
