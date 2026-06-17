import paramiko, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# 1. 上传修复脚本
print('Uploading fix_qa.js...')
with client.open_sftp() as sftp:
    sftp.put(r'C:\Users\wyxgg\Desktop\test\fix_qa.js', '/tmp/fix_qa.js')
print('OK')

# 2. 运行修复
print('Running fix...')
stdin, stdout, stderr = client.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' /tmp/fix_qa.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR: ' + err[:500])

# 3. 语法检查
print('Syntax check...')
stdin, stdout, stderr = client.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR: ' + err[:500])

# 4. 验证函数定义
print('QA function definitions:')
stdin, stdout, stderr = client.exec_command("grep -n 'function readQA\\|function writeQA' /www/wwwroot/campus-wall/server.js")
out = stdout.read().decode('utf-8', errors='replace')
print(out)

client.close()
