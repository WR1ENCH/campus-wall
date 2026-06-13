import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# 检查所有表 schema 中 INTEGER 类型的列（这些可能是 boolean）
tables = ['posts', 'users', 'admins', 'reports', 'feedbacks', 'credit_cards', 'credit_logs', 
          'discussions', 'discussion_comments', 'notices', 'qa_questions', 'qa_answers',
          'pickup_auctions', 'pickup_reports', 'login_logs', 'trust_tokens',
          'student_council', 'notice_applications', 'notice_passkey', 'bullying',
          'announcement', 'sensitive_custom', 'qrcodes']

for table in tables:
    cmd = "cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"PRAGMA table_info('" + table + "');\" 2>&1"
    si, so, se = c.exec_command(cmd, timeout=5)
    out = so.read().decode('utf-8', errors='replace')
    err = se.read().decode('utf-8', errors='replace')
    if err: 
        print(f'{table}: ERROR - {err[:100]}')
        continue
    if not out.strip():
        print(f'{table}: (no table)')
        continue
    lines = out.strip().split('\n')
    int_cols = []
    for l in lines:
        parts = l.split('|')
        if len(parts) >= 3 and parts[2] == 'INTEGER':
            int_cols.append(parts[1])
    if int_cols:
        print(f'{table}: INTEGER cols = {", ".join(int_cols)}')

c.close()
