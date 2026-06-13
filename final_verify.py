import paramiko, io, time, sys
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

tests = [
    ('Captcha', 'curl -s http://localhost:3000/api/captcha 2>&1 | head -c 100'),
    ('Notices', 'curl -s http://localhost:3000/api/notices 2>&1 | head -c 200'),
    ('Admin Check', 'curl -s http://localhost:3000/api/admin/check-init 2>&1'),
    ('Error count', 'grep -c "CRASH" /www/wwwroot/campus-wall/server.out 2>/dev/null; echo "---"; grep -c "readQAAnswers" /www/wwwroot/campus-wall/server.out 2>/dev/null'),
    ('DB integrity', "cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA integrity_check;'"),
    ('All tables count', "cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"SELECT 'posts', COUNT(*) FROM posts UNION ALL SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'admins', COUNT(*) FROM admins UNION ALL SELECT 'reports', COUNT(*) FROM reports UNION ALL SELECT 'discussions', COUNT(*) FROM discussions UNION ALL SELECT 'discussion_comments', COUNT(*) FROM discussion_comments UNION ALL SELECT 'notices', COUNT(*) FROM notices UNION ALL SELECT 'login_logs', COUNT(*) FROM login_logs UNION ALL SELECT 'qa_questions', COUNT(*) FROM qa_questions UNION ALL SELECT 'qa_answers', COUNT(*) FROM qa_answers UNION ALL SELECT 'pickup_auctions', COUNT(*) FROM pickup_auctions UNION ALL SELECT 'feedbacks', COUNT(*) FROM feedbacks UNION ALL SELECT 'credit_logs', COUNT(*) FROM credit_logs UNION ALL SELECT 'credit_cards', COUNT(*) FROM credit_cards UNION ALL SELECT 'student_council', COUNT(*) FROM student_council UNION ALL SELECT 'trust_tokens', COUNT(*) FROM trust_tokens;\""),
]

for name, cmd in tests:
    out, err = ssh(cmd, timeout=10)
    print(f'=== {name} ===')
    print(out[:300])
    print()
