import paramiko, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 1. 上传 db.js
print('📤 Uploading db.js...')
local_db = r'C:\Users\wyxgg\Desktop\test\db.js'
with client.open_sftp() as sftp:
    sftp.put(local_db, '/www/wwwroot/campus-wall/db.js')
print('✅ db.js uploaded')

# 2. 备份原 server.js
print('\n📦 Backing up server.js...')
stdin, stdout, stderr = client.exec_command('cp /www/wwwroot/campus-wall/server.js /www/wwwroot/campus-wall/server.js.json-backup')
stdout.read()
print('✅ Backup: server.js.json-backup')

# 3. 修改 server.js
# 在顶部添加 require('./db')
stdin, stdout, stderr = client.exec_command("""
cd /www/wwwroot/campus-wall
# 在 const fs = require('fs'); 行后添加 db 引用
# 使用 Python 做精确替换
python3 << 'PYEOF'
import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 在 fs require 后添加 db require
content = content.replace(
    "const cookieParser = require('cookie-parser');",
    "const cookieParser = require('cookie-parser');\nconst db = require('./db');"
)

# 替换所有 read/write 函数定义为一行的别名
# 匹配模式: function readXxx() { ... 多行 ... }
# 替换为: const readXxx = db.readXxx;

replacements = [
    # Posts
    (r'function readPosts\(\) \{[^}]+\}[ \t]*\n', 'const readPosts = db.readPosts;\n'),
    (r'function writePosts\(posts\) \{[^}]+\}[ \t]*\n', 'const writePosts = db.writePosts;\n'),
    # Admins
    (r'function readAdmins\(\) \{[^}]+\}[ \t]*\n', 'const readAdmins = db.readAdmins;\n'),
    (r'function hasAdmins\(\) \{[^}]+\}[ \t]*\n', 'function hasAdmins() { return db.readAdmins().length > 0; }\n'),
    (r'function writeAdmins\(admins\) \{[^}]+\}[ \t]*\n', 'const writeAdmins = db.writeAdmins;\n'),
    # Users
    (r'function readUsers\(\) \{[^}]+\}[ \t]*\n', 'const readUsers = db.readUsers;\n'),
    (r'function writeUsers\(users\) \{[^}]+\}[ \t]*\n', 'const writeUsers = db.writeUsers;\n'),
    # Trust tokens
    (r'function readTrustTokens\(\) \{[^}]+\}[ \t]*\n', 'const readTrustTokens = db.readTrustTokens;\n'),
    (r'function writeTrustTokens\(tokens\) \{[^}]+\}[ \t]*\n', 'const writeTrustTokens = db.writeTrustTokens;\n'),
    # Logs
    (r'function readLogs\(\) \{[^}]+\}[ \t]*\n', 'const readLogs = db.readLogs;\n'),
    (r'function writeLogs\(logs\) \{[^}]+\}[ \t]*\n', 'const writeLogs = db.writeLogs;\n'),
    # Reports
    (r'function readReports\(\) \{[^}]+\}[ \t]*\n', 'const readReports = db.readReports;\n'),
    (r'function writeReports\(reports\) \{[^}]+\}[ \t]*\n', 'const writeReports = db.writeReports;\n'),
    # Feedbacks
    (r'function readFeedbacks\(\) \{[^}]+\}[ \t]*\n', 'const readFeedbacks = db.readFeedbacks;\n'),
    (r'function writeFeedbacks\(feedbacks\) \{[^}]+\}[ \t]*\n', 'const writeFeedbacks = db.writeFeedbacks;\n'),
    # Bullying
    (r'function readBullying\(\) \{[^}]+\}[ \t]*\n', 'const readBullying = db.readBullying;\n'),
    (r'function writeBullying\(data\) \{[^}]+\}[ \t]*\n', 'const writeBullying = db.writeBullying;\n'),
    # Credit logs
    (r'function readCreditLogs\(\) \{[^}]+\}[ \t]*\n', 'const readCreditLogs = db.readCreditLogs;\n'),
    (r'function writeCreditLogs\(logs\) \{[^}]+\}[ \t]*\n', 'const writeCreditLogs = db.writeCreditLogs;\n'),
    # Credit cards
    (r'function readCreditCards\(\) \{[^}]+\}[ \t]*\n', 'const readCreditCards = db.readCreditCards;\n'),
    (r'function writeCreditCards\(cards\) \{[^}]+\}[ \t]*\n', 'const writeCreditCards = db.writeCreditCards;\n'),
    # Announcement
    (r'function readAnnouncement\(\) \{[^}]+\}[ \t]*\n', 'const readAnnouncement = db.readAnnouncement;\n'),
    (r'function writeAnnouncement\(data\) \{[^}]+\}[ \t]*\n', 'const writeAnnouncement = db.writeAnnouncement;\n'),
    # Discussions
    (r'function readDiscussions\(\) \{[^}]+\}[ \t]*\n', 'const readDiscussions = db.readDiscussions;\n'),
    (r'function writeDiscussions\(discussions\) \{[^}]+\}[ \t]*\n', 'const writeDiscussions = db.writeDiscussions;\n'),
    # Discussion comments
    (r'function readDiscussionComments\(\) \{[^}]+\}[ \t]*\n', 'const readDiscussionComments = db.readDiscussionComments;\n'),
    (r'function writeDiscussionComments\(comments\) \{[^}]+\}[ \t]*\n', 'const writeDiscussionComments = db.writeDiscussionComments;\n'),
    # QA
    (r'function readQAQuestions\(\) \{[^}]+\}[ \t]*\n', 'const readQAQuestions = db.readQAQuestions;\n'),
    (r'function writeQAQuestions\(data\) \{[^}]+\}[ \t]*\n', 'const writeQAQuestions = db.writeQAQuestions;\n'),
    (r'function readQAAnswers\(\) \{[^}]+\}[ \t]*\n', 'const readQAAnswers = db.readQAAnswers;\n'),
    (r'function writeQAAnswers\(data\) \{[^}]+\}[ \t]*\n', 'const writeQAAnswers = db.writeQAAnswers;\n'),
    # Pickup
    (r'function readPickupAuctions\(\) \{[^}]+\}[ \t]*\n', 'const readPickupAuctions = db.readPickupAuctions;\n'),
    (r'function writePickupAuctions\(data\) \{[^}]+\}[ \t]*\n', 'const writePickupAuctions = db.writePickupAuctions;\n'),
    (r'function readPickupReports\(\) \{[^}]+\}[ \t]*\n', 'const readPickupReports = db.readPickupReports;\n'),
    (r'function writePickupReports\(data\) \{[^}]+\}[ \t]*\n', 'const writePickupReports = db.writePickupReports;\n'),
    # Student council
    (r'function readSC\(\) \{[^}]+\}[ \t]*\n', 'const readSC = db.readSC;\n'),
    (r'function writeSC\(data\) \{[^}]+\}[ \t]*\n', 'const writeSC = db.writeSC;\n'),
    # Notices
    (r'function readNotices\(\) \{[^}]+\}[ \t]*\n', 'const readNotices = db.readNotices;\n'),
    (r'function writeNotices\(data\) \{[^}]+\}[ \t]*\n', 'const writeNotices = db.writeNotices;\n'),
    # Passkey
    (r'function readPasskey\(\) \{[^}]+\}[ \t]*\n', 'const readPasskey = db.readPasskey;\n'),
    (r'function writePasskey\(data\) \{[^}]+\}[ \t]*\n', 'const writePasskey = db.writePasskey;\n'),
    # Apps
    (r'function readApps\(\) \{[^}]+\}[ \t]*\n', 'const readApps = db.readApps;\n'),
    (r'function writeApps\(data\) \{[^}]+\}[ \t]*\n', 'const writeApps = db.writeApps;\n'),
]

for pattern, replacement in replacements:
    content = re.sub(pattern, replacement, content)

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ server.js modified')
PYEOF
""")
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
if out: print(out)
if err: print('STDERR:', err[:500])

# 4. 检查语法
print('\n🔍 Checking syntax...')
stdin, stdout, stderr = client.exec_command('cd /www/wwwroot/campus-wall && ' + '/www/server/nodejs/v22.22.3/bin/node -c server.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err)

client.close()
