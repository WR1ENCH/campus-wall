import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Upload fixed db.js
print('Uploading fixed db.js...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\db.js', '/www/wwwroot/campus-wall/db.js')
print('OK')

# Syntax check
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c db.js 2>&1')
print('Syntax:', so.read().decode('utf-8', errors='replace') or 'OK')

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Login + generate passkey
print('\n=== Login and generate passkey ===')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/admin/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1Ench\",\"password\":\"cai091226\"}'", timeout=10)
login = so.read().decode('utf-8', errors='replace')
import json as j
token = j.loads(login).get('data', {}).get('token', '')
print('Token:', token[:20] + '...' if token else 'FAIL')

if token:
    si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/admin/notice-passkey -H 'Content-Type: application/json' -H 'x-admin-token: " + token + "' -d '{\"action\":\"generate\",\"key\":\"\"}'", timeout=10)
    out = so.read().decode('utf-8', errors='replace')
    print('Generate:', out[:200])
    
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/admin/notice-passkey -H 'x-admin-token: " + token + "'", timeout=10)
    out = so.read().decode('utf-8', errors='replace')
    print('Get passkey:', out[:200])

c.close()
