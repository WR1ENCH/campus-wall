import paramiko, io, time, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

def ssh(cmd, timeout=10):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(host, username=user, password=passwd, timeout=10)
    si, so, se = c.exec_command(cmd, timeout=timeout)
    out = so.read().decode('utf-8', errors='replace')
    err = se.read().decode('utf-8', errors='replace')
    c.close()
    return out, err

print('=== Full server.out (errors mixed in) ===')
out, err = ssh('cat /www/wwwroot/campus-wall/server.out', timeout=10)
lines = out.split('\n')
# Show only lines with CRASH or Error
for l in lines:
    if 'CRASH' in l or 'Error' in l or 'error' in l.lower():
        print(l)
if not any('CRASH' in l or 'Error' in l for l in lines):
    print('No errors found in server.out!')

print('=== All lines in server.out ===')
for l in lines[-30:]:
    print(l)

print()
print('=== Test API endpoints ===')
# Test captcha, register, and list endpoints
out, err = ssh("curl -s http://localhost:3000/api/captcha | python3 -c 'import json,sys; d=json.load(sys.stdin); print(\"Captcha OK:\", d[\"ok\"])'", timeout=10)
print('Captcha:', out.strip())

out, err = ssh("curl -s http://localhost:3000/api/notices | python3 -c 'import json,sys; d=json.load(sys.stdin); print(\"Notices:\", d[\"ok\"], \"count:\", len(d.get(\"data\",[])))'", timeout=10)
print('Notices:', out.strip())

out, err = ssh("curl -s http://localhost:3000/api/admin/check-init | python3 -c 'import json,sys; d=json.load(sys.stdin); print(\"Init:\", d[\"ok\"], \"needInit:\", d[\"data\"][\"needInit\"])'", timeout=10)
print('Admin-Init:', out.strip())

time.sleep(3)

print()
print('=== Wait 3s, check server.out again for new errors ===')
out, err = ssh('tail -10 /www/wwwroot/campus-wall/server.out', timeout=10)
for l in out.split('\n'):
    if l.strip():
        print(l)
