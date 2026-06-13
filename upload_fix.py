import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Upload fixed db.js from local
print('Uploading fixed db.js...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\db.js', '/www/wwwroot/campus-wall/db.js')
print('OK')

# Upload package.json from local
print('Uploading package.json...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\package.json', '/www/wwwroot/campus-wall/package.json')
print('OK')

# Syntax check
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c db.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
print('Syntax:', out or 'OK')

# Verify toSqlValue exists
stdin, stdout, stderr = c.exec_command("grep -c 'function toSqlValue' /www/wwwroot/campus-wall/db.js")
out = stdout.read().decode('utf-8', errors='replace')
print('toSqlValue:', out.strip())

# Git commit resolved version
print('\nCommitting...')
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && git add db.js package.json && git commit -m "fix: db.js - toSqlValue + transaction-safe dropAndInsert" 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out[:500])
if err: print('ERR:', err[:300])

# Git log
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -3')
out = stdout.read().decode('utf-8', errors='replace')
print('\nRecent commits:')
print(out)

c.close()
