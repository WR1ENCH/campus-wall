import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Step 1: Check current status
print('=== Current git log (local) ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -5', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('=== Git status ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git status --short', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Step 2: Stash any changes, pull with rebase
print('=== Stash + pull --rebase ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git stash && git pull --rebase origin master 2>&1', timeout=30)
out = so.read().decode('utf-8', errors='replace')
err = se.read().decode('utf-8', errors='replace')
print(out[:500])
if err: print('ERR:', err[:300])

# Step 3: Pop stash if needed
print('\n=== Stash pop ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git stash pop 2>&1', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:300])

# Step 4: Verify
print('\n=== Git log after pull ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && git log --oneline -5', timeout=10)
print(so.read().decode('utf-8', errors='replace'))

print('\n=== Verify index.html has the new link ===')
si, so, se = c.exec_command('grep "接入校园墙生态" /www/wwwroot/campus-wall/index.html', timeout=10)
out = so.read().decode('utf-8', errors='replace')
if out:
    print('✅ Link found:', out.strip()[:100])
else:
    print('❌ Link not found')

# Step 5: Restart server
print('\n=== Restart server ===')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1; sleep 2; ps aux | grep "node server" | grep -v grep', timeout=15)
print(so.read().decode('utf-8', errors='replace')[:200])

c.close()
