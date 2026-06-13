import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Get raw API response
print('=== GET /api/notices RAW ===')
si, so, se = c.exec_command('curl -s http://localhost:3000/api/notices 2>&1 | head -c 500', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:500])

# Check the notices route code
print('\n=== Notices route ===')
si, so, se = c.exec_command("grep -A10 'app.get.\\|/api/notices' /www/wwwroot/campus-wall/server.js | head -20", timeout=5)
out = so.read().decode('utf-8', errors='replace')
# Find the exact route
print(out)

# Check writeNotices definition
print('\n=== writeNotices ===')
si, so, se = c.exec_command("sed -n '4706,4715p' /www/wwwroot/campus-wall/server.js", timeout=5)
print(so.read().decode('utf-8', errors='replace'))

c.close()
