import paramiko, io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

print('Restarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])
time.sleep(2)

# Test login using node (simulate the exact server flow)
print('\n=== Simulate login flow ===')
test = '''
const http = require('http');
const data = JSON.stringify({id:"wr1ench",password:"cai091226"});
const req = http.request({hostname:'localhost',port:3000,path:'/api/student-council/login',method:'POST',headers:{'Content-Type':'application/json','Content-Length':data.length}}, res => {
  let body = '';
  res.on('data',c=>body+=c);
  res.on('end',()=>console.log(body));
});
req.write(data);
req.end();
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/test.js', 'w') as f:
        f.write(test)

si, so, se = c.exec_command(NODE + ' /tmp/test.js 2>&1', timeout=15)
print('Login:', so.read().decode('utf-8', errors='replace')[:200])

# Also test the check-init
si, so, se = c.exec_command('curl -s http://localhost:3000/api/student-council/check-init 2>&1', timeout=10)
print('check-init:', so.read().decode('utf-8', errors='replace')[:100])

c.close()
