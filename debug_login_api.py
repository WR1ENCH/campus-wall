import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Test login endpoint directly with node
test_code = '''
const http = require('http');
const data = JSON.stringify({id:"wr1ench",password:"cai091226"});
const req = http.request({hostname:'localhost',port:3000,path:'/api/student-council/login',method:'POST',headers:{'Content-Type':'application/json','Content-Length':data.length}}, res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => console.log(body));
});
req.write(data);
req.end();
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/test_login.js', 'w') as f:
        f.write(test_code)

si, so, se = c.exec_command(NODE + ' /tmp/test_login.js 2>&1', timeout=15)
print('API response:', so.read().decode('utf-8', errors='replace')[:200])

# Also debug the server.js login path directly
print('\n=== Debug login path ===')
debug = '''
const db = require('/www/wwwroot/campus-wall/db');
const users = db.readUsers();
const id = "wr1ench";
const user = users.find(u => (u.nickname === id || u.id === id) && u.noticePublisher === true && u.status !== 'banned');
console.log("User found:", !!user);
if (user) {
  console.log("nickname:", user.nickname, "id:", user.id, "noticePublisher:", user.noticePublisher, "status:", user.status);
  console.log("Hash:", user.password ? "exists" : "null");
  const crypto = require('crypto');
  function v(p, s) {
    if (!s || !s.includes(':')) return false;
    const [salt, hash] = s.split(':');
    const ih = crypto.pbkdf2Sync(p, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(ih, 'hex'));
  }
  console.log("Verify:", v('cai091226', user.password));
}
'''
with c.open_sftp() as sftp:
    with sftp.open('/tmp/debug_login.js', 'w') as f:
        f.write(debug)

si, so, se = c.exec_command(NODE + ' /tmp/debug_login.js 2>&1', timeout=15)
print(so.read().decode('utf-8', errors='replace')[:500])

c.close()
