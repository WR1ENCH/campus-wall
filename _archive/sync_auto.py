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

print('=== Discard + Pull ===')
out, err = ssh('cd /www/wwwroot/campus-wall && git checkout -- . && git pull origin master 2>&1', t=30)
print(out[:500])

print('\n=== Status ===')
out, err = ssh('cd /www/wwwroot/campus-wall && git log --oneline -3', t=10)
print(out)

print('\nRestarting...')
out, err = ssh('bash /tmp/restart2.sh 2>&1', t=10)
print(out[:100])
time.sleep(2)

out, err = ssh('ps aux | grep "node server" | grep -v grep', t=10)
print('Server:', '✅' if out else '❌')

out, err = ssh('curl -s http://localhost:3000/api/admin/check-init 2>&1', t=10)
print('Admin:', out[:60])

out, err = ssh('curl -s http://localhost:3000/api/notices 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get(\"data\",[])),\'notices\')"', t=10)
print('Notices:', out.strip())

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=10)
si, so, se = c.exec_command("grep 'auto: true' /www/wwwroot/campus-wall/server.js | wc -l", t=10)
print('auto: true occurrences:', so.read().decode('utf-8', errors='replace').strip())
c.close()
