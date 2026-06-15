import paramiko, io, time, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

cmds = [
    ('Stash本地修改', 'cd /www/wwwroot/campus-wall && git stash 2>&1'),
    ('Pull合并', 'cd /www/wwwroot/campus-wall && git pull --no-rebase origin master 2>&1'),
    ('Pop stash恢复修改', 'cd /www/wwwroot/campus-wall && git stash pop 2>&1'),
    ('状态', 'cd /www/wwwroot/campus-wall && git log --oneline -3'),
    ('语法检查', 'cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -c db.js 2>&1'),
    ('重启', 'bash /tmp/restart2.sh 2>&1; sleep 2; ps aux | grep "node server" | grep -v grep'),
    ('验证API', "curl -s http://localhost:3000/api/captcha | python3 -c 'import json,sys; d=json.load(sys.stdin); print(\"Captcha:\", d[\"ok\"])'"),
    ('写帖测试', "curl -s -X POST http://localhost:3000/api/posts -H 'Content-Type: application/json' -d '{\"type\":\"text\",\"content\":\"GIT_SYNC_TEST\",\"avatar\":\"G\",\"author\":\"GitSync\"}' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(\"Create:\", d[\"ok\"])'"),
]

for title, cmd in cmds:
    print('=== ' + title + ' ===')
    si, so, se = c.exec_command(cmd, timeout=15)
    out = so.read().decode('utf-8', errors='replace')
    err = se.read().decode('utf-8', errors='replace')
    if out: print(out)
    if err: print('ERR:', err[:300])
    print()
    time.sleep(0.5)

# Final verification
print('=== 最终验证：帖子持久化 ===')
si, so, se = c.exec_command("curl -s http://localhost:3000/api/posts | python3 -c 'import json,sys; d=json.load(sys.stdin); posts=d.get(\"data\",[]); print(\"Total:\",len(posts)); found=[p for p in posts if \"GIT_SYNC_TEST\" in str(p)]; print(\"Persist:\",\"YES\" if found else \"NO\")'", timeout=15)
print(so.read().decode('utf-8', errors='replace')[:200])

c.close()
