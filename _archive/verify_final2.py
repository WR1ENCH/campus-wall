import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Check all notices with targetUserId
print('=== Notices with targetUserId ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -json campus.db \"SELECT id, title, targetUserId, auto FROM notices WHERE targetUserId IS NOT NULL ORDER BY createdAt DESC LIMIT 5;\"", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:500])

# Check notices without targetUserId (should only be public ones)
print('\n=== Notices without targetUserId ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -json campus.db \"SELECT id, title, auto FROM notices WHERE targetUserId IS NULL ORDER BY createdAt DESC LIMIT 5;\"", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:500])

# Check public API
print('\n=== Public notices API ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/notices 2>&1 | python3 -c \"import json,sys; d=json.load(sys.stdin); items=d.get('data',[]); print(len(items),'notices'); [print(x['title'][:30]) for x in items[:5]]\"", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:500])

# Login as wr1ench and check user notifications
print('\n=== User notifications for wr1ench ===')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/user/login -H 'Content-Type: application/json' -d '{\"username\":\"wr1ench\",\"password\":\"cai091226\"}'", timeout=10)
import json as j
login = j.loads(so.read().decode('utf-8', errors='replace'))
utoken = login.get('data', {}).get('token', '')
print('Token:', utoken[:20] + '...' if utoken else 'FAIL')

if utoken:
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/user/notifications -H 'x-user-token: " + utoken + "' 2>&1 | python3 -c \"import json,sys; d=json.load(sys.stdin); items=d.get('data',[]); print(len(items),'user notifications'); [print(x['title'][:30],'->',x.get('targetUserId','N/A')[:20]) for x in items[:5]]\"", timeout=10)
    out = so.read().decode('utf-8', errors='replace')
    print(out[:500])

c.close()
