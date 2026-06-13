import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Upload changed files
print('Uploading server.js...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\server.js', '/www/wwwroot/campus-wall/server.js')
print('Uploading apply-notice.html...')
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\apply-notice.html', '/www/wwwroot/campus-wall/apply-notice.html')
print('OK')

# NODE syntax check
NODE = '/www/server/nodejs/v22.22.3/bin/node'
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1')
out = so.read().decode('utf-8', errors='replace')
print('Syntax:', out or 'OK')

# Restart server
print('\nRestarting server...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1; sleep 2; ps aux | grep "node server" | grep -v grep')
print(so.read().decode('utf-8', errors='replace')[:200])

# Test apply-notice page loads
print('\nVerify apply-notice.html...')
si, so, se = c.exec_command('grep "通行码（选填）" /www/wwwroot/campus-wall/apply-notice.html', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('passkey optional:', '✅' if out else '❌')

# Test server endpoint
print('\nTest API endpoint...')
si, so, se = c.exec_command('curl -s http://localhost:3000/api/notices | head -c 100', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Notices:', out[:80] if out else '❌')

c.close()
