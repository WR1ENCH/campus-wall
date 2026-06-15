import paramiko, io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

print('=== All notices in DB ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -json campus.db 'SELECT id, title, targetUserId, auto FROM notices ORDER BY createdAt DESC;'", timeout=10)
out = so.read().decode('utf-8', errors='replace')
notices = json.loads(out) if out else []
print('Total:', len(notices))
for n in notices:
    tid = n.get('targetUserId')
    auto = n.get('auto')
    print(' ', n['id'], '| auto:', auto, '| target:', tid, '|', n['title'][:30])

print()
print('=== Notice count by auto/target ===')
with_tid = [n for n in notices if n.get('targetUserId')]
without_tid = [n for n in notices if not n.get('targetUserId')]
print('With targetUserId:', len(with_tid))
print('Without targetUserId:', len(without_tid))

c.close()
