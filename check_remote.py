import paramiko, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

commands = [
    ('data目录内容', 'ls -la /www/wwwroot/campus-wall/data/ 2>&1'),
    ('campus.db是否存在', 'ls -la /www/wwwroot/campus-wall/data/campus.db 2>&1'),
    ('SQLite表结构', "sqlite3 /www/wwwroot/campus-wall/data/campus.db '.tables' 2>&1"),
    ('各表行数', "sqlite3 /www/wwwroot/campus-wall/data/campus.db \"SELECT 'posts:', COUNT(*) FROM posts; SELECT 'users:', COUNT(*) FROM users; SELECT 'admins:', COUNT(*) FROM admins; SELECT 'reports:', COUNT(*) FROM reports; SELECT 'discussions:', COUNT(*) FROM discussions; SELECT 'notices:', COUNT(*) FROM notices; SELECT 'login_logs:', COUNT(*) FROM login_logs;\" 2>&1"),
    ('server.js是否使用db.js', 'grep "require.*db" /www/wwwroot/campus-wall/server.js'),
    ('server.js开头10行', 'head -10 /www/wwwroot/campus-wall/server.js'),
    ('JSON文件内容示例', 'head -3 /www/wwwroot/campus-wall/data/users.json 2>&1 | head -c 200'),
    ('服务进程', 'ps aux | grep "node server" | grep -v grep'),
    ('服务日志尾', 'tail -30 /www/wwwroot/campus-wall/server_out.log 2>&1 | tail -30'),
    ('better-sqlite3是否正常', "cd /www/wwwroot/campus-wall && node -e 'require(\"better-sqlite3\"); console.log(\"OK\")' 2>&1"),
    ('server.js语法检查', "cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -c server.js 2>&1"),
    ('db.js语法检查', "cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -c db.js 2>&1"),
]

for title, cmd in commands:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    print('=== ' + title + ' ===')
    if out: print(out)
    if err: print('ERR: ' + err[:300])
    print()

client.close()
