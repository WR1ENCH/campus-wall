import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Find the exact GET /api/notices code
print('=== GET /api/notices ===')
si, so, se = c.exec_command("grep -n 'app.get.*api/notices' /www/wwwroot/campus-wall/server.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Show the exact filter lines
si, so, se = c.exec_command("sed -n '4735,4745p' /www/wwwroot/campus-wall/server.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
