import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== notices schema ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '.schema notices'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Simple count ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM notices;'", timeout=10)
print('Count:', so.read().decode('utf-8', errors='replace').strip())

print('\n=== All notices simple ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -header -column campus.db 'SELECT id, title FROM notices;'", timeout=10)
print(so.read().decode('utf-8', errors='replace')[:500])

print('\n=== targetUserId column check ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA table_info(notices);'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
