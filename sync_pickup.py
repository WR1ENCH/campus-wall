import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

print('Uploading server.js...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\server.js', '/www/wwwroot/campus-wall/server.js')

# Re-patch
patch = '''
const fs = require("fs");
let content = fs.readFileSync("/www/wwwroot/campus-wall/server.js", "utf8");
const m = "const cookieParser = require(\\'cookie-parser\\');";
if (!content.includes("const db = require")) {
  content = content.replace(m, m + "\\nconst db = require(\\'./db\\');");
}
const funcs = [["readPosts","return db.readPosts()"],["writePosts(posts)","db.writePosts(posts)"],["readAdmins","return db.readAdmins()"],["hasAdmins","return db.readAdmins().length > 0"],["writeAdmins(admins)","db.writeAdmins(admins)"],["readUsers","return db.readUsers()"],["writeUsers(users)","db.writeUsers(users)"],["readTrustTokens","return db.readTrustTokens()"],["writeTrustTokens(tokens)","db.writeTrustTokens(tokens)"],["readLogs","return db.readLogs()"],["writeLogs(logs)","db.writeLogs(logs)"],["readReports","return db.readReports()"],["writeReports(reports)","db.writeReports(reports)"],["readFeedbacks","return db.readFeedbacks()"],["writeFeedbacks(feedbacks)","db.writeFeedbacks(feedbacks)"],["readBullying","return db.readBullying()"],["writeBullying(data)","db.writeBullying(data)"],["readCreditLogs","return db.readCreditLogs()"],["writeCreditLogs(logs)","db.writeCreditLogs(logs)"],["readCreditCards","return db.readCreditCards()"],["writeCreditCards(cards)","db.writeCreditCards(cards)"],["readAnnouncement","return db.readAnnouncement()"],["writeAnnouncement(data)","db.writeAnnouncement(data)"],["readDiscussions","return db.readDiscussions()"],["writeDiscussions(discussions)","db.writeDiscussions(discussions)"],["readDiscussionComments","return db.readDiscussionComments()"],["writeDiscussionComments(comments)","db.writeDiscussionComments(comments)"],["readQAQuestions","return db.readQAQuestions()"],["writeQAQuestions(data)","db.writeQAQuestions(data)"],["readQAAnswers","return db.readQAAnswers()"],["writeQAAnswers(data)","db.writeQAAnswers(data)"],["readPickupAuctions","return db.readPickupAuctions()"],["writePickupAuctions(data)","db.writePickupAuctions(data)"],["readPickupReports","return db.readPickupReports()"],["writePickupReports(data)","db.writePickupReports(data)"],["readSC","return db.readSC()"],["writeSC(data)","db.writeSC(data)"],["readNotices","return db.readNotices()"],["writeNotices(data)","db.writeNotices(data)"],["readPasskey","return db.readPasskey()"],["writePasskey(data)","db.writePasskey(data)"],["readApps","return db.readApps()"],["writeApps(data)","db.writeApps(data)"]];
let c2 = 0;
for (const [fn,body] of funcs) {
  const s = "function " + fn;
  let i = content.indexOf(s);
  if (i < 0) continue;
  const a = content.indexOf(")", i);
  if (a < 0) continue;
  const b = content.indexOf("{", a);
  if (b < 0) continue;
  let d = 1, e = b + 1;
  while (d > 0 && e < content.length) {
    if (content[e] === "{") d++;
    else if (content[e] === "}") d--;
    e++;
  }
  const pf = fn.includes("(") ? fn.split("(")[0] : fn;
  const pa = fn.includes("(") ? fn.slice(fn.indexOf("(")) : "()";
  const nf = "function " + pf + pa + " { " + body + "; }";
  content = content.replace(content.slice(i, e), nf);
  c2++;
}
fs.writeFileSync("/www/wwwroot/campus-wall/server.js", content, "utf8");
console.log("Patched " + c2 + " functions");
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/patch3.js', 'w') as f:
        f.write(patch)

si, so, se = c.exec_command(NODE + ' /tmp/patch3.js 2>&1')
print(so.read().decode('utf-8', errors='replace'))

si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1')
print('Syntax:', so.read().decode('utf-8', errors='replace') or 'OK')

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Verify
si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1')
print('Admin:', so.read().decode('utf-8', errors='replace')[:60])

# Check the approve endpoint has the notice code
si, so, se = c.exec_command('grep -c "自动发送 T0" /www/wwwroot/campus-wall/server.js', timeout=10)
print('T0 notice code:', so.read().decode('utf-8', errors='replace').strip(), 'occurrences')

c.close()
