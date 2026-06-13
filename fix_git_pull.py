import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

def ssh(cmd, t=15):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username=user, password=passwd, timeout=10)
    si, so, se = c.exec_command(cmd, timeout=t)
    out = so.read().decode('utf-8', errors='replace')
    err = se.read().decode('utf-8', errors='replace')
    c.close()
    return out, err

print('=== Discard local changes ===')
out, err = ssh('cd /www/wwwroot/campus-wall && git checkout -- . 2>&1', t=10)
print(out[:200])

print('=== Pull ===')
out, err = ssh('cd /www/wwwroot/campus-wall && git pull origin master 2>&1', t=30)
print(out[:500])

print('\n=== Git status ===')
out, err = ssh('cd /www/wwwroot/campus-wall && git status --short 2>&1', t=10)
print(out or '(clean)')

print('\n=== Restart ===')
out, err = ssh('bash /tmp/restart2.sh 2>&1', t=10)
print(out[:100])
time.sleep(2)

out, err = ssh('ps aux | grep "node server" | grep -v grep', t=10)
print('Server:', '✅' if out else '❌')

out, err = ssh('curl -s http://localhost:3000/api/admin/check-init 2>&1', t=10)
print('Admin:', out[:60])
