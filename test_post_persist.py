import paramiko, io, sys
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

print('=== Current posts count from API ===')
out, err = ssh("curl -s http://localhost:3000/api/posts | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d.get(\"data\",[])))'", timeout=15)
print('Count: ' + out.strip())

print()
print('=== SQLite direct count ===')
out, err = ssh("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM posts;'", timeout=10)
print('DB count: ' + out.strip())

print()
print('=== Create test post ===')
out, err = ssh("curl -s -X POST http://localhost:3000/api/posts -H 'Content-Type: application/json' -d '{\"type\":\"text\",\"content\":\"TEST_VERIFY_67890\",\"avatar\":\"X\",\"author\":\"TestUser\"}'", timeout=15)
print('Response: ' + out[:200])

print()
print('=== API count after write ===')
out, err = ssh("curl -s http://localhost:3000/api/posts | python3 -c 'import json,sys; d=json.load(sys.stdin); posts=d.get(\"data\",[]); print(\"Total:\",len(posts)); found=[p for p in posts if \"TEST_VERIFY_67890\" in str(p)]; print(\"Found:\",len(found))'", timeout=15)
print(out.strip())

print()
print('=== SQLite direct check ===')
out, err = ssh("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"SELECT id, content FROM posts WHERE content LIKE '%TEST_VERIFY_67890%';\"", timeout=10)
print('SQLite: ' + (out.strip() or '(not found in DB directly)'))

print()
print('=== Read all post IDs and content from SQLite ===')
out, err = ssh("cd /www/wwwroot/campus-wall/data && sqlite3 -header -column campus.db 'SELECT id, content FROM posts ORDER BY rowid DESC LIMIT 5;'", timeout=10)
print(out[:500])
