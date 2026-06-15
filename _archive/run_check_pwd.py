import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Upload test script
with c.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\check_pwd.js', '/tmp/check_pwd.js')

NODE = '/www/server/nodejs/v22.22.3/bin/node'
si, so, se = c.exec_command(NODE + ' /tmp/check_pwd.js 2>&1', timeout=15)
print(so.read().decode('utf-8', errors='replace'))

c.close()
