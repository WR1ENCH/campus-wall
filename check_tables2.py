import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('154.37.221.232', username='root', password='GAsYrIBjX8vWMCw6', timeout=15)
for f in ['feedbacks', 'qrcodes', 'pickup_reports', 'sensitive_custom']:
    si, so, se = c.exec_command('cat /www/wwwroot/campus-wall/data/' + f + '.json 2>&1 | wc -c', timeout=5)
    sz = so.read().decode('utf-8', errors='replace').strip()
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM " + f + ";'", timeout=5)
    cnt = so.read().decode('utf-8', errors='replace').strip()
    print(f'{f}: JSON={sz}B, DB={cnt} rows')
c.close()
