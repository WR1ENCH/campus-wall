import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'
DIR = '/www/wwwroot/campus-wall'

# 停止旧服务
print('🛑 Stopping old server...')
stdin, stdout, stderr = client.exec_command('pkill -f "node server.js" 2>/dev/null; sleep 1; echo "done"')
print(stdout.read().decode('utf-8', errors='replace'))

# 确认停止
stdin, stdout, stderr = client.exec_command('ps aux | grep "node server" | grep -v grep | wc -l')
count = stdout.read().decode('utf-8', errors='replace').strip()
print(f'  Remaining node processes: {count}')

# 启动新服务
print(f'\n🚀 Starting new server...')
cmd = f'cd {DIR} && SENSITIVE_KEY=a4abce322fca09afc3d76c6bbae6077b2be1a741a7e6b1008f3a939fb9f9502a nohup {NODE} server.js > server.out 2> server.err &'
stdin, stdout, stderr = client.exec_command(cmd)
time.sleep(2)

# 检查是否成功启动
stdin, stdout, stderr = client.exec_command(f'cd {DIR} && tail -5 server.out')
print('\n📋 Server output:')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = client.exec_command(f'cd {DIR} && cat server.err')
err_out = stdout.read().decode('utf-8', errors='replace')
if err_out.strip():
    print('⚠️ Server stderr:', err_out[:500])

# 确认进程在运行
stdin, stdout, stderr = client.exec_command('ps aux | grep "node server" | grep -v grep')
print('\n📋 Running processes:')
print(stdout.read().decode('utf-8', errors='replace'))

# 测试 API
print('\n🔍 Testing API...')
stdin, stdout, stderr = client.exec_command(f'curl -s http://localhost:3000/api/posts | head -c 200')
api_out = stdout.read().decode('utf-8', errors='replace')
if api_out:
    print(f'  GET /api/posts: ✅ ({len(api_out)} chars)')
    print(f'  First 200 chars: {api_out[:200]}')
else:
    print('  GET /api/posts: ❌ No response')

stdin, stdout, stderr = client.exec_command(f'curl -s http://localhost:3000/api/stats | head -c 300')
stats_out = stdout.read().decode('utf-8', errors='replace')
if stats_out:
    print(f'  GET /api/stats: ✅ ({len(stats_out)} chars)')
    print(f'  Stats: {stats_out[:300]}')

client.close()
