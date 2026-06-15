import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

si, so, se = c.exec_command('curl -s http://localhost:3000/api/posts 2>&1 | head -c 200', timeout=10)
print('API:', so.read().decode('utf-8', errors='replace')[:150])

si, so, se = c.exec_command("cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -e \"const db=require('./db'); console.log('posts:', db.readPosts().length)\"", timeout=10)
print('DB:', so.read().decode('utf-8', errors='replace'))

si, so, se = c.exec_command('curl -s http://localhost:3000/api/notices 2>&1 | head -c 200', timeout=10)
print('Notices:', so.read().decode('utf-8', errors='replace')[:150])
c.close()
