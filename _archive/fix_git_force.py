import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== server.js readUsers ===')
si, so, se = c.exec_command("grep -A2 'function readUsers' /www/wwwroot/campus-wall/server.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== server.js git log ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -3', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== server.js git diff with HEAD ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git diff --name-only HEAD 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace') or '(clean)')

print('\n=== Force checkout and pull ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git fetch origin master && git reset --hard origin/master 2>&1', timeout=30)
print(so.read().decode('utf-8', errors='replace')[:300])

c.close()
