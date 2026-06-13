import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 查看 QR code 和敏感词相关代码
cmds = [
    'sed -n "455,470p" /www/wwwroot/campus-wall/server.js',  # trust tokens + qrcode consts
    'sed -n "775,810p" /www/wwwroot/campus-wall/server.js',  # QR code read/write
    'grep -n "SENSITIVE_CUSTOM_FILE\|WHITELIST_FILE\|QRCODE" /www/wwwroot/campus-wall/server.js',
    'sed -n "3410,3540p" /www/wwwroot/campus-wall/server.js', # sensitive words file ops
]

for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    if out.strip():
        print(f'=== {cmd} ===')
        print(out[:800])

client.close()
