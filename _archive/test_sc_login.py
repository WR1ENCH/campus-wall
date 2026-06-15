import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Test student council login directly
print('=== Test SC login without captcha (captcha is optional if not sent) ===')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"admin_std\",\"password\":\"cai091226\"}' 2>&1", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Response:', out[:200])

# Try empty captcha
print('\n=== Test with empty captcha fields ===')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/student-council/login -H 'Content-Type: application/json' -d '{\"id\":\"admin_std\",\"password\":\"cai091226\",\"captchaId\":\"\",\"captchaText\":\"\"}' 2>&1", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Response:', out[:200])

# Test notice.html frontend - check if it sends captcha
print('\n=== notice.html login function ===')
si, so, se = c.exec_command("grep -A20 'function doLogin' /www/wwwroot/campus-wall/notice.html | head -25", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

c.close()
