import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Temporarily inject debug logging into server.js login endpoint
# Read the current file and add debugging
si, so, se = c.exec_command("grep -n 'student-council/login' /www/wwwroot/campus-wall/server.js", timeout=10)
line = so.read().decode('utf-8', errors='replace').strip()
print('Login endpoint line:', line)

# Check the actual code around lines 4668-4680
si, so, se = c.exec_command("sed -n '4668,4680p' /www/wwwroot/campus-wall/server.js", timeout=10)
print(so.read().decode('utf-8', errors='replace'))

# Let's directly test the user search logic
print('\n=== Direct test of the users.find logic ===')
test = '''
const db = require('./db');
const users = db.readUsers();
const id = "wr1ench";
// Exact same logic as server.js
const user = users.find(u => (u.nickname === id || u.id === id) && u.noticePublisher === true && u.status !== 'banned');
console.log("nickname check:", users.find(u => u.nickname === id) ? "found" : "not found");
console.log("id check:", users.find(u => u.id === id) ? "found" : "not found");
console.log("noticePublisher type:", typeof (user ? user.noticePublisher : "N/A"), "value:", user ? user.noticePublisher : "N/A");
console.log("status:", user ? user.status : "N/A");
console.log("=== All users with noticePublisher ===");
users.filter(u => u.noticePublisher).forEach(u => console.log(u.nickname, u.noticePublisher, u.status, typeof u.noticePublisher));
'''

with c.open_sftp() as sftp:
    with sftp.open('/www/wwwroot/campus-wall/debug_user2.js', 'w') as f:
        f.write(test)

si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' debug_user2.js 2>&1', timeout=15)
print(so.read().decode('utf-8', errors='replace')[:500])

c.exec_command('rm /www/wwwroot/campus-wall/debug_user2.js')
c.close()
