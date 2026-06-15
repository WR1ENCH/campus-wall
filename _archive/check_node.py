import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# Check node via multiple methods
cmds = [
    'ls -la /root/.nvm/versions/node/*/bin/node 2>/dev/null',
    'ls -la /usr/local/nvm/versions/node/*/bin/node 2>/dev/null',
    'ls -la /root/.nvm/nvm.sh 2>/dev/null',
    'cat /root/.bashrc | grep -i nvm 2>/dev/null',
    'cat /root/.bash_profile 2>/dev/null',
    'cat /root/.profile 2>/dev/null',
    'ls /www/wwwroot/campus-wall/node_modules/.bin/node 2>/dev/null',
    'find / -maxdepth 5 -name node -type f 2>/dev/null | head -10',
    'cat /www/wwwroot/campus-wall/package.json',
]
for cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out.strip():
        print(f'=== {cmd} ===')
        print(out[:500])
    if err.strip():
        print(f'ERR: {err[:200]}')

client.close()
