import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Read the file and use node to deduplicate
dedup_code = r'''
const fs = require('fs');
let content = fs.readFileSync('/www/wwwroot/campus-wall/server.js', 'utf8');
const lines = content.split('\n');

// Track which function names we've seen
const seen = new Set();
const keep = [];

// Also remove empty lines that are just whitespace
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/function (\w+)\(/);
  if (m) {
    const fname = m[1];
    if (seen.has(fname)) {
      // Skip duplicate function definition
      console.log('Removed duplicate: ' + fname + ' at line ' + (i+1));
      continue;
    }
    seen.add(fname);
  }
  keep.push(line);
}

fs.writeFileSync('/www/wwwroot/campus-wall/server.js', keep.join('\n'), 'utf8');
console.log('Done. Total lines: ' + keep.length);
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/dedup.js', 'w') as f:
        f.write(dedup_code)

stdin, stdout, stderr = c.exec_command(NODE + ' /tmp/dedup.js 2>&1', timeout=15)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:300])

# Syntax check
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1', timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print('Syntax:', out or 'OK')

# Verify no duplicates
stdin, stdout, stderr = c.exec_command("grep -n 'function readQA\\|function writeQA\\|function writeCreditCards\\|function readPickup\\|function writePickup' /www/wwwroot/campus-wall/server.js | head -20", timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print('\nFunctions after dedup:')
print(out)

# Test QA API
print('\n=== Testing QA API ===')
stdin, stdout, stderr = c.exec_command('curl -s http://localhost:3000/api/qa/questions 2>&1 | head -c 300', timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print(out[:300])

c.close()
