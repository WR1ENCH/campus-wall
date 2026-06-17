import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Check server output for the recent request
print('=== server.out tail ===')
si, so, se = c.exec_command('tail -30 /www/wwwroot/campus-wall/server.out 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:500])

# Check if there's an error in the request
print('\n=== Test login with full verbose ===')
si, so, se = c.exec_command("curl -v -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1ench\",\"password\":\"cai091226\"}' 2>&1", timeout=10)
out = so.read().decode('utf-8', errors='replace')
# Show last 500 chars
print(out[-500:])

c.close()
