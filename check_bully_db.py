import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== Bullying table schema ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '.schema bullying'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Bullying data count ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM bullying;'", timeout=10)
print('Count:', so.read().decode('utf-8', errors='replace').strip())

print('\n=== Bullying data (first row) ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -header -json campus.db 'SELECT * FROM bullying LIMIT 1;'", timeout=10)
print(so.read().decode('utf-8', errors='replace')[:300])

print('\n=== Check description column ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"SELECT id, description FROM bullying LIMIT 1;\"", timeout=10)
print(so.read().decode('utf-8', errors='replace')[:200])

print('\n=== Check columns ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA table_info(bullying);'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
