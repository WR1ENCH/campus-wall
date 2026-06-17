import paramiko, sys, io, os, tarfile, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 1. 停掉 Node 服务（防止备份过程中数据被写）
print('⏸️ 暂停 Node 服务...')
client.exec_command('kill -SIGSTOP 1245501 2>/dev/null')  # 暂停进程，不杀死
time.sleep(1)

# 2. 创建备份
timestamp = time.strftime('%Y%m%d_%H%M%S')
backup_name = f'campus_wall_backup_{timestamp}'
print(f'📦 创建备份: {backup_name}')

commands = [
    f'mkdir -p /root/{backup_name}',
    f'cp -a /www/wwwroot/campus-wall/data /root/{backup_name}/data',
    f'cp -a /www/wwwroot/campus-wall/server.js /root/{backup_name}/server.js',
    f'cp -a /www/wwwroot/campus-wall/package.json /root/{backup_name}/',
    # 检查并复制 .env 或其他配置文件
    'cp -a /www/wwwroot/campus-wall/.env /root/' + backup_name + '/ 2>/dev/null; echo done',
    # 打包
    f'cd /root && tar -czf {backup_name}.tar.gz {backup_name}',
]

for cmd in commands:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out: print(f'  {out[:200]}')
    if err: print(f'  ⚠️ {err[:200]}')

# 3. 恢复 Node 服务
print('▶️ 恢复 Node 服务...')
client.exec_command('kill -SIGCONT 1245501 2>/dev/null')

# 4. 检查备份文件
stdin, stdout, stderr = client.exec_command(f'ls -lh /root/{backup_name}.tar.gz /root/{backup_name}/data/')
out = stdout.read().decode('utf-8', errors='replace')
print(f'\n📄 备份文件:\n{out}')

client.close()
print('✅ 服务器备份完成')
