import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Look at the frontend submitWithPasskey more carefully
print('=== Frontend submitWithPasskey code ===')
si, so, se = c.exec_command("grep -A30 'submitWithPasskey = async' /www/wwwroot/campus-wall/apply-notice.html 2>&1", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Also check if there's an issue with the closePasskeyModal calling refresh captcha
print('\n=== closePasskeyModal ===')
si, so, se = c.exec_command("grep -A6 'closePasskeyModal' /www/wwwroot/campus-wall/apply-notice.html 2>&1", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
