import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Direct DB test
print('=== Direct db module test ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall && " + NODE + " -e \"const db=require('./db'); console.log('users:',db.readUsers().length,'posts:',db.readPosts().length,'notices:',db.readNotices().length)\"", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# readPosts definition
print('\n=== readPosts definition ===')
si, so, se = c.exec_command("grep -A2 'function readPosts' /www/wwwroot/campus-wall/server.js | head -4", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# HTTP test
print('\n=== HTTP status ===')
si, so, se = c.exec_command("curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ 2>&1", timeout=10)
print('HTTP:', so.read().decode('utf-8', errors='replace'))

# Posts API
print('\n=== Posts API ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/posts 2>&1 | head -c 300", timeout=10)
print(so.read().decode('utf-8', errors='replace')[:300])

# Server errors
print('\n=== Server errors ===')
si, so, se = c.exec_command("grep -i 'error\\|crash\\|exception' /www/wwwroot/campus-wall/server.out 2>&1 | tail -10", timeout=10)
print(so.read().decode('utf-8', errors='replace')[:500])

c.close()
