import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\test_db_cause.js', '/www/wwwroot/campus-wall/test_db_cause.js')

stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' test_db_cause.js 2>&1', timeout=30)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print('OUTPUT:')
print(out)
if err:
    print('STDERR:')
    print(err[:500])

c.exec_command('rm /www/wwwroot/campus-wall/test_db_cause.js')
c.close()
