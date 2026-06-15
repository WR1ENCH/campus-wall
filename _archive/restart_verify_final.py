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
    with sftp.open('/tmp/restart.sh', 'w') as f:
        f.write('#!/bin/bash\n')
        f.write('pkill -f "node server.js" 2>/dev/null\n')
        f.write('sleep 1\n')
        f.write('rm -f /www/wwwroot/campus-wall/server.err\n')
        f.write('cd /www/wwwroot/campus-wall\n')
        f.write('nohup /www/server/nodejs/v22.22.3/bin/node server.js </dev/null >server.out 2>&1 &\n')
        f.write('echo "STARTED OK"\n')
    sftp.chmod('/tmp/restart.sh', 0o755)
c.close()

print('=== Restart server ===')
out, err = ssh('bash /tmp/restart.sh', timeout=10)
print(out or '')
time.sleep(2)

print('=== Process ===')
out, err = ssh('ps aux | grep "node server" | grep -v grep', timeout=10)
print(out or 'NOT RUNNING!')

print('=== Server output ===')
out, err = ssh('tail -15 /www/wwwroot/campus-wall/server.out', timeout=10)
print(out)

time.sleep(3)

print('=== Test Admin API (no more hasAdmins error) ===')
out, err = ssh('curl -s http://localhost:3000/api/admin/check-init 2>&1', timeout=10)
print(out[:200])

print()
print('=== Test Captcha API ===')
out, err = ssh('curl -s http://localhost:3000/api/captcha 2>&1 | head -c 100', timeout=10)
print(out)

print()
print('=== Test Notices API ===')
out, err = ssh('curl -s http://localhost:3000/api/notices 2>&1 | head -c 200', timeout=10)
print(out)

print()
print('=== Check for ANY errors ===')
out, err = ssh('grep -i "crash\\|error\\|exception" /www/wwwroot/campus-wall/server.out 2>&1', timeout=10)
print(out or '(none)')
