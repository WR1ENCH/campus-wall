import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Drop old table
print('=== Drop old bullying table ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'DROP TABLE IF EXISTS bullying;' 2>&1", timeout=10)
print(so.read().decode('utf-8', errors='replace') or 'OK')

# Create new table
print('\n=== Create new bullying table ===')
sql = '''
CREATE TABLE IF NOT EXISTS "bullying" (
  "id" TEXT, "reporterRole" TEXT, "victimName" TEXT,
  "bullyType" TEXT, "description" TEXT, "involved" TEXT,
  "location" TEXT, "incidentTime" TEXT, "contact" TEXT,
  "anonymous" INTEGER, "images" TEXT, "time" TEXT,
  "status" TEXT, "handledBy" TEXT, "handledAt" TEXT,
  "handleNote" TEXT, "userId" TEXT
);
'''
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db '" + sql.strip().replace("'", "'\\''") + "' 2>&1", timeout=10)
print('Create table:', so.read().decode('utf-8', errors='replace') or 'OK')

# Use node from project dir to read JSON and insert
print('\n=== Migrate data from JSON ===')
# Write a script inside the project dir
fix_code = r'''
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'campus.db'));
const jsonPath = path.join(__dirname, 'data', 'bullying.json');
let jsonData = [];
try {
  if (fs.existsSync(jsonPath)) {
    jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log('JSON rows: ' + jsonData.length);
  }
} catch(e) { console.log('Error:', e.message); }

if (jsonData.length > 0) {
  const cols = ["id","reporterRole","victimName","bullyType","description",
    "involved","location","incidentTime","contact","anonymous","images",
    "time","status","handledBy","handledAt","handleNote","userId"];
  const ph = cols.map(() => '?').join(',');
  const ins = db.prepare('INSERT INTO "bullying" (' + cols.map(c => '"' + c + '"').join(',') + ') VALUES (' + ph + ')');
  let ok = 0, fail = 0;
  const tx = db.transaction(() => {
    for (const row of jsonData) {
      const vals = cols.map(c => {
        const v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      });
      try { ins.run(vals); ok++; } catch(e) { fail++; }
    }
  });
  tx();
  console.log('Inserted: ' + ok + ', failed: ' + fail);
} else {
  console.log('No data to insert');
}

const cnt = db.prepare('SELECT COUNT(*) as c FROM bullying').get();
console.log('Total in DB: ' + cnt.c);
db.close();
'''

with c.open_sftp() as sftp:
    with sftp.open('/www/wwwroot/campus-wall/fix_bully.js', 'w') as f:
        f.write(fix_code)

NODE = '/www/server/nodejs/v22.22.3/bin/node'
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' fix_bully.js 2>&1', timeout=15)
print(so.read().decode('utf-8', errors='replace'))

# Verify
print('\n=== Verify ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM bullying;'", timeout=10)
print('Count:', so.read().decode('utf-8', errors='replace').strip())

si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"SELECT id, substr(description,1,30) FROM bullying LIMIT 2;\"", timeout=10)
print('Data:', so.read().decode('utf-8', errors='replace')[:200])

# Clean up
c.exec_command('rm /www/wwwroot/campus-wall/fix_bully.js')

# Test API
print('\n=== Test API ===')
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/admin/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1Ench\",\"password\":\"cai091226\"}'", timeout=10)
import json as j
token = j.loads(so.read().decode('utf-8', errors='replace')).get('data', {}).get('token', '')
if token:
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/admin/bullying -H 'x-admin-token: " + token + "' 2>&1 | head -c 300", timeout=10)
    print('Bullying API:', so.read().decode('utf-8', errors='replace')[:300])

c.close()
