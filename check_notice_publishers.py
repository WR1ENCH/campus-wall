import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# List users with noticePublisher
print('=== Users with noticePublisher ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -header -column campus.db \"SELECT id, username, nickname FROM users WHERE noticePublisher = 1;\"", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
