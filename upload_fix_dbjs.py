import paramiko, io, time, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Upload fixed db.js
print('Uploading fixed db.js...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\db.js', '/www/wwwroot/campus-wall/db.js')
print('OK')

# Syntax check
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c db.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print('Syntax:', out or 'OK')

# Restart
print('\nRestarting server...')
stdin, stdout, stderr = c.exec_command('bash /tmp/restart2.sh 2>&1')
print(stdout.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Test QA list
print('\n=== Test QA list ===')
stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3000/api/qa/questions 2>&1 | head -c 200", timeout=10)
print(stdout.read().decode('utf-8', errors='replace')[:200])

# Test QA detail - check images type
print('\n=== Test QA detail - images type ===')
stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3000/api/qa/questions/qa_mq61msuahz32 2>&1 | python3 -c 'import json,sys; d=json.load(sys.stdin); img=d.get(\"data\",{}).get(\"images\"); print(\"type:\", type(img).__name__, \"value:\", str(img)[:50])'", timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print(out)

# Test with question that has answers (qa_mq2bng1gk5gv)
print('\n=== Test QA detail with answers ===')
stdin, stdout, stderr = c.exec_command("curl -s http://localhost:3000/api/qa/questions/qa_mq2bng1gk5gv 2>&1 | python3 -c 'import json,sys; d=json.load(sys.stdin); q=d.get(\"data\",{}); print(\"ok:\", d.get(\"ok\")); print(\"images type:\", type(q.get(\"images\")).__name__); ans=q.get(\"answers\",[]); print(\"answers:\", len(ans)); [print(\"  ans\",i,\"images type:\", type(a.get(\"images\")).__name__) for i,a in enumerate(ans[:2])]'", timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print(out)

print('\n=== Error check ===')
stdin, stdout, stderr = c.exec_command('grep -c "CRASH" /www/wwwroot/campus-wall/server.out 2>/dev/null; echo "---"; grep -c "Error" /www/wwwroot/campus-wall/server.out 2>/dev/null', timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
if '---' in out:
    parts = out.split('---')
    print('CRASH:', parts[0].strip(), '| Error:', parts[1].strip())

c.close()
