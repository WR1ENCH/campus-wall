import paramiko, io, time, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

def ssh(cmd, timeout=10):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username=user, password=passwd, timeout=10)
    si, so, se = c.exec_command(cmd, timeout=timeout)
    out = so.read().decode('utf-8', errors='replace')
    err = se.read().decode('utf-8', errors='replace')
    c.close()
    return out, err

# Write restart.sh on server
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=10)
with c.open_sftp() as sftp:
    with sftp.open('/tmp/restart2.sh', 'w') as f:
        f.write('#!/bin/bash\n')
        f.write('pkill -f "node server.js" 2>/dev/null\n')
        f.write('sleep 1\n')
        f.write('rm -f /www/wwwroot/campus-wall/server.err\n')
        f.write('cd /www/wwwroot/campus-wall\n')
        f.write('nohup /www/server/nodejs/v22.22.3/bin/node server.js </dev/null >server.out 2>&1 &\n')
        f.write('echo "STARTED"\n')
    sftp.chmod('/tmp/restart2.sh', 0o755)
c.close()

print('=== Restart server ===')
out, err = ssh('bash /tmp/restart2.sh', timeout=10)
print(out or '')
time.sleep(2)

print('=== Process ===')
out, err = ssh('ps aux | grep "node server" | grep -v grep', timeout=10)
print(out or 'NOT RUNNING!')

print('=== Get initial post count ===')
out, err = ssh("curl -s http://localhost:3000/api/posts | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d.get(\"data\",[])))'", timeout=15)
print('Count:', out.strip())

print()
print('=== Create test post via API ===')
out, err = ssh("curl -s -X POST http://localhost:3000/api/posts -H 'Content-Type: application/json' -d '{\"type\":\"text\",\"content\":\"VERIFY_FIX_12345\",\"avatar\":\"V\",\"author\":\"Verify\"}'", timeout=15)
print('Response:', out[:200])

print()
print('=== Read posts after write ===')
out, err = ssh("curl -s http://localhost:3000/api/posts | python3 -c 'import json,sys; d=json.load(sys.stdin); posts=d.get(\"data\",[]); print(\"Total:\",len(posts)); found=[p for p in posts if \"VERIFY_FIX_12345\" in str(p)]; print(\"Found:\",len(found))'", timeout=15)
print(out.strip())

time.sleep(2)

print()
print('=== Read again after 2s (simulating refresh) ===')
out, err = ssh("curl -s http://localhost:3000/api/posts | python3 -c 'import json,sys; d=json.load(sys.stdin); posts=d.get(\"data\",[]); print(\"Total:\",len(posts)); found=[p for p in posts if \"VERIFY_FIX_12345\" in str(p)]; print(\"Still found:\",len(found))'", timeout=15)
print(out.strip())

print()
print('=== Direct SQLite check ===')
out, err = ssh("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"SELECT COUNT(*) FROM posts WHERE content LIKE '%VERIFY_FIX_12345%';\"", timeout=10)
print('In DB:', out.strip())

print()
print('=== Check for errors ===')
out, err = ssh('grep -c "SQLite3 can only bind" /www/wwwroot/campus-wall/server.out 2>/dev/null; echo "---"; grep -c "INSERT failed" /www/wwwroot/campus-wall/server.out 2>/dev/null', timeout=10)
print('Bind errors:', out.split('---')[0].strip() if '---' in out else '?')
print('INSERT errors:', out.split('---')[1].strip() if '---' in out else '?')
