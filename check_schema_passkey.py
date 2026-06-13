import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== notice_passkey table schema ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '.schema notice_passkey'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Check the actual JSON file structure ===')
si, so, se = c.exec_command('cat /www/wwwroot/campus-wall/data/notice_passkey.json 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:200])

# Also check db.js writePasskey
print('\n=== db.js writePasskey ===')
si, so, se = c.exec_command("grep -A12 'function writePasskey' /www/wwwroot/campus-wall/db.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
