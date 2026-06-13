import paramiko, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

cmds = [
    ('QA函数定义', 'grep -n "function readQA\|function writeQA\|readQA\|writeQA" /www/wwwroot/campus-wall/server.js | head -30'),
    ('settleExpiredQuestions函数', 'grep -n "settleExpiredQuestions\|function.*settle" /www/wwwroot/campus-wall/server.js | head -5'),
    ('settleExpiredQuestions附近', 'sed -n "3610,3630p" /www/wwwroot/campus-wall/server.js'),
    ('QA函数定义位置1', 'sed -n "4455,4470p" /www/wwwroot/campus-wall/server.js'),
    ('QA函数定义位置2', 'sed -n "4645,4660p" /www/wwwroot/campus-wall/server.js'),
    ('QA_FILE定义', 'grep -n "QA_FILE\|QA_ANSWERS" /www/wwwroot/campus-wall/server.js | head -10'),
    ('还有哪些老的function read定义保留', 'grep -n "function read.*return.*readFileSync\|function write.*writeFileSync\|function ensureDir" /www/wwwroot/campus-wall/server.js | head -10'),
]

for title, cmd in cmds:
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    print('=== ' + title + ' ===')
    if out: print(out)
    if err: print('ERR: ' + err[:300])
    print()

client.close()
