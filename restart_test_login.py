import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('Restarting server...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

si, so, se = c.exec_command('ps aux | grep "node server" | grep -v grep', timeout=10)
print('Server:', '✅' if so.read().decode('utf-8', errors='replace') else '❌')

# Test login
print('\nTest student council login...')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1ench\",\"password\":\"cai091226\"}'", timeout=10)
print('Response:', so.read().decode('utf-8', errors='replace')[:200])

# Also test with admin_std
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"admin_std\",\"password\":\"cai091226\"}'", timeout=10)
print('admin_std:', so.read().decode('utf-8', errors='replace')[:200])

c.close()
