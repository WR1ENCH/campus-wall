import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== Git pull + restart ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git checkout -- . && git pull origin master 2>&1', timeout=30)
out = so.read().decode('utf-8', errors='replace')
print(out[:500])

print('\n=== db.js readSC ===')
si, so, se = c.exec_command("grep -A8 'function readSC' /www/wwwroot/campus-wall/db.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== db.js writeSC ===')
si, so, se = c.exec_command("grep -A10 'function writeSC' /www/wwwroot/campus-wall/db.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Test readSC ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -e "const db=require(\'./db\'); console.log(JSON.stringify(db.readSC()));"', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('readSC:', out[:300])

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])

import time
time.sleep(2)

# Test login API
print('\n=== Test student-council login ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/captcha | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[\"data\"][\"id\"][:10],d[\"data\"][\"text\"])'", timeout=10)
print('Captcha:', so.read().decode('utf-8', errors='replace'))

# Actually the captcha text isn't returned... let me test differently
# Just check if the API is working at all
si, so, se = c.exec_command('curl -s http://localhost:3000/api/student-council/check-init 2>&1', timeout=10)
print('check-init:', so.read().decode('utf-8', errors='replace')[:100])

c.close()
