import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Find the notice
print('=== Search for the notice ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -json campus.db \"SELECT id, title, substr(content,1,60) as content_preview, createdAt FROM notices WHERE title LIKE '%举报已收到%' ORDER BY createdAt DESC;\"", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out)

# Delete it
print('\n=== Delete the notice ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"DELETE FROM notices WHERE title LIKE '%举报已收到%' AND createdAt LIKE '2026-06-11%';\"", timeout=10)
err = se.read().decode('utf-8', errors='replace')
print('Deleted' if not err else f'Error: {err}')

# Verify
print('\n=== Verify deletion ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"SELECT COUNT(*) FROM notices WHERE title LIKE '%举报已收到%';\"", timeout=10)
out = so.read().decode('utf-8', errors='replace').strip()
print(f'Remaining: {out}')

c.close()
