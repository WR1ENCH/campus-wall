import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

checks = [
    ('db require', "grep -c 'require.*db' /www/wwwroot/campus-wall/server.js"),
    ('T1 举报通知', "grep -c '举报已收到' /www/wwwroot/campus-wall/server.js"),
    ('T1 霸凌通知', "grep -c '霸凌举报已收到' /www/wwwroot/campus-wall/server.js"),
    ('T0 霸凌通知', "grep -c '霸凌举报已确认处理' /www/wwwroot/campus-wall/server.js"),
    ('T0 拍卖通知', "grep -c '拍卖内容已通过审核' /www/wwwroot/campus-wall/server.js"),
    ('readPosts', "grep -c 'function readPosts' /www/wwwroot/campus-wall/server.js"),
    ('writePosts db', "grep -c 'db\\.writePosts' /www/wwwroot/campus-wall/server.js"),
    ('readNotices', "grep -c 'function readNotices' /www/wwwroot/campus-wall/server.js"),
    ('writeNotices', "grep -c 'function writeNotices' /www/wwwroot/campus-wall/server.js"),
]

for title, cmd in checks:
    si, so, se = c.exec_command(cmd, timeout=10)
    out = so.read().decode('utf-8', errors='replace').strip()
    print(f'{title}: {out}' if out else f'{title}: 0')

c.close()
