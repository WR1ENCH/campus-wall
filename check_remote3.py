import paramiko, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

cmds = [
    ('server.err末尾', 'tail -50 /www/wwwroot/campus-wall/server.err'),
    ('是否还有json文件被引用', 'grep -n "POSTS_FILE\|USERS_FILE\|ADMINS_FILE\|REPORTS_FILE\|FEEDBACK_FILE\|LOGS_FILE\|BULLYING_FILE\|CREDIT" /www/wwwroot/campus-wall/server.js | head -20'),
    ('确认users.json不存在', 'cat /www/wwwroot/campus-wall/data/users.json 2>&1'),
    ('admins.json是否存在', 'cat /www/wwwroot/campus-wall/data/admins.json 2>&1'),
    ('posts.json是否存在', 'cat /www/wwwroot/campus-wall/data/posts.json 2>&1'),
    ('backups目录', 'ls -la /www/wwwroot/campus-wall/backup/ 2>&1'),
    ('git log', 'cd /www/wwwroot/campus-wall && git log -1 --format="%H %s"'),
    ('qrcodes.json去哪了', 'ls -la /www/wwwroot/campus-wall/data/qrcodes.json 2>&1; cat /www/wwwroot/campus-wall/data/qrcodes.json 2>&1'),
    ('sensitive_whitelist.json干啥的', 'cat /www/wwwroot/campus-wall/data/sensitive_whitelist.json 2>&1'),
    ('student_council.json', 'cat /www/wwwroot/campus-wall/data/student_council.json 2>&1'),
    ('WAL完整性检查', "cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA integrity_check;' 2>&1"),
    ('WAL检查点', "cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA wal_checkpoint(TRUNCATE);' 2>&1"),
    ('WAL文件是否还在', 'ls -la /www/wwwroot/campus-wall/data/campus.db-wal 2>&1'),
    ('再次确认行数', "cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"SELECT 'users:', COUNT(*) FROM users; SELECT 'admins:', COUNT(*) FROM admins; SELECT 'posts:', COUNT(*) FROM posts; SELECT 'login_logs:', COUNT(*) FROM login_logs; SELECT 'notices:', COUNT(*) FROM notices; SELECT 'reports:', COUNT(*) FROM reports;\" 2>&1"),
]

for title, cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    print('=== ' + title + ' ===')
    if out: print(out)
    if err: print('ERR: ' + err[:300])
    print()

client.close()
