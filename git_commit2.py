import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 配置 git 用户（仓库级别，匹配之前的提交者）
cmds = [
    'cd /www/wwwroot/campus-wall && git config user.email "wyxgg10086@gmail.com"',
    'cd /www/wwwroot/campus-wall && git config user.name "wr1Ench"',
]
for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    stdout.read()
print('✅ git config set')

# 提交
stdin, stdout, stderr = client.exec_command('cd /www/wwwroot/campus-wall && git commit -F /tmp/commit_msg.txt')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print(f'ERR: {err[:300]}')

# 查看结果
print('\n=== git log -1 ===')
stdin, stdout, stderr = client.exec_command('cd /www/wwwroot/campus-wall && git log -1')
print(stdout.read().decode('utf-8', errors='replace'))

print('\n=== git status ===')
stdin, stdout, stderr = client.exec_command('cd /www/wwwroot/campus-wall && git status')
print(stdout.read().decode('utf-8', errors='replace'))

client.close()
