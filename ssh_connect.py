import paramiko, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('154.37.221.232', username='root', password='GAsYrIBjX8vWMCw6', timeout=15)

commands = [
    "ps aux | grep -E 'node.*server' | grep -v grep",
    "pm2 list 2>/dev/null || echo pm2 not found",
    "cat /www/wwwroot/campus-wall/package.json 2>/dev/null | head -20",
    "cd /www/wwwroot/campus-wall && git remote -v",
    "cd /www/wwwroot/campus-wall && git log --oneline -1",
    "netstat -tlnp 2>/dev/null | grep -E '3000|3001|8081' || ss -tlnp | grep -E '3000|3001|8081'",
    # 看看有没有 docker
    "docker ps 2>/dev/null | head -5 || echo no docker",
]

for cmd in commands:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    if out:
        print(f'=== {cmd[:50]} ===')
        print(out[:1000])
        print()
client.close()
