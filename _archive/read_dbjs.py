import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Get the full db.js
stdin, stdout, stderr = c.exec_command('cat /www/wwwroot/campus-wall/db.js')
dbjs = stdout.read().decode('utf-8', errors='replace')
print('=== FULL db.js ===')
print(dbjs)

c.close()
