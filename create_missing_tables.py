import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Create proper tables for feedbacks, pickup_reports, qrcodes, sensitive_custom
cmds = [
    'DROP TABLE IF EXISTS feedbacks',
    'CREATE TABLE feedbacks ("id" TEXT,"type" TEXT,"description" TEXT,"contact" TEXT,"images" TEXT,"time" TEXT,"status" TEXT,"handledBy" TEXT,"handledAt" TEXT)',
    'DROP TABLE IF EXISTS pickup_reports',
    'CREATE TABLE pickup_reports ("id" TEXT,"bidId" TEXT,"reason" TEXT,"reportedBy" TEXT,"createdAt" TEXT,"status" TEXT)',
    'DROP TABLE IF EXISTS qrcodes',
    'CREATE TABLE qrcodes ("token" TEXT,"userId" TEXT,"createdAt" TEXT,"status" TEXT,"userAgent" TEXT)',
    'DROP TABLE IF EXISTS sensitive_custom',
    'CREATE TABLE sensitive_custom ("_key" TEXT,"_value" TEXT)',
]

for cmd in cmds:
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '" + cmd + "' 2>&1", timeout=5)
    out = so.read().decode('utf-8', errors='replace')
    if out and 'error' in out.lower():
        print(f'ERROR: {cmd[:40]}... => {out[:100]}')

# Verify
print('=== Verify all tables ===')
for t in ['feedbacks', 'pickup_reports', 'qrcodes', 'sensitive_custom', 'reports', 'bullying']:
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA table_info(" + t + ");' | wc -l", timeout=5)
    cols = so.read().decode('utf-8', errors='replace').strip()
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM " + t + ";'", timeout=5)
    cnt = so.read().decode('utf-8', errors='replace').strip()
    print(f'{t}: {cols} cols, {cnt} rows')

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])

import time
time.sleep(2)
si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1')
print('Admin:', so.read().decode('utf-8', errors='replace')[:60])

c.close()
