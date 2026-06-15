import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Check what readUsers actually returns
test = '''
const db = require('/www/wwwroot/campus-wall/db');
const users = db.readUsers();
console.log("Total users:", users.length);
const u = users.find(x => x.nickname === "wr1ench" || x.username === "wr1ench");
if (u) {
  console.log("Found:", JSON.stringify({id:u.id, username:u.username, nickname:u.nickname, noticePublisher:u.noticePublisher, status:u.status}));
} else {
  // Show first 5 users
  users.slice(0,5).forEach((x,i) => console.log(i, x.id, x.username, x.nickname, x.noticePublisher, x.status));
  // Search case-insensitive
  const u2 = users.find(x => x.nickname && x.nickname.toLowerCase() === "wr1ench");
  console.log("CI search:", u2 ? u2.nickname : "not found");
}
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/debug_users.js', 'w') as f:
        f.write(test)

si, so, se = c.exec_command(NODE + ' /tmp/debug_users.js 2>&1', timeout=15)
print(so.read().decode('utf-8', errors='replace')[:500])

c.close()
