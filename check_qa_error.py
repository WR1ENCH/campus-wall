import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# 1. Test QA API directly
print('=== GET /api/qa/questions ===')
si, so, se = c.exec_command('curl -s http://localhost:3000/api/qa/questions 2>&1 | head -c 500', timeout=10)
out = so.read().decode('utf-8', errors='replace')
err = se.read().decode('utf-8', errors='replace')
print(out[:500])
if err: print('ERR:', err[:300])

# 2. Check QA data in SQLite
print('\n=== SQLite QA data ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -header -json campus.db 'SELECT * FROM qa_questions;' 2>&1 | head -c 500", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:500])

print('\n=== SQLite QA answers ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -header -json campus.db 'SELECT * FROM qa_answers;' 2>&1 | head -c 500", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:500])

# 3. Check qa schema
print('\n=== QA schema ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '.schema qa_questions' 2>&1 && echo '---' && sqlite3 campus.db '.schema qa_answers' 2>&1", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out)

# 4. Check recent errors in server output
print('\n=== Recent server errors (grep CRASH/Error/qa) ===')
si, so, se = c.exec_command("grep -i 'qa\|问答\|crash\|error' /www/wwwroot/campus-wall/server.out 2>&1 | tail -20", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:1000] or '(none)')

c.close()
