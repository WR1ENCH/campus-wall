import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('154.37.221.232', username='root', password='GAsYrIBjX8vWMCw6', timeout=15)

# Check reports table and data
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall/data && sqlite3 campus.db ".schema reports"', timeout=5)
print('reports schema:', so.read().decode('utf-8', errors='replace')[:200])
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM reports'", timeout=5)
print('reports count:', so.read().decode('utf-8', errors='replace').strip())
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -json campus.db 'SELECT * FROM reports LIMIT 1'", timeout=5)
print('reports sample:', so.read().decode('utf-8', errors='replace')[:200])

# Test admin reports API
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/admin/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1Ench\",\"password\":\"cai091226\"}'", timeout=5)
import json as j
login = so.read().decode('utf-8', errors='replace')
token = j.loads(login).get('data', {}).get('token', '')
if token:
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/admin/reports -H 'x-admin-token: " + token + "'", timeout=5)
    print('Reports API:', so.read().decode('utf-8', errors='replace')[:300])
c.close()
