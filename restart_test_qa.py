import paramiko, io, time, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Restart
print('=== Restart server ===')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Verify process
print('=== Process ===')
si, so, se = c.exec_command('ps aux | grep "node server" | grep -v grep')
print(so.read().decode('utf-8', errors='replace'))

# Test QA API now
print('=== Test GET /api/qa/questions ===')
si, so, se = c.exec_command('curl -s http://localhost:3000/api/qa/questions 2>&1 | head -c 300', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:300])

print()
print('=== Test QA detail ===')
si, so, se = c.exec_command('curl -s http://localhost:3000/api/qa/questions/nonexistent 2>&1 | head -c 200', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:200])

# Check for errors
print()
print('=== Error check ===')
si, so, se = c.exec_command('grep -c "readQAAnswers" /www/wwwroot/campus-wall/server.out 2>/dev/null; echo "---"; grep -c "CRASH" /www/wwwroot/campus-wall/server.out 2>/dev/null', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('readQAAnswers errors:', out.split('---')[0].strip() if '---' in out else '?')
print('CRASH count:', out.split('---')[1].strip() if '---' in out else '?')

c.close()
