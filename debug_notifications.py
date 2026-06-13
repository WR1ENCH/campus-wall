import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== writePosts definition on server ===')
si, so, se = c.exec_command("grep -A3 'function writePosts' /www/wwwroot/campus-wall/server.js | head -5", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== readPosts definition ===')
si, so, se = c.exec_command("grep -A3 'function readPosts' /www/wwwroot/campus-wall/server.js | head -5", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Lines around T1 report notification ===')
si, so, se = c.exec_command("grep -n '举报已收到\\|writePosts\\|readNotices\\|writeNotices' /www/wwwroot/campus-wall/server.js | head -20", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Also check if db.js readNotices/writeNotices are correct
print('\n=== db.js notice functions ===')
si, so, se = c.exec_command("grep -A2 'function readNotices\\|function writeNotices' /www/wwwroot/campus-wall/db.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
