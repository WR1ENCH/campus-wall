import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# 读取全部 read/write 函数定义（范围）
ranges = [
    (183, 260),   # readPosts / writePosts / readAdmins / writeAdmins
    (506, 580),   # readUsers / writeUsers / readTrustTokens / writeTrustTokens / readLogs / writeLogs
    (2633, 2760), # readReports ~ writeCreditCards
    (2806, 2880), # readAnnouncement ~ writeDiscussionComments
    (3867, 3895), # readQAQuestions / writeQAQuestions / readQAAnswers / writeQAAnswers
    (4291, 4330), # readPickupAuctions / writePickupAuctions / readPickupReports / writePickupReports
    (4796, 4825), # readSC / writeSC
    (4807, 4840), # readNotices / writeNotices
    (5131, 5160), # readPasskey / writePasskey / readApps / writeApps
]

for start, end in ranges:
    cmd = f'sed -n "{start},{end}p" /www/wwwroot/campus-wall/server.js'
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace')
    if out.strip():
        print(f'\n{"="*50}')
        print(f'=== Lines {start}-{end} ===')
        print(out)

client.close()
