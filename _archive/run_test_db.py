import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Upload test script
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\test_db_direct.js', '/tmp/test_db_direct.js')

# Run it
stdin, stdout, stderr = c.exec_command(NODE + ' /tmp/test_db_direct.js 2>&1', timeout=15)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print('OUTPUT:')
print(out)
if err:
    print('STDERR:')
    print(err[:500])

c.close()
