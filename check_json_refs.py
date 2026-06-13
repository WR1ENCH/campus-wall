import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 检查是否还有 JSON 文件相关的引用
cmds = [
    'grep -n "\.json" /www/wwwroot/campus-wall/server.js | head -40',
    'grep -n "readFileSync\|writeFileSync" /www/wwwroot/campus-wall/server.js | head -20',
    'grep -n "DATA_DIR\|POSTS_FILE\|USERS_FILE\|ADMINS_FILE" /www/wwwroot/campus-wall/server.js | head -20',
    'grep -c "\.json" /www/wwwroot/campus-wall/server.js',
]

for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out.strip():
        print(f'=== {cmd} ===')
        print(out[:1000])
    if err.strip():
        print(f'ERR: {err[:200]}')

client.close()
