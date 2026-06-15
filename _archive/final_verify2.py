import paramiko, io, time, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== Restart server ===')
stdin, stdout, stderr = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(stdout.read().decode('utf-8', errors='replace')[:200])
time.sleep(2)

print('=== Process ===')
stdin, stdout, stderr = c.exec_command('ps aux | grep "node server" | grep -v grep')
print(stdout.read().decode('utf-8', errors='replace'))

print('=== Create test post ===')
stdin, stdout, stderr = c.exec_command("curl -s -X POST http://localhost:3000/api/posts -H 'Content-Type: application/json' -d '{\"type\":\"text\",\"content\":\"FINAL_VERIFY_123\",\"avatar\":\"F\",\"author\":\"Final\"}'")
print(stdout.read().decode('utf-8', errors='replace')[:150])

time.sleep(1)

print('=== Verify persistence ===')
stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3000/api/posts | python3 -c 'import json,sys; d=json.load(sys.stdin); p=d.get(\"data\",[]); found=[x for x in p if \"FINAL_VERIFY_123\" in str(x)]; print(\"Total:\",len(p),\"Found:\",len(found))'")
print(stdout.read().decode('utf-8', errors='replace'))

print('=== Git log ===')
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -4')
print(stdout.read().decode('utf-8', errors='replace'))

print('=== Errors ===')
stdin, stdout, stderr = c.exec_command('grep -c "INSERT failed\|SQLite3 can only bind" /www/wwwroot/campus-wall/server.out 2>/dev/null; echo "OK"')
print('Errors:', stdout.read().decode('utf-8', errors='replace').strip())

c.close()
