import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== student_council schema ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '.schema student_council'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== student_council data ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -json campus.db 'SELECT * FROM student_council;'", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== DB readSC test ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -e \"const db=require('./db'); console.log(JSON.stringify(db.readSC()));\"", timeout=10)
print(so.read().decode('utf-8', errors='replace')[:300])

c.close()
