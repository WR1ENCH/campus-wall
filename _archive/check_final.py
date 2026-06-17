import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('154.37.221.232', username='root', password='GAsYrIBjX8vWMCw6', timeout=15)

si, so, se = c.exec_command("grep -c 'noticePublisher' /www/wwwroot/campus-wall/db.js", timeout=10)
print('noticePublisher in db.js:', so.read().decode('utf-8', errors='replace').strip())

si, so, se = c.exec_command("cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -e \"const db=require('./db'); const sc=db.readSC(); console.log(!!sc, sc?sc.id:null)\"", timeout=10)
print('readSC:', so.read().decode('utf-8', errors='replace').strip())

si, so, se = c.exec_command('curl -s http://localhost:3000/api/student-council/check-init', timeout=10)
print('check-init:', so.read().decode('utf-8', errors='replace').strip())
c.close()
