import paramiko, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

cmds = [
    ('server日志', 'ls -la /www/wwwroot/campus-wall/server*.log 2>&1; ls -la /www/wwwroot/campus-wall/server*.err 2>&1'),
    ('查看最近日志部分', 'tail -30 /www/wwwroot/campus-wall/server.log 2>&1'),
    ('users.json是否存在', 'ls -la /www/wwwroot/campus-wall/data/users.json 2>&1'),
    ('哪些JSON文件还存在', 'ls /www/wwwroot/campus-wall/data/*.json 2>&1'),
    ('server.js中readPosts函数', 'grep -A2 "function readPosts" /www/wwwroot/campus-wall/server.js | head -5'),
    ('备份文件是否存在', 'ls -la /www/wwwroot/campus-wall/server.js.json-backup 2>&1'),
    ('node路径', 'which /www/server/nodejs/v22.22.3/bin/node 2>&1'),
    ('语法检查', 'cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -c server.js 2>&1'),
    ('db语法检查', 'cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -c db.js 2>&1'),
    ('查看server.js中readUsers定义', 'grep -n "function readUsers" /www/wwwroot/campus-wall/server.js'),
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
