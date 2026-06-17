import paramiko, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# Check what's in the project directory
stdin, stdout, stderr = client.exec_command('ls -la /www/wwwroot/campus-wall/')
print('=== campus-wall dir ===')
print(stdout.read().decode('utf-8', errors='replace'))
err = stderr.read().decode('utf-8', errors='replace')
if err: print('ERR:', err[:300])

# Find node and npm
stdin, stdout, stderr = client.exec_command('command -v node 2>/dev/null || echo "node not found"')
print('\n=== node ===')
print(stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = client.exec_command('command -v npm 2>/dev/null || echo "npm not found"')
print('\n=== npm ===')
print(stdout.read().decode('utf-8', errors='replace'))

# Try with explicit paths
stdin, stdout, stderr = client.exec_command('ls /usr/local/nvm/versions/node/*/bin/node 2>/dev/null; ls /root/.nvm/versions/node/*/bin/node 2>/dev/null; ls /usr/local/bin/node 2>/dev/null; ls /usr/bin/node 2>/dev/null; ls /snap/bin/node 2>/dev/null')
print('\n=== possible node paths ===')
print(stdout.read().decode('utf-8', errors='replace'))

client.close()
