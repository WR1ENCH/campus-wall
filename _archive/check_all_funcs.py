import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Check ALL functions that should be aliased
funcs = ['readPosts','writePosts','readAdmins','writeAdmins','hasAdmins','readUsers','writeUsers',
         'readTrustTokens','writeTrustTokens','readLogs','writeLogs',
         'readReports','writeReports','readFeedbacks','writeFeedbacks',
         'readBullying','writeBullying','readCreditLogs','writeCreditLogs',
         'readCreditCards','writeCreditCards','readAnnouncement','writeAnnouncement',
         'readDiscussions','writeDiscussions','readDiscussionComments','writeDiscussionComments',
         'readQAQuestions','writeQAQuestions','readQAAnswers','writeQAAnswers',
         'readPickupAuctions','writePickupAuctions','readPickupReports','writePickupReports',
         'readSC','writeSC','readNotices','writeNotices',
         'readPasskey','writePasskey','readApps','writeApps']

print('=== Functions that still use JSON files ===')
for fn in funcs:
    si, so, se = c.exec_command('grep "function ' + fn + '" /www/wwwroot/campus-wall/server.js | grep -v "db\\.' + fn + '" | grep -v "return db"', timeout=3)
    out = so.read().decode('utf-8', errors='replace').strip()
    if out:
        print(f'❌ {fn}: {out[:80]}')

print('\n=== Functions that are properly aliased ===')
for fn in funcs:
    si, so, se = c.exec_command('grep "function ' + fn + '" /www/wwwroot/campus-wall/server.js | grep "db\\.' + fn + '"', timeout=3)
    out = so.read().decode('utf-8', errors='replace').strip()
    if out:
        print(f'✅ {fn}')

c.close()
