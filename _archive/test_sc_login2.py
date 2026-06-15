import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Find the login function name in notice.html
print('=== notice.html login function ===')
si, so, se = c.exec_command("grep -n 'function.*login\\|async.*login' /www/wwwroot/campus-wall/notice.html | head -10", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Find the actual login button handler
print('\n=== Login button ===')
si, so, se = c.exec_command("grep -n 'loginBtn\\|doLogin\\|submitLogin' /www/wwwroot/campus-wall/notice.html | head -10", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Check which users have noticePublisher
print('\n=== Users with noticePublisher ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -e \"const db=require('./db'); const users=db.readUsers(); users.filter(u=>u.noticePublisher).forEach(u=>console.log(u.id, u.nickname, u.username))\"", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Also test login with a user that has noticePublisher
print('\n=== Test user login (wr1ench) ===')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1ench\",\"password\":\"cai091226\"}' 2>&1", timeout=10)
print(so.read().decode('utf-8', errors='replace')[:200])

c.close()
