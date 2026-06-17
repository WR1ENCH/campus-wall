import paramiko, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Write resolve script
resolve_code = r'''
const fs = require('fs');

function resolveFile(p) {
  let content = fs.readFileSync(p, 'utf8');
  if (!content.includes('<<<<<<<')) { console.log(p + ': no conflicts'); return; }
  content = content.replace(/<<<<<<< HEAD\n?/g, '');
  content = content.replace(/=======\n?[\s\S]*?>>>>>>> [^\n]+\n?/g, '');
  // Second pass: remove any remaining conflict markers
  content = content.replace(/<<<<<<< /g, '');
  content = content.replace(/=======/g, '');
  content = content.replace(/>>>>>>> /g, '');
  fs.writeFileSync(p, content, 'utf8');
  console.log('Resolved: ' + p);
}

resolveFile('/www/wwwroot/campus-wall/db.js');
resolveFile('/www/wwwroot/campus-wall/package.json');
console.log('Done');
'''

# This is complex to escape for shell. Let me write the script to a temp file via sftp
with c.open_sftp() as sftp:
    with sftp.open('/tmp/resolve.js', 'w') as f:
        f.write(resolve_code)

stdin, stdout, stderr = c.exec_command(NODE + ' /tmp/resolve.js 2>&1', timeout=15)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:500])

# Git add + commit merge
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && git add db.js package.json && git commit -m "merge: 合并 db.js 修复版本 (toSqlValue + transaction safety)" 2>&1', timeout=15)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print('Git commit:')
print(out)
if err: print('ERR:', err[:500])

# Syntax check
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c db.js 2>&1', timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print('Syntax:', out or 'OK')

# Verify functions
stdin, stdout, stderr = c.exec_command("grep -c 'function toSqlValue' /www/wwwroot/campus-wall/db.js", timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print('toSqlValue exists:', out.strip())

# Git log
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -3', timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print('Recent commits:')
print(out)

c.close()
