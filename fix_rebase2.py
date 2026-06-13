import paramiko, io, sys, time
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

# Upload fixed package.json
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\package.json', '/www/wwwroot/campus-wall/package.json')
print('OK')

# Add and continue rebase
print('\nContinue rebase...')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git add db.js package.json && GIT_EDITOR=true git rebase --continue 2>&1', timeout=15)
out = so.read().decode('utf-8', errors='replace')
print(out[:500])

# Git status
print('\n=== Git status ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git status --short', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out or '(clean)')

# Git log
print('\n=== Git log ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -5', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out)

# Restart server
print('\n=== Restart server ===')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:100])
time.sleep(2)

si, so, se = c.exec_command('ps aux | grep "node server" | grep -v grep', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Server:', out or 'NOT RUNNING')

# Verify footer
print('\n=== Verify footer link ===')
si, so, se = c.exec_command('grep "接入校园墙生态" /www/wwwroot/campus-wall/index.html', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Footer link:', '✅' if out else '❌')

c.close()
