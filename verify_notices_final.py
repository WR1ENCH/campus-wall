import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('Restarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Test public notices - should NOT include auto notices
print('\n=== Public notices API ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/notices 2>&1 | python3 \"-c\" \"import json,sys; d=json.load(sys.stdin); items=d.get('data',[]); [print(x['title'][:30]) for x in items]\"", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out if out else '(empty)')

# Test create a notice (simulate a manual publish)
print('\n=== Create a test notice ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/captcha 2>&1", timeout=10)
import json as j
cap = j.loads(so.read().decode('utf-8', errors='replace'))
cid = cap.get('data', {}).get('id', '')

# Use student council to publish
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1ench\",\"password\":\"cai091226\"}'", timeout=10)
login = j.loads(so.read().decode('utf-8', errors='replace'))
sctoken = login.get('data', {}).get('token', '')
if sctoken:
    si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/notices -H 'Content-Type: application/json' -H 'x-sc-token: " + sctoken + "' -d '{\"title\":\"测试公开通知\",\"content\":\"这是公开通知\"}' 2>&1", timeout=10)
    print('Publish:', so.read().decode('utf-8', errors='replace')[:100])

# Check public notices again
print('\n=== Public notices after publish ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/notices 2>&1 | python3 \"-c\" \"import json,sys; d=json.load(sys.stdin); items=d.get('data',[]); print(len(items),'public notices'); [print(x['title'][:30]) for x in items[:5]]\"", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
