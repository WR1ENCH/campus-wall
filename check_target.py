import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Check if targetUserId exists in server.js
print('=== Check targetUserId ===')
si, so, se = c.exec_command("grep -c 'targetUserId' /www/wwwroot/campus-wall/server.js", timeout=10)
print('targetUserId count:', so.read().decode('utf-8', errors='replace').strip())

# Check the auto notices
print('\n=== Auto notice titles ===')
si, so, se = c.exec_command("grep 'title:' /www/wwwroot/campus-wall/server.js | grep '已\\|拍卖'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Check GET /api/notices filter
print('\n=== Public notices filter ===')
si, so, se = c.exec_command("grep -A3 'notices.filter' /www/wwwroot/campus-wall/server.js | head -6", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Check GET /api/user/notifications
print('\n=== User notifications endpoint ===')
si, so, se = c.exec_command("grep -A10 'api/user/notifications' /www/wwwroot/campus-wall/server.js | head -12", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Check if auto notices have targetUserId
print('\n=== Sample auto notice with targetUserId ===')
si, so, se = c.exec_command("grep -B1 -A8 'targetUserId:' /www/wwwroot/campus-wall/server.js | head -30", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
