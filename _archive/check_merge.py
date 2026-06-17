import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

cmds = [
    'cd /www/wwwroot/campus-wall && git log --oneline -5',
    'cd /www/wwwroot/campus-wall && git diff HEAD~1 --stat',
    'cd /www/wwwroot/campus-wall && git status',
    # 检查 package-lock.json 是否有变更
    'cd /www/wwwroot/campus-wall && git diff --name-only HEAD 2>/dev/null',
    # 看看 migrate.js 内容
    'head -3 /www/wwwroot/campus-wall/migrate.js',
]

for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    print(f'=== {cmd} ===')
    print(out[:600])
    if err: print(f'ERR: {err[:200]}')

client.close()
