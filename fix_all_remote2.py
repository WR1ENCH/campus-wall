import paramiko, io, time, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Upload fix script
print('Uploading fix_all_remote.js...')
with client.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\fix_all_remote.js', '/tmp/fix_all_remote.js')
print('OK')

# Run fix
print('Running fix...')
stdin, stdout, stderr = client.exec_command(NODE + ' /tmp/fix_all_remote.js 2>&1', timeout=15)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR: ' + err[:500])

# Syntax check
print('Syntax check...')
stdin, stdout, stderr = client.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1', timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print(out or 'Syntax OK')

# Verify functions
print('All functions:')
stdin, stdout, stderr = client.exec_command("grep -n 'function read\\|function write\\|function has' /www/wwwroot/campus-wall/server.js | grep 'db\\.'", timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print(out or 'NONE FOUND')

client.close()
