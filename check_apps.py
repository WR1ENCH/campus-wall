import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Check notice_applications table
print('=== notice_applications schema ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '.schema notice_applications'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== App JSON file exists? ===')
si, so, se = c.exec_command('ls -la /www/wwwroot/campus-wall/data/notice_applications.json 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Test wrong passkey ===')
# First login to get token
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/admin/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1Ench\",\"password\":\"cai091226\"}'", timeout=10)
login = so.read().decode('utf-8', errors='replace')
import json as j
token = j.loads(login).get('data', {}).get('token', '')

if token:
    # Get current passkey
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/admin/notice-passkey -H 'x-admin-token: " + token + "'", timeout=10)
    pk = so.read().decode('utf-8', errors='replace')
    print('Current passkey:', pk[:100])
    
    # Try to submit application with WRONG passkey (without login - just test the endpoint)
    # Need a user token first - create a simple one
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/captcha | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"data\"][\"id\"], d[\"data\"][\"svg\"][:20])'", timeout=10)
    print('Captcha:', so.read().decode('utf-8', errors='replace')[:80])

c.close()
