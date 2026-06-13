import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# The index.html is already updated. db.js from SFTP has the fix.
# Just need to take current files, add, and continue rebase.

print('=== Check if db.js has conflict markers ===')
si, so, se = c.exec_command("grep -c '<<<<<<<' /www/wwwroot/campus-wall/db.js 2>/dev/null; echo '---'; grep -c '<<<<<<<' /www/wwwroot/campus-wall/package.json 2>/dev/null", timeout=10)
out = so.read().decode('utf-8', errors='replace')
parts = out.split('---')
print(f'db.js conflicts: {parts[0].strip()}')
print(f'package.json conflicts: {parts[1].strip() if len(parts)>1 else "?"}')

# If conflicts exist, resolve by taking current file (our fixed version)
# Then git add + continue rebase
print('\n=== Resolving conflicts and continuing rebase ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git add db.js package.json && git rebase --continue 2>&1', timeout=15)
out = so.read().decode('utf-8', errors='replace')
print(out[:500])

# If that failed (e.g. no changes needed), try skip
if 'error' in out.lower() or 'nothing to commit' in out.lower():
    print('\n=== Trying rebase --skip ===')
    si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git rebase --skip 2>&1', timeout=15)
    out = so.read().decode('utf-8', errors='replace')
    print(out[:300])

print('\n=== Git log ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -6', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Git status ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git status --short', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out or '(clean)')

# Verify the server is running
print('\n=== Verify server ===')
si, so, se = c.exec_command('ps aux | grep "node server" | grep -v grep', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out or 'NOT RUNNING')

c.close()
