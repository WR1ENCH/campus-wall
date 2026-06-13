import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Fix the bullying table - drop and recreate with proper columns, migrate data from JSON
fix_code = '''
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const DATA_DIR = "/www/wwwroot/campus-wall/data";
const DB_PATH = path.join(DATA_DIR, "campus.db");
const JSON_PATH = path.join(DATA_DIR, "bullying.json");

// Read existing data from JSON
let jsonData = [];
try {
  if (fs.existsSync(JSON_PATH)) {
    jsonData = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
    console.log("JSON data: " + jsonData.length + " rows");
  } else {
    console.log("No JSON file found");
  }
} catch(e) {
  console.log("JSON read error: " + e.message);
}

// Connect to DB
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Drop old table
db.exec('DROP TABLE IF EXISTS "bullying"');
console.log("Dropped old bullying table");

// Read current data from db module (in case some data was stored)
// But table is empty, so just create new one

// Create proper table
const createSQL = `CREATE TABLE IF NOT EXISTS "bullying" (
  "id" TEXT, "reporterRole" TEXT, "victimName" TEXT,
  "bullyType" TEXT, "description" TEXT, "involved" TEXT,
  "location" TEXT, "incidentTime" TEXT, "contact" TEXT,
  "anonymous" INTEGER, "images" TEXT, "time" TEXT,
  "status" TEXT, "handledBy" TEXT, "handledAt" TEXT,
  "handleNote" TEXT, "userId" TEXT
)`;
db.exec(createSQL);
console.log("Created new bullying table");

// Insert data from JSON
if (jsonData.length > 0) {
  const cols = ["id","reporterRole","victimName","bullyType","description",
    "involved","location","incidentTime","contact","anonymous","images",
    "time","status","handledBy","handledAt","handleNote","userId"];
  const ph = cols.map(() => "?").join(",");
  const ins = db.prepare("INSERT INTO bullying (" + cols.map(c => '"' + c + '"').join(",") + ") VALUES (" + ph + ")");
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const row of jsonData) {
      const vals = cols.map(c => {
        const v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === "boolean") return v ? 1 : 0;
        if (typeof v === "object") return JSON.stringify(v);
        return v;
      });
      try { ins.run(vals); inserted++; } catch(e) { console.log("  skip: " + e.message); }
    }
  });
  tx();
  console.log("Inserted: " + inserted + " rows");
}

// Verify
const count = db.prepare("SELECT COUNT(*) as c FROM bullying").get();
console.log("Total in DB: " + count.c);
db.close();
'''

with c.open_sftp() as sftp:
    with sftp.open('/tmp/fix_bullying_table.js', 'w') as f:
        f.write(fix_code)

si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' /tmp/fix_bullying_table.js 2>&1', timeout=15)
out = so.read().decode('utf-8', errors='replace')
err = se.read().decode('utf-8', errors='replace')
print(out)
if err: print('ERR:', err[:300])

# Verify
print('\n=== Verify ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM bullying;'", timeout=10)
print('Bullying count:', so.read().decode('utf-8', errors='replace').strip())

si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db \"SELECT id, description FROM bullying LIMIT 2;\"", timeout=10)
print('Sample data:', so.read().decode('utf-8', errors='replace')[:200])

# Restart
print('\nRestarting...')
si, so, se = c.exec_command('bash /tmp/restart2.sh 2>&1', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:100])

import time
time.sleep(2)

# Verify API
si, so, se = c.exec_command('curl -s http://localhost:3000/api/admin/check-init 2>&1')
print('Admin:', so.read().decode('utf-8', errors='replace')[:60])

# Test bullying list API (need admin token)
si, so, se = c.exec_command("curl -s -X POST http://localhost:3000/api/admin/login -H 'Content-Type: application/json' -d '{\"id\":\"wr1Ench\",\"password\":\"cai091226\"}'", timeout=10)
login = so.read().decode('utf-8', errors='replace')
import json as j
token = j.loads(login).get('data', {}).get('token', '')

if token:
    si, so, se = c.exec_command("curl -s http://localhost:3000/api/admin/bullying -H 'x-admin-token: " + token + "' 2>&1 | head -c 300", timeout=10)
    out = so.read().decode('utf-8', errors='replace')
    print('Bullying API:', out[:250])

c.close()
