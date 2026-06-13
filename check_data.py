import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== DB file exists? ===')
si, so, se = c.exec_command('ls -la /www/wwwroot/campus-wall/data/campus.db 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('=== SQLite data count ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM admins; SELECT COUNT(*) FROM posts; SELECT COUNT(*) FROM notices;' 2>&1", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('=== hasAdmins function ===')
si, so, se = c.exec_command('grep -n "hasAdmins" /www/wwwroot/campus-wall/server.js | head -5', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('=== db.js hasAdmins? ===')
si, so, se = c.exec_command('grep "hasAdmins" /www/wwwroot/campus-wall/db.js', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out or '(not in db.js)')

print('=== EnsureDir function ===')
si, so, se = c.exec_command('grep -n "ensureDir\\|_ensureDir" /www/wwwroot/campus-wall/server.js | head -5', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('=== Direct test: db module ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -e "const db = require(\'./db\'); console.log(\'users:\', db.readUsers().length, \'admins:\', db.readAdmins().length, \'posts:\', db.readPosts().length)" 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
