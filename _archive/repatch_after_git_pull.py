import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

patch = '''
const fs=require('fs');let c=fs.readFileSync('/www/wwwroot/campus-wall/server.js','utf8');
if(!c.includes("const db = require"))c=c.replace("const cookieParser = require('cookie-parser');","const cookieParser = require('cookie-parser');\\nconst db = require('./db');");
const f=[['readPosts','return db.readPosts()'],['writePosts(p)','db.writePosts(p)'],['readAdmins','return db.readAdmins()'],['hasAdmins','return db.readAdmins().length>0'],['writeAdmins(a)','db.writeAdmins(a)'],['readUsers','return db.readUsers()'],['writeUsers(u)','db.writeUsers(u)'],['readTrustTokens','return db.readTrustTokens()'],['writeTrustTokens(t)','db.writeTrustTokens(t)'],['readLogs','return db.readLogs()'],['writeLogs(l)','db.writeLogs(l)'],['readReports','return db.readReports()'],['writeReports(r)','db.writeReports(r)'],['readFeedbacks','return db.readFeedbacks()'],['writeFeedbacks(f)','db.writeFeedbacks(f)'],['readBullying','return db.readBullying()'],['writeBullying(d)','db.writeBullying(d)'],['readCreditLogs','return db.readCreditLogs()'],['writeCreditLogs(l)','db.writeCreditLogs(l)'],['readCreditCards','return db.readCreditCards()'],['writeCreditCards(c)','db.writeCreditCards(c)'],['readAnnouncement','return db.readAnnouncement()'],['writeAnnouncement(d)','db.writeAnnouncement(d)'],['readDiscussions','return db.readDiscussions()'],['writeDiscussions(d)','db.writeDiscussions(d)'],['readDiscussionComments','return db.readDiscussionComments()'],['writeDiscussionComments(c)','db.writeDiscussionComments(c)'],['readQAQuestions','return db.readQAQuestions()'],['writeQAQuestions(d)','db.writeQAQuestions(d)'],['readQAAnswers','return db.readQAAnswers()'],['writeQAAnswers(d)','db.writeQAAnswers(d)'],['readPickupAuctions','return db.readPickupAuctions()'],['writePickupAuctions(d)','db.writePickupAuctions(d)'],['readPickupReports','return db.readPickupReports()'],['writePickupReports(d)','db.writePickupReports(d)'],['readSC','return db.readSC()'],['writeSC(d)','db.writeSC(d)'],['readNotices','return db.readNotices()'],['writeNotices(d)','db.writeNotices(d)'],['readPasskey','return db.readPasskey()'],['writePasskey(d)','db.writePasskey(d)'],['readApps','return db.readApps()'],['writeApps(d)','db.writeApps(d)']];
let n=0;for(const[fn,bd]of f){const s='function '+fn;let i=c.indexOf(s);if(i<0)continue;let a=c.indexOf(')',i);if(a<0)continue;let b=c.indexOf('{',a);if(b<0)continue;let d=1,e=b+1;while(d>0&&e<c.length){if(c[e]==='{')d++;else if(c[e]==='}')d--;e++}
const pf=fn.includes('(')?fn.split('(')[0]:fn;const pa=fn.includes('(')?fn.slice(fn.indexOf('(')):'()';c=c.replace(c.slice(i,e),'function '+pf+pa+' { '+bd+'; }');n++}
fs.writeFileSync('/www/wwwroot/campus-wall/server.js',c,'utf8');console.log('Patched '+n);
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/p6.js', 'w') as f:
        f.write(patch)

si, so, se = c.exec_command(NODE + ' /tmp/p6.js 2>&1')
print(so.read().decode('utf-8', errors='replace'))

si, so, se = c.exec_command(NODE + ' -c /www/wwwroot/campus-wall/server.js 2>&1')
print('Syntax:', so.read().decode('utf-8', errors='replace') or 'OK')

print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

si, so, se = c.exec_command('ps aux | grep "node server" | grep -v grep', timeout=10)
print('Server:', so.read().decode('utf-8', errors='replace') or '❌')

si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1', timeout=10)
print('Admin:', so.read().decode('utf-8', errors='replace')[:80])

si, so, se = c.exec_command('curl -s http://localhost:3000/api/posts | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get(\\"data\\",[])),\'posts\')"', timeout=10)
print('Posts:', so.read().decode('utf-8', errors='replace').strip())

c.close()
