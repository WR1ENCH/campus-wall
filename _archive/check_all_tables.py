import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== reports table schema ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '.schema reports'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== reports data count ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM reports;'", timeout=10)
print('Count:', so.read().decode('utf-8', errors='replace').strip())

# Also check other tables that might have same issue
for t in ['feedbacks', 'pickup_reports', 'qrcodes', 'sensitive_custom', 'bullying']:
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '.schema " + t + "' 2>&1", timeout=5)
    out = so.read().decode('utf-8', errors='replace')
    cols = out.count('"')
    print(f'\n{t}: {cols//2} cols' if cols else f'\n{t}: (checking...)')
    # Get columns
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA table_info(" + t + ");' 2>&1 | wc -l", timeout=5)
    cnt = so.read().decode('utf-8', errors='replace').strip()
    print(f'  columns: {cnt}')

c.close()
