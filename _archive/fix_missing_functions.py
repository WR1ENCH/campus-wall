import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Write fix script
fix_code = '''
const fs = require('fs');
let content = fs.readFileSync('/www/wwwroot/campus-wall/server.js', 'utf8');

// List of all db.* function stubs that need to exist
const needed = [
  'function readQAAnswers() { return db.readQAAnswers(); }',
  'function writeQAQuestions(data) { db.writeQAQuestions(data); }',
  'function writeQAAnswers(data) { db.writeQAAnswers(data); }',
  'function writeCreditCards(cards) { db.writeCreditCards(cards); }',
  'function writePickupAuctions(data) { db.writePickupAuctions(data); }',
  'function readPickupReports() { return db.readPickupReports(); }',
  'function writePickupReports(data) { db.writePickupReports(data); }',
];

let added = 0;
for (const stub of needed) {
  const funcName = stub.split('(')[0].replace('function ', '');
  // Check if this function already exists
  const re = new RegExp('function ' + funcName + '\\\\s*\\\\(');
  if (re.test(content)) {
    continue; // already exists
  }
  // Find insertion point - after the nearest sibling or last QA function
  const insertAfter = 'function readQAQuestions() { return db.readQAQuestions(); }';
  if (content.includes(insertAfter)) {
    content = content.replace(insertAfter, insertAfter + '\\\\n' + stub);
    added++;
    console.log('Added: ' + funcName);
  }
}

if (added > 0) {
  fs.writeFileSync('/www/wwwroot/campus-wall/server.js', content, 'utf8');
}
console.log('Total added: ' + added);
'''

# Write to temp file
with c.open_sftp() as sftp:
    with sftp.open('/tmp/fix_missing_funcs.js', 'w') as f:
        f.write(fix_code)

stdin, stdout, stderr = c.exec_command(NODE + ' /tmp/fix_missing_funcs.js 2>&1', timeout=15)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:300])

# Verify
print()
print('=== QA functions after fix ===')
stdin, stdout, stderr = c.exec_command("grep -n 'function readQA\\|function writeQA\\|function writeCreditCards\\|function readPickup\\|function writePickup' /www/wwwroot/campus-wall/server.js", timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print(out)

# Syntax check
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1', timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print('Syntax:', out or 'OK')

c.close()
