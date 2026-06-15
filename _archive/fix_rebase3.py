import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Check current rebase state
print('=== Rebase status ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && cat .git/rebase-merge/onto 2>/dev/null; echo "---"; cat .git/rebase-merge/head-name 2>/dev/null', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:200])

# Try skip (this commit's changes are already in our files)
print('\n=== git rebase --skip ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git rebase --skip 2>&1', timeout=15)
out = so.read().decode('utf-8', errors='replace')
print(out[:500])

# Check if more conflicts
if 'conflict' in out.lower() or 'CONFLICT' in out:
    print('\n=== Resolve and continue ===')
    si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git add -A && GIT_EDITOR=true git rebase --continue 2>&1', timeout=15)
    out = so.read().decode('utf-8', errors='replace')
    print(out[:300])

# Final status
print('\n=== Final git log ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -6', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Final git status ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git status --short', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out or '(clean)')

# Make sure server is running
print('\n=== Server check ===')
si, so, se = c.exec_command('ps aux | grep "node server" | grep -v grep', timeout=10)
out = so.read().decode('utf-8', errors='replace')
if not out:
    print('Server not running, restarting...')
    si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
    print(so.read().decode('utf-8', errors='replace')[:100])
    time.sleep(2)
    si, so, se = c.exec_command('ps aux | grep "node server" | grep -v grep', timeout=10)
    print(so.read().decode('utf-8', errors='replace') or 'STILL NOT RUNNING')
else:
    print('Server: ✅')

c.close()
