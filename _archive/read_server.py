import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 读取 server.js 前 200 行了解结构
stdin, stdout, stderr = client.exec_command('head -200 /www/wwwroot/campus-wall/server.js')
print(stdout.read().decode('utf-8', errors='replace'))

client.close()
