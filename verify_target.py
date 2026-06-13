import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

print('=== 1. Force pull latest ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git fetch origin master && git reset --hard origin/master 2>&1', timeout=30)
print(so.read().decode('utf-8', errors='replace')[:200])

print('\n=== 2. Check git version ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -1', timeout=10)
print(so.read().decode('utf-8', errors='replace').strip())

print('\n=== 3. Check index.html has user notifications ===')
si, so, se = c.exec_command("grep -c 'api/user/notifications' /www/wwwroot/campus-wall/index.html", timeout=10)
print('user/notifications in index.html:', so.read().decode('utf-8', errors='replace').strip())

print('\n=== 4. Check targetUserId in server.js ===')
si, so, se = c.exec_command("grep -c 'targetUserId' /www/wwwroot/campus-wall/server.js", timeout=10)
print('targetUserId count:', so.read().decode('utf-8', errors='replace').strip())

print('\n=== 5. Restart server ===')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

print('\n=== 6. Test API ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/admin/check-init 2>&1", timeout=10)
print('Admin:', so.read().decode('utf-8', errors='replace')[:60])

# Create a test report to see if targetUserId works
si, so, se = c.exec_command("curl -s http://localhost:3000/api/captcha 2>&1", timeout=10)
import json as j
cap = j.loads(so.read().decode('utf-8', errors='replace'))
cid = cap.get('data', {}).get('id','')
ctxt = cap.get('data', {}).get('text','')

si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/user/register -H 'Content-Type: application/json' -d '{\"username\":\"test_target\",\"password\":\"test123456\",\"nickname\":\"目标测试\",\"captchaId\":\"" + cid + "\",\"captchaText\":\"" + ctxt + "\"}'", timeout=10)
reg = j.loads(so.read().decode('utf-8', errors='replace'))
utoken = reg.get('data', {}).get('token','')
uid = reg.get('data', {}).get('id','')
print(f'Registered: {uid}')

if utoken:
    # Submit report
    si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/posts -H 'Content-Type: application/json' -d '{\"type\":\"text\",\"content\":\"测试帖_用于验证targetUserId\"}'", timeout=10)
    post = j.loads(so.read().decode('utf-8', errors='replace'))
    pid = post.get('data', {}).get('id','')

    si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/posts/" + pid + "/report -H 'Content-Type: application/json' -H 'x-user-token: " + utoken + "' -d '{\"reason\":\"测试\"}'", timeout=10)
    print('Report result:', so.read().decode('utf-8', errors='replace')[:100])

    # Check if the auto notice has targetUserId
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -json campus.db \"SELECT id, title, targetUserId, createdAt FROM notices WHERE targetUserId IS NOT NULL ORDER BY createdAt DESC LIMIT 3;\"", timeout=10)
    print('\nNotices with targetUserId:')
    print(so.read().decode('utf-8', errors='replace')[:500])

    # Test user notifications endpoint
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/user/notifications -H 'x-user-token: " + utoken + "' 2>&1 | head -c 300", timeout=10)
    print('\nUser notifications:', so.read().decode('utf-8', errors='replace')[:200])

    # Test public notices (should NOT include the targeted one)
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/notices 2>&1 | python3 -c \"import json,sys; d=json.load(sys.stdin); print(len(d.get('data',[])),'public notices')\"", timeout=10)
    print('Public notices:', so.read().decode('utf-8', errors='replace').strip())

c.close()
