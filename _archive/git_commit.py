import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 先删除备份文件
stdin, stdout, stderr = client.exec_command('rm -f /www/wwwroot/campus-wall/server.js.json-backup')
stdout.read()

# 写 commit message 到文件
commit_msg = """feat: 从 JSON 文件存储迁移到 SQLite (better-sqlite3)

- 替换所有 readXxx/writeXxx 函数为 SQLite 查询
- 新增 db.js 数据库模块
- 减少 391 行模板代码
- 数据已迁移 467 行到 campus.db

Co-Authored-By: AtomCode (deepseek-v4-flash) <noreply@atomgit.com>"""

with client.open_sftp() as sftp:
    with sftp.open('/tmp/commit_msg.txt', 'w') as f:
        f.write(commit_msg)

print('✅ commit message written')

# git add
stdin, stdout, stderr = client.exec_command('cd /www/wwwroot/campus-wall && git add server.js package.json db.js')
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
if out: print(out)
if err: print(f'ERR: {err[:300]}')
print('✅ git add done')

# git commit
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
