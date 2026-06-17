import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

with client.open_sftp() as sftp:
    # 上传 patch 脚本
    sftp.put(r'C:\Users\wyxgg\Desktop\test\patch_server.py', '/tmp/patch_server.py')
    print('✅ patch_server.py uploaded')

# 运行 patch
print('\n🔄 Running patch...')
stdin, stdout, stderr = client.exec_command('python3 /tmp/patch_server.py 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:500])

# 语法检查
print('\n🔍 Syntax check...')
stdin, stdout, stderr = client.exec_command(f'cd /www/wwwroot/campus-wall && {NODE} -c server.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:500])

# 检查 db.js 语法
print('\n🔍 db.js syntax check...')
stdin, stdout, stderr = client.exec_command(f'cd /www/wwwroot/campus-wall && {NODE} -c db.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:500])

client.close()
