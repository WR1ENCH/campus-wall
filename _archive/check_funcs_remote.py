import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

# Check all function definitions on server
funcs = ['readUsers', 'writeUsers', 'readPosts', 'writePosts', 'readAdmins', 'writeAdmins',
         'hasAdmins', 'readTrustTokens', 'writeTrustTokens', 'readLogs', 'writeLogs',
         'readReports', 'writeReports', 'readFeedbacks', 'writeFeedbacks', 'readBullying', 'writeBullying',
         'readCreditLogs', 'writeCreditLogs', 'readCreditCards', 'writeCreditCards',
         'readAnnouncement', 'writeAnnouncement',
         'readDiscussions', 'writeDiscussions', 'readDiscussionComments', 'writeDiscussionComments',
         'readPickupAuctions', 'writePickupAuctions', 'readPickupReports', 'writePickupReports',
         'readSC', 'writeSC', 'readNotices', 'writeNotices',
         'readPasskey', 'writePasskey', 'readApps', 'writeApps']

# Build a single grep command for all function names
pattern = '\\(' + '\\|'.join(funcs) + '\\)'
stdin, stdout, stderr = client.exec_command("grep -n 'function read\\|function write\\|function hasAdmins' /www/wwwroot/campus-wall/server.js")
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print('=== All function definitions ===')
print(out)

# Also check if any are const-style
stdin2, stdout2, stderr2 = client.exec_command("grep -n 'const read\\|const write\\|const has' /www/wwwroot/campus-wall/server.js | grep -i 'db\\.'")
out2 = stdout2.read().decode('utf-8', errors='replace')
print('=== Const-style db aliases ===')
print(out2 or '(none found)')

client.close()
