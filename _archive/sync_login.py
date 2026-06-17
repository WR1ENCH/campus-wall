import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('Force pull...')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git fetch origin master && git reset --hard origin/master 2>&1', timeout=30)
print(so.read().decode('utf-8', errors='replace')[:200])

print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

print('\nTest login...')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1ench\",\"password\":\"cai091226\"}'", timeout=10)
print('Login:', so.read().decode('utf-8', errors='replace')[:200])

si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"admin_std\",\"password\":\"cai091226\"}'", timeout=10)
print('SC login:', so.read().decode('utf-8', errors='replace')[:200])

c.close()
