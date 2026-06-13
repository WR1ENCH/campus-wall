import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Fix hasAdmins on remote
fix_code = r'''
const fs = require('fs');
let content = fs.readFileSync('/www/wwwroot/campus-wall/server.js', 'utf8');
const old = 'function hasAdmins() {\n  return fs.existsSync(ADMINS_FILE) && readAdmins().length > 0;\n}';
const new_ = 'function hasAdmins() { return db.readAdmins().length > 0; }';
if (content.includes(old)) {
  content = content.replace(old, new_);
  fs.writeFileSync('/www/wwwroot/campus-wall/server.js', content, 'utf8');
  console.log('Fixed hasAdmins');
} else if (content.includes('function hasAdmins() { return db.readAdmins')) {
  console.log('Already fixed');
} else {
  console.log('Could not find exact match, trying alternative...');
  content = content.replace(/function hasAdmins\(\)\s*\{[^}]+ADMINS_FILE[^}]+\}/, 'function hasAdmins() { return db.readAdmins().length > 0; }');
  fs.writeFileSync('/www/wwwroot/campus-wall/server.js', content, 'utf8');
  console.log('Fixed via regex');
}
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/fix_hasadmins.js', 'w') as f:
        f.write(fix_code)

si, so, se = c.exec_command(NODE + ' /tmp/fix_hasadmins.js 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Syntax check
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1', timeout=10)
print('Syntax:', so.read().decode('utf-8', errors='replace') or 'OK')

# Verify hasAdmins
si, so, se = c.exec_command('grep "hasAdmins" /www/wwwroot/campus-wall/server.js | head -2', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('hasAdmins:', out.strip())

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Final verification
print('\n=== Final verification ===')
si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Admin check:', out[:100])

si, so, se = c.exec_command('curl -s http://localhost:3000/api/posts | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get(\"data\",[])),\'posts\')"', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Posts:', out.strip())

si, so, se = c.exec_command('curl -s http://localhost:3000/api/notices | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get(\"data\",[])),\'notices\')"', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Notices:', out.strip())

si, so, se = c.exec_command('curl -s http://localhost:3000/api/qa/questions | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get(\"data\",[])),\'qa questions\')"', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('QA:', out.strip())

c.close()
