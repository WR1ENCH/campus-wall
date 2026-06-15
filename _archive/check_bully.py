import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('154.37.221.232', username='root', password='GAsYrIBjX8vWMCw6', timeout=15)
for name, pat in [('T1', '霸凌举报已收到'), ('T0', '霸凌举报已确认处理')]:
    si, so, se = c.exec_command('grep -c "' + pat + '" /www/wwwroot/campus-wall/server.js', timeout=10)
    print(name + ':', so.read().decode('utf-8', errors='replace').strip())
c.close()
