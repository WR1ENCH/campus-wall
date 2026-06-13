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

# Write restart script on server via sftp
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=10)

with c.open_sftp() as sftp:
    with sftp.open('/tmp/restart.sh', 'w') as f:
        f.write('#!/bin/bash\n')
        f.write('pkill -f "node server.js" 2>/dev/null\n')
        f.write('sleep 1\n')
        f.write('cd /www/wwwroot/campus-wall\n')
        f.write('nohup /www/server/nodejs/v22.22.3/bin/node server.js </dev/null >server.out 2>&1 &\n')
        f.write('echo "STARTED OK"\n')
    sftp.chmod('/tmp/restart.sh', 0o755)
c.close()

print('=== Step 1: Run restart script ===')
out, err = ssh('bash /tmp/restart.sh', timeout=10)
print(out or '(no stdout)')
if err: print('ERR:', err[:300])

time.sleep(2)

print('=== Step 2: Verify process ===')
out, err = ssh('ps aux | grep "node server" | grep -v grep', timeout=10)
print(out or 'NOT RUNNING!')

print('=== Step 3: Server output ===')
out, err = ssh('tail -20 /www/wwwroot/campus-wall/server.out', timeout=10)
print(out or '(empty)')

print('=== Step 4: Test API ===')
out, err = ssh('curl -s http://localhost:3000/api/captcha 2>&1 | head -c 200', timeout=10)
print('API: ' + (out[:150] if out else 'FAIL'))

time.sleep(5)

print('=== Step 5: Check errors ===')
out, err = ssh('tail -20 /www/wwwroot/campus-wall/server.err', timeout=10)
print(out or '(empty - no new errors)')
