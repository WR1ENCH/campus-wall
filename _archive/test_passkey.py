import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Direct test: generate passkey via API
print('=== Test generate passkey ===')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/admin/notice-passkey -H 'Content-Type: application/json' -H 'x-admin-token: ' -d '{\"action\":\"generate\",\"key\":\"\"}' 2>&1", timeout=10)
out = so.read().decode('utf-8', errors='replace')
err = se.read().decode('utf-8', errors='replace')
print('Response:', out[:300])
if err: print('ERR:', err[:300])

# Test with admin token
print('\n=== Get admin token first ===')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/admin/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1Ench\",\"password\":\"cai091226\"}' 2>&1", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Login:', out[:200])

# Extract token
import json as j
try:
    login_data = j.loads(out)
    token = login_data.get('data', {}).get('token', '')
except:
    token = ''

print('Token:', token[:30] + '...' if token else 'NOT FOUND')

if token:
    print('\n=== Generate passkey with token ===')
    si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/admin/notice-passkey -H 'Content-Type: application/json' -H 'x-admin-token: " + token + "' -d '{\"action\":\"generate\",\"key\":\"\"}' 2>&1", timeout=10)
    out = so.read().decode('utf-8', errors='replace')
    print('Response:', out[:300])
    
    print('\n=== Check passkey in DB ===')
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT * FROM notice_passkey;'", timeout=10)
    print(so.read().decode('utf-8', errors='replace') or '(empty)')

c.close()
