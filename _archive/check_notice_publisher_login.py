import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Check users table schema for noticePublisher
print('=== users table noticePublisher column ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA table_info(users);' | grep -i notice", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Count users with noticePublisher = 1
print('\n=== Users with noticePublisher set ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM users WHERE noticePublisher = 1;'", timeout=10)
print('With noticePublisher=1:', so.read().decode('utf-8', errors='replace').strip())

si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM users;'", timeout=10)
print('Total users:', so.read().decode('utf-8', errors='replace').strip())

# Try logging in as a user WITHOUT noticePublisher
print('\n=== Try login as user without noticePublisher ===')
# Find a user without noticePublisher
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"SELECT id, username, nickname FROM users WHERE noticePublisher IS NULL OR noticePublisher = 0 LIMIT 3;\"", timeout=10)
print('Users without noticePublisher:', so.read().decode('utf-8', errors='replace')[:200])

# Try a login with a user that should NOT have noticePublisher
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"test\",\"password\":\"test123456\"}'", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Login test user:', out[:100])

# Check what the find function actually gets
print('\n=== Debug: users with noticePublisher from db ===')
si, so, se = c.exec_command(NODE + " -e \"const db=require('./db'); const users=db.readUsers(); const pubs=users.filter(u=>u.noticePublisher); console.log('pub count:', pubs.length); pubs.forEach(u=>console.log(u.nickname, u.noticePublisher, typeof u.noticePublisher));\"", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
