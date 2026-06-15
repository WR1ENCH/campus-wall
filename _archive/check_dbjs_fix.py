import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Check what's in db.js
stdin, stdout, stderr = c.exec_command('cat /www/wwwroot/campus-wall/db.js', timeout=10)
dbjs = stdout.read().decode('utf-8', errors='replace')
print('=== Server db.js content ===')
print(dbjs)
print('=== END ===')
print('Contains toSqlValue:', 'toSqlValue' in dbjs)
print('Contains dropAndInsert:', 'deleteRange' in dbjs or 'dropAndInsert' in dbjs)
print('Conflict markers:', dbjs.count('<<<') > 0, dbjs.count('>>>') > 0)

c.close()
