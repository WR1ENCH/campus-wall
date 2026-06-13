import paramiko, json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# First, check if there are OLD qa function definitions (the ones that read from JSON files) left behind
cmds = [
    ('所有function readQA/writeQA定义行', 'grep -n "^function readQA\|^function writeQA" /www/wwwroot/campus-wall/server.js'),
    ('readQAAnswers是否存在', 'grep -c "function readQAAnswers" /www/wwwroot/campus-wall/server.js'),
    ('writeQAAnswers是否存在', 'grep -c "function writeQAAnswers" /www/wwwroot/campus-wall/server.js'),
    ('查看3590-3600行', 'sed -n "3588,3600p" /www/wwwroot/campus-wall/server.js'),
    ('查看旧QA函数附近', 'grep -n "QA_FILE\|QA_ANSWERS_FILE\|const.*db\.readQA\|const.*db\.writeQA" /www/wwwroot/campus-wall/server.js | head -20'),
    ('查找readQAAnswers文本', 'grep -n "readQAAnswers" /www/wwwroot/campus-wall/server.js | head -30'),
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
