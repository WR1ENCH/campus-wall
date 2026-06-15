import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# Find where the running node binary is
stdin, stdout, stderr = client.exec_command('ls -la /proc/1245501/exe 2>/dev/null && readlink -f /proc/1245501/exe')
print('Running node binary:', stdout.read().decode('utf-8', errors='replace'))

# Check node --version from running process's environment
stdin, stdout, stderr = client.exec_command('cat /proc/1245501/cmdline | tr "\\0" " "')
print('Command line:', stdout.read().decode('utf-8', errors='replace'))

# Check environment
stdin, stdout, stderr = client.exec_command('cat /proc/1245501/environ 2>/dev/null | tr "\\0" "\\n" | grep -i "PATH\\|NVM\\|NODE"')
print('PATH from process:', stdout.read().decode('utf-8', errors='replace'))

client.close()
