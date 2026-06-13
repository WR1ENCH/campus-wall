import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== readPasskey/writePasskey definition ===')
si, so, se = c.exec_command("grep -n 'function readPasskey\\|function writePasskey' /www/wwwroot/campus-wall/server.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== readApps/writeApps definition ===')
si, so, se = c.exec_command("grep -n 'function readApps\\|function writeApps' /www/wwwroot/campus-wall/server.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== PASSKEY_FILE ===')
si, so, se = c.exec_command("grep -n 'PASSKEY_FILE\\|APP_FILE' /www/wwwroot/campus-wall/server.js | head -10", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Read the definition lines ===')
si, so, se = c.exec_command("sed -n '5126,5155p' /www/wwwroot/campus-wall/server.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
