import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

print('Uploading definitive server.js...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\server.js', '/www/wwwroot/campus-wall/server.js')

# Syntax check
si, so, se = c.exec_command(NODE + ' -c /www/wwwroot/campus-wall/server.js 2>&1')
print('Syntax:', so.read().decode('utf-8', errors='replace') or 'OK')

# Verify key functions exist without needing patch
print('\n=== Verify functions ===')
checks = [
    "grep -c 'require.*db' /www/wwwroot/campus-wall/server.js",
    "grep -c 'db\\.writePosts' /www/wwwroot/campus-wall/server.js",
    "grep -c 'db\\.readPosts' /www/wwwroot/campus-wall/server.js",
    "grep -c 'db\\.readNotices' /www/wwwroot/campus-wall/server.js",
    "grep -c 'db\\.writeNotices' /www/wwwroot/campus-wall/server.js",
    "grep -c 'db\\.readBullying' /www/wwwroot/campus-wall/server.js",
    "grep -c 'db\\.writeBullying' /www/wwwroot/campus-wall/server.js",
]
for cmd in checks:
    si, so, se = c.exec_command(cmd, timeout=10)
    out = so.read().decode('utf-8', errors='replace').strip()
    print(f'  {cmd.split("grep -c ")[1]}: {out}')

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Verify
print('\n=== Verify APIs ===')
si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1')
print('Admin:', so.read().decode('utf-8', errors='replace')[:60])

si, so, se = c.exec_command('curl -s http://localhost:3000/api/posts 2>&1 | head -c 100')
print('Posts:', so.read().decode('utf-8', errors='replace')[:80])

si, so, se = c.exec_command('curl -s http://localhost:3000/api/notices 2>&1 | head -c 100')
print('Notices:', so.read().decode('utf-8', errors='replace')[:80])

si, so, se = c.exec_command('curl -s http://localhost:3000/api/qa/questions 2>&1 | head -c 100')
print('QA:', so.read().decode('utf-8', errors='replace')[:80])

c.close()
