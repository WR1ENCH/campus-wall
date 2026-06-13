import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('Pull + restart...')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git fetch origin master && git reset --hard origin/master && bash /tmp/restart2.sh 2>&1', timeout=30)
print(so.read().decode('utf-8', errors='replace')[:300])
time.sleep(2)

print('\n=== Public notices (should NOT show auto) ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/notices 2>&1 | python3 \"-c\" \"import json,sys; d=json.load(sys.stdin); items=d.get('data',[]); print(len(items),'notices'); [print(x['title'][:40]) for x in items]\"", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
