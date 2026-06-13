import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# Try to find node via interactive shell
stdin, stdout, stderr = client.exec_command('bash -lc "which node"')
print('bash -lc which node:', stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = client.exec_command('ps aux | grep node | grep -v grep')
print('ps aux | grep node:', stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = client.exec_command('ls -la /usr/bin/node* /usr/local/bin/node* 2>/dev/null')
print('ls /usr/bin/node*:', stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = client.exec_command('readlink -f $(which node) 2>/dev/null || echo "no node in PATH"')
print('readlink:', stdout.read().decode('utf-8', errors='replace'))

# Try with www user too
stdin, stdout, stderr = client.exec_command('su - www -c "which node" 2>/dev/null || echo "www user not available"')
print('www user which node:', stdout.read().decode('utf-8', errors='replace'))

stdin, stdout, stderr = client.exec_command('dpkg -l 2>/dev/null | grep node || rpm -qa 2>/dev/null | grep node || echo "no dpkg/rpm node"')
print('package check:', stdout.read().decode('utf-8', errors='replace')[:300])

client.close()
