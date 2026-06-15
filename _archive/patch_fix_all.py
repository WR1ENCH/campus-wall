import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Simpler, more robust patch: read file line by line, find function defs, replace based on pattern
patch = r'''
const fs = require('fs');
let content = fs.readFileSync('/www/wwwroot/campus-wall/server.js', 'utf8');

// 1. Ensure db require
const marker = "const cookieParser = require('cookie-parser');";
if (!content.includes('const db = require')) {
  content = content.replace(marker, marker + "\nconst db = require('./db');");
}

// 2. Replace ALL read/write data functions with db aliases
// Use regex for robust matching
const pairs = [
  ['readPosts', 'return db.readPosts()'],
  ['writePosts', 'db.writePosts(posts)'],
  ['readAdmins', 'return db.readAdmins()'],
  ['writeAdmins', 'db.writeAdmins(admins)'],
  ['hasAdmins', 'return db.readAdmins().length > 0'],
  ['readUsers', 'return db.readUsers()'],
  ['writeUsers', 'db.writeUsers(users)'],
  ['readTrustTokens', 'return db.readTrustTokens()'],
  ['writeTrustTokens', 'db.writeTrustTokens(tokens)'],
  ['readLogs', 'return db.readLogs()'],
  ['writeLogs', 'db.writeLogs(logs)'],
  ['readReports', 'return db.readReports()'],
  ['writeReports', 'db.writeReports(reports)'],
  ['readFeedbacks', 'return db.readFeedbacks()'],
  ['writeFeedbacks', 'db.writeFeedbacks(feedbacks)'],
  ['readBullying', 'return db.readBullying()'],
  ['writeBullying', 'db.writeBullying(data)'],
  ['readCreditLogs', 'return db.readCreditLogs()'],
  ['writeCreditLogs', 'db.writeCreditLogs(logs)'],
  ['readCreditCards', 'return db.readCreditCards()'],
  ['writeCreditCards', 'db.writeCreditCards(cards)'],
  ['readAnnouncement', 'return db.readAnnouncement()'],
  ['writeAnnouncement', 'db.writeAnnouncement(data)'],
  ['readDiscussions', 'return db.readDiscussions()'],
  ['writeDiscussions', 'db.writeDiscussions(discussions)'],
  ['readDiscussionComments', 'return db.readDiscussionComments()'],
  ['writeDiscussionComments', 'db.writeDiscussionComments(comments)'],
  ['readQAQuestions', 'return db.readQAQuestions()'],
  ['writeQAQuestions', 'db.writeQAQuestions(data)'],
  ['readQAAnswers', 'return db.readQAAnswers()'],
  ['writeQAAnswers', 'db.writeQAAnswers(data)'],
  ['readPickupAuctions', 'return db.readPickupAuctions()'],
  ['writePickupAuctions', 'db.writePickupAuctions(data)'],
  ['readPickupReports', 'return db.readPickupReports()'],
  ['writePickupReports', 'db.writePickupReports(data)'],
  ['readSC', 'return db.readSC()'],
  ['writeSC', 'db.writeSC(data)'],
  ['readNotices', 'return db.readNotices()'],
  ['writeNotices', 'db.writeNotices(data)'],
  ['readPasskey', 'return db.readPasskey()'],
  ['writePasskey', 'db.writePasskey(data)'],
  ['readApps', 'return db.readApps()'],
  ['writeApps', 'db.writeApps(data)'],
];

let count = 0;
for (const [name, body] of pairs) {
  // Find: function name(...params...) { ... anything ... }
  // Replace with: function name(...same params...) { body; }
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\}', 'g');
  const match = content.match(re);
  if (!match) {
    console.log('NOT FOUND: ' + name);
    continue;
  }
  // Extract the original parameter list
  const paramsMatch = match[0].match(/function\s+' + name + '\s*\(([^)]*)\)/);
  // Actually just use the original params from the match
  const origFunc = match[0];
  const openParen = origFunc.indexOf('(');
  const closeParen = origFunc.indexOf(')', openParen);
  const params = origFunc.slice(openParen, closeParen + 1);
  const replacement = 'function ' + name + params + ' { ' + body + '; }';
  content = content.replace(origFunc, replacement);
  count++;
}

fs.writeFileSync('/www/wwwroot/campus-wall/server.js', content, 'utf8');
console.log('Patched ' + count + ' functions');
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/patch_final.js', 'w') as f:
        f.write(patch)

si, so, se = c.exec_command(NODE + ' /tmp/patch_final.js 2>&1')
print(so.read().decode('utf-8', errors='replace'))

si, so, se = c.exec_command(NODE + ' -c /www/wwwroot/campus-wall/server.js 2>&1')
print('Syntax:', so.read().decode('utf-8', errors='replace') or 'OK')

# Verify
print('\n=== Verify patches ===')
for t in ['readPosts','writePosts','readNotices','writeNotices','readBullying','writeBullying']:
    si, so, se = c.exec_command('grep "function ' + t + '" /www/wwwroot/campus-wall/server.js', timeout=3)
    out = so.read().decode('utf-8', errors='replace').strip()
    if 'db.' in out:
        print(f'✅ {t}: {out[:70]}')
    else:
        print(f'❌ {t}: {out[:70]}')

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Test notifications
print('\n=== Test notices API ===')
si, so, se = c.exec_command('curl -s http://localhost:3000/api/notices 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get(\\"data\\",[])),\'notices\')"', timeout=10)
print(so.read().decode('utf-8', errors='replace').strip())

si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1')
print('Admin:', so.read().decode('utf-8', errors='replace')[:60])

c.close()
