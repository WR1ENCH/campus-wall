import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== check-init response ===')
si, so, se = c.exec_command('curl -s http://localhost:3000/api/student-council/check-init 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== readSC direct test ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -e "const db=require(\'./db\'); const sc=db.readSC(); console.log(\'exists:\', !!sc, \'data:\', JSON.stringify(sc).slice(0,100))"', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== server.js readSC ===')
si, so, se = c.exec_command("grep -A2 'function readSC' /www/wwwroot/campus-wall/server.js | head -5", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
