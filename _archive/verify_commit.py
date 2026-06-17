import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

cmds = [
    # 确认 commit 包含哪些文件
    'cd /www/wwwroot/campus-wall && git show --name-status HEAD',
    # 看 server.err 是否在 commit 里
    'cd /www/wwwroot/campus-wall && git show HEAD -- server.err | head -5',
    # 看 package.json 是否包含 better-sqlite3
    'cd /www/wwwroot/campus-wall && grep "better-sqlite3" package.json',
    # 看 server.js 是否使用 db
    'cd /www/wwwroot/campus-wall && grep "require.*db" server.js',
    # migrate.js 内容
    'wc -l /www/wwwroot/campus-wall/migrate.js',
]

for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    print(f'=== {cmd} ===')
    print(out[:500])
    if err: print(f'ERR: {err[:200]}')

client.close()
