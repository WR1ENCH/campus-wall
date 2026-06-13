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

print('=== Posts table schema ===')
out, err = ssh("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '.schema posts'", timeout=10)
print(out)

print()
print('=== First post (oldest) in DB ===')
out, err = ssh("cd /www/wwwroot/campus-wall/data && sqlite3 -header -json campus.db 'SELECT * FROM posts ORDER BY rowid ASC LIMIT 1;'", timeout=10)
print(out[:500])

print()
print('=== Last post (newest) in DB ===')
out, err = ssh("cd /www/wwwroot/campus-wall/data && sqlite3 -header -json campus.db 'SELECT * FROM posts ORDER BY rowid DESC LIMIT 3;'", timeout=10)
print(out[:1500])

print()
print('=== DB columns ===')
out, err = ssh("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA table_info(posts);'", timeout=10)
print(out)

print()
print('=== Test: try manual INSERT ===')
out, err = ssh("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"INSERT INTO posts (id,type,content,avatar,author,time,likes) VALUES ('test123','text','hello','X','T','2024-01-01',0); SELECT COUNT(*) FROM posts;\"", timeout=10)
print(out)
