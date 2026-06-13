import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

# Read the remote server.js
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)
si, so, se = c.exec_command('cat /www/wwwroot/campus-wall/server.js', timeout=15)
content = so.read().decode('utf-8', errors='replace')
c.close()

# Build the missing function definitions as a block
missing_block = """
function readQAAnswers() { return db.readQAAnswers(); }
function writeQAQuestions(data) { db.writeQAQuestions(data); }
function writeQAAnswers(data) { db.writeQAAnswers(data); }
function writeCreditCards(cards) { db.writeCreditCards(cards); }
function writePickupAuctions(data) { db.writePickupAuctions(data); }
function readPickupReports() { return db.readPickupReports(); }
function writePickupReports(data) { db.writePickupReports(data); }
"""

# Check which ones are already present
existing_funcs = []
for line in content.split('\n'):
    for fn in ['readQAAnswers', 'writeQAQuestions', 'writeQAAnswers', 'writeCreditCards',
               'writePickupAuctions', 'readPickupReports', 'writePickupReports']:
        if f'function {fn}(' in line:
            existing_funcs.append(fn)

print('Already existing:', existing_funcs)

# Find the insertion point: after 'function readQAQuestions() { return db.readQAQuestions(); }'
marker = 'function readQAQuestions() { return db.readQAQuestions(); }'
if marker in content:
    idx = content.index(marker) + len(marker)
    # Insert the missing functions
    new_content = content[:idx] + missing_block + content[idx:]
    print(f'Inserted missing functions after line with readQAQuestions')
else:
    print('ERROR: marker not found!')
    # Fallback: find settleExpiredQuestions and insert before it
    marker2 = 'function settleExpiredQuestions'
    if marker2 in content:
        idx = content.index(marker2)
        # Find the previous newline
        prev_nl = content.rfind('\n', 0, idx)
        new_content = content[:prev_nl+1] + missing_block + content[prev_nl+1:]
        print('Fallback: inserted before settleExpiredQuestions')
    else:
        print('ERROR: cannot find insertion point!')

# Write back
c2 = paramiko.SSHClient()
c2.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c2.connect(host, username=user, password=passwd, timeout=15)
with c2.open_sftp() as sftp:
    with sftp.open('/www/wwwroot/campus-wall/server.js', 'w') as f:
        f.write(new_content)

# Syntax check
NODE = '/www/server/nodejs/v22.22.3/bin/node'
si, so, se = c2.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c server.js 2>&1')
out = so.read().decode('utf-8', errors='replace')
err = se.read().decode('utf-8', errors='replace')
print('Syntax:', out or 'OK')
if err: print('ERR:', err[:300])

# Verify functions
si, so, se = c2.exec_command("grep -c 'function readQAAnswers' /www/wwwroot/campus-wall/server.js; echo '---'; grep -c 'function writeQAAnswers' /www/wwwroot/campus-wall/server.js; echo '---'; grep -c 'function writeCreditCards' /www/wwwroot/campus-wall/server.js", timeout=10)
out = so.read().decode('utf-8', errors='replace')
print('readQAAnswers:', out.split('---')[0].strip() if '---' in out else '?')
print('writeQAAnswers:', out.split('---')[1].strip() if '---' in out else '?')
print('writeCreditCards:', out.split('---')[2].strip() if '---' in out else '?')

# Test QA API
print()
print('=== Testing QA API ===')
si, so, se = c2.exec_command('curl -s http://localhost:3000/api/qa/questions 2>&1 | head -c 300', timeout=10)
out = so.read().decode('utf-8', errors='replace')
print(out[:300])

c2.close()
