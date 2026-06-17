import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

print('Uploading server.js...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\server.js', '/www/wwwroot/campus-wall/server.js')

print('Uploading apply-notice.html...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\apply-notice.html', '/www/wwwroot/campus-wall/apply-notice.html')

# Syntax
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1')
print('Syntax:', so.read().decode('utf-8', errors='replace') or 'OK')

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Quick verify
si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1')
print('Admin check:', so.read().decode('utf-8', errors='replace')[:60])

c.close()
