import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Show latest 5 notices
print('=== Latest 5 notices ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -header -column campus.db 'SELECT id, title, createdAt FROM notices ORDER BY createdAt DESC LIMIT 5;'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Delete the latest 2
print('\n=== Delete latest 2 ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'DELETE FROM notices WHERE id IN (SELECT id FROM notices ORDER BY createdAt DESC LIMIT 2);'", timeout=10)
print('Done')

# Verify
print('\n=== Remaining notices ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -header -column campus.db 'SELECT id, title, createdAt FROM notices ORDER BY createdAt DESC LIMIT 5;'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
