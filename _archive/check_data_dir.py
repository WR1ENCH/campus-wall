import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 看 qrcodes.json 和数据目录内容
cmds = [
    'ls -la /www/wwwroot/campus-wall/data/',
    'wc -c /www/wwwroot/campus-wall/data/qrcodes.json 2>/dev/null || echo "no qrcodes.json"',
    'cat /www/wwwroot/campus-wall/data/qrcodes.json 2>/dev/null || echo "no file"',
    # 看是否有 JSON FILE 常量被引用
    "grep -n 'POSTS_FILE\\|ADMINS_FILE\\|USERS_FILE\\|REPORTS_FILE\\|FEEDBACK_FILE\\|BULLYING_FILE\\|LOGS_FILE\\|CREDIT_LOGS_FILE\\|CREDIT_CARDS_FILE\\|QA_FILE\\|QA_ANSWERS_FILE\\|PICKUP_AUCTION_FILE\\|PICKUP_REPORT_FILE' /www/wwwroot/campus-wall/server.js | head -30",
]

for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    if out.strip():
        print(f'=== {cmd} ===')
        print(out[:600])

client.close()
