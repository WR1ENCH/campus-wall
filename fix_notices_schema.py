import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

cmds = [
    "ALTER TABLE notices ADD COLUMN auto INTEGER DEFAULT 0;",
    "ALTER TABLE notices ADD COLUMN targetUserId TEXT;",
]

for cmd in cmds:
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '" + cmd + "' 2>&1", timeout=10)
    err = se.read().decode('utf-8', errors='replace')
    out = so.read().decode('utf-8', errors='replace')
    if out:
        print(out)
    if err:
        print('ERR:', err[:200])

print('\n=== Schema after fix ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA table_info(notices);'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Mark old auto notices (by author "系统")
print('\n=== Mark old auto notices ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"UPDATE notices SET auto=1 WHERE author='系统';\"", timeout=10)
print('Marked' if not so.read().decode('utf-8', errors='replace') else 'Error')

# Verify
print('\n=== Auto notices count ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM notices WHERE auto=1;'", timeout=10)
print('Auto:', so.read().decode('utf-8', errors='replace').strip())

print('\n=== Non-auto notices count ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM notices WHERE auto IS NULL OR auto=0;'", timeout=10)
print('Non-auto:', so.read().decode('utf-8', errors='replace').strip())

c.close()
