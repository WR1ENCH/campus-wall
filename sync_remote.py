import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

cmds = [
    ('Git状态', 'cd /www/wwwroot/campus-wall && git status --short'),
    ('拉取更新', 'cd /www/wwwroot/campus-wall && git pull origin master 2>&1'),
    ('验证db.js变更', 'cd /www/wwwroot/campus-wall && git diff HEAD~1 --stat'),
    ('语法检查', 'cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -c db.js 2>&1'),
    ('重启服务', 'bash /tmp/restart2.sh 2>&1; sleep 2; ps aux | grep "node server" | grep -v grep'),
]

for title, cmd in cmds:
    print('=== ' + title + ' ===')
    si, so, se = c.exec_command(cmd, timeout=15)
    out = so.read().decode('utf-8', errors='replace')
    err = se.read().decode('utf-8', errors='replace')
    if out: print(out)
    if err: print('ERR:', err[:300])
    print()

c.close()
