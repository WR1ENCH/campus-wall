import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Read the broken line
si, so, se = c.exec_command("sed -n '3592p' /www/wwwroot/campus-wall/server.js | cat -A", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('Broken line 3592:')
print(out[:500])
print()

# Better: use node to fix the file properly
NODE = '/www/server/nodejs/v22.22.3/bin/node'

fix_code = r'''
const fs = require('fs');
let content = fs.readFileSync('/www/wwwroot/campus-wall/server.js', 'utf8');

// Split into lines, fix bad lines, rejoin
let lines = content.split('\n');

// Find lines that have multiple function definitions jammed together
let fixed = false;
for (let i = 0; i < lines.length; i++) {
  // Check if this line has more than one function definition
  const funcMatches = (lines[i].match(/function \w+\(/g) || []);
  if (funcMatches.length > 1) {
    console.log('Found broken line ' + (i+1) + ': ' + funcMatches.length + ' functions on one line');
    // Split by "function " and rejoin with newlines
    // Also remove the \n literal strings
    let fixedLine = lines[i]
      .replace(/\\n/g, '\n')  // convert literal \n to actual newlines
      .replace(/function /g, '\nfunction ');  // split multi-function lines
    
    // leading newline trim
    fixedLine = fixedLine.replace(/^\n+/, '');
    lines[i] = fixedLine;
    fixed = true;
  }
}

content = lines.join('\n');
fs.writeFileSync('/www/wwwroot/campus-wall/server.js', content, 'utf8');
console.log('Fixed: ' + fixed);
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/fix_line.js', 'w') as f:
        f.write(fix_code)

stdin, stdout, stderr = c.exec_command(NODE + ' /tmp/fix_line.js 2>&1', timeout=15)
out = stdout.read().decode('utf-8', errors='replace')
err = stderr.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:300])

# Syntax check
stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1', timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print('Syntax:', out or 'OK')

# Verify functions
stdin, stdout, stderr = c.exec_command("grep -n 'function readQA\\|function writeQA\\|function writeCreditCards\\|function readPickup\\|function writePickup' /www/wwwroot/campus-wall/server.js | head -20", timeout=10)
out = stdout.read().decode('utf-8', errors='replace')
print('\nAll data functions:')
print(out)

c.close()
