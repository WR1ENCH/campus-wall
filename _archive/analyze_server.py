import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 读取完整 server.js
stdin, stdout, stderr = client.exec_command('wc -l /www/wwwroot/campus-wall/server.js')
print('Total lines:', stdout.read().decode('utf-8', errors='replace'))

# 读取 read/write 函数定义
stdin, stdout, stderr = client.exec_command('grep -n "function read\|function write\|function save\|function load\|const DATA_DIR\|const POSTS_FILE\|const USERS_FILE\|const ADMINS" /www/wwwroot/campus-wall/server.js')
print('\n=== Data functions ===')
print(stdout.read().decode('utf-8', errors='replace'))

# 读取所有路由
stdin, stdout, stderr = client.exec_command('grep -n "app\.\(get\|post\|put\|delete\)" /www/wwwroot/campus-wall/server.js')
print('\n=== Routes ===')
print(stdout.read().decode('utf-8', errors='replace'))

# 读取最后一部分
stdin, stdout, stderr = client.exec_command('tail -50 /www/wwwroot/campus-wall/server.js')
print('\n=== Tail ===')
print(stdout.read().decode('utf-8', errors='replace'))

client.close()
