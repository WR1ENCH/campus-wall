import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Full end-to-end test: register user -> apply with wrong passkey
print('=== Step 1: Get captcha ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/captcha 2>&1", timeout=10)
resp = so.read().decode('utf-8', errors='replace')
import json as j
captcha = j.loads(resp) if resp else {}
cid = captcha.get('data', {}).get('id', '')
ctext = captcha.get('data', {}).get('text', '')
print(f'Captcha ID: {cid}, text: {ctext}')

print('\n=== Step 2: Register test user ===')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/user/register -H 'Content-Type: application/json' -d '{\"username\":\"test_wrong_pk\",\"password\":\"test123456\",\"nickname\":\"测试通行码\",\"captchaId\":\"" + cid + "\",\"captchaText\":\"" + ctext + "\"}'", timeout=10)
resp = so.read().decode('utf-8', errors='replace')
print('Register:', resp[:200])
user_data = j.loads(resp) if resp else {}
user_token = user_data.get('data', {}).get('token', '')
print('User token:', user_token[:20] + '...' if user_token else 'FAIL')

if user_token:
    # Get a new captcha for the application
    print('\n=== Step 3: Get captcha for application ===')
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/captcha 2>&1", timeout=10)
    resp2 = so.read().decode('utf-8', errors='replace')
    captcha2 = j.loads(resp2) if resp2 else {}
    cid2 = captcha2.get('data', {}).get('id', '')
    ctext2 = captcha2.get('data', {}).get('text', '')
    
    print('\n=== Step 4: Submit with WRONG passkey ===')
    si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/notice-account/apply -H 'Content-Type: application/json' -H 'x-user-token: " + user_token + "' -d '{\"name\":\"测试人\",\"department\":\"测试部\",\"contact\":\"13800138000\",\"reason\":\"测试\",\"passkey\":\"WRONG_PASSKEY\",\"captchaId\":\"" + cid2 + "\",\"captchaText\":\"" + ctext2 + "\"}'", timeout=10)
    out = so.read().decode('utf-8', errors='replace')
    print('Response:', out[:300])
    
    print('\n=== Step 5: Submit with NO passkey ===')
    # Get another captcha
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/captcha 2>&1", timeout=10)
    resp3 = so.read().decode('utf-8', errors='replace')
    captcha3 = j.loads(resp3) if resp3 else {}
    cid3 = captcha3.get('data', {}).get('id', '')
    ctext3 = captcha3.get('data', {}).get('text', '')
    
    si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/notice-account/apply -H 'Content-Type: application/json' -H 'x-user-token: " + user_token + "' -d '{\"name\":\"测试人2\",\"department\":\"测试部2\",\"contact\":\"13800138001\",\"reason\":\"测试2\",\"passkey\":\"\",\"captchaId\":\"" + cid3 + "\",\"captchaText\":\"" + ctext3 + "\"}'", timeout=10)
    out = so.read().decode('utf-8', errors='replace')
    print('Response:', out[:300])

c.close()
