import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Read current db.js on the server for debugging
stdin, stdout, stderr = c.exec_command('cat /www/wwwroot/campus-wall/db.js')
dbjs = stdout.read().decode('utf-8', errors='replace')
print('Current db.js:', len(dbjs), 'bytes')
print('dropAndInsert function:')
# Find and show the dropAndInsert function
import re
match = re.search(r'function dropAndInsert[^}]+}', dbjs, re.DOTALL)
if match:
    print(match.group()[:1000])

c.close()
