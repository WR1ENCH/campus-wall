import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Comprehensive fix script that rebuilds all broken tables from JSON
fix_code = r'''
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const db = new Database(path.join(__dirname, 'data', 'campus.db'));
db.pragma('journal_mode = WAL');

// Tables that need fixing (their JSON file has data but DB table has only _id)
const tables = [
  { name: 'feedbacks', file: 'feedbacks.json' },
  { name: 'pickup_reports', file: 'pickup_reports.json' },
  { name: 'qrcodes', file: 'qrcodes.json' },
  { name: 'sensitive_custom', file: 'sensitive_custom.json' },
];

function readJSON(file) {
  const p = path.join(__dirname, 'data', file);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) { return null; }
}

function toArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const arr = [];
  for (const k of Object.keys(data)) {
    if (typeof data[k] === 'object' && data[k] !== null) {
      arr.push({_key: k, ...data[k]});
    } else {
      arr.push({_key: k, _value: data[k]});
    }
  }
  return arr;
}

for (const t of tables) {
  const raw = readJSON(t.file);
  const rows = toArray(raw);
  if (!rows || rows.length === 0) {
    console.log(t.name + ': no data, skipping');
    continue;
  }
  
  // Drop old table
  db.exec('DROP TABLE IF EXISTS "' + t.name + '"');
  
  // Infer columns from data
  const colSet = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) colSet.add(k);
  }
  const columns = Array.from(colSet);
  
  // Create table
  const colDefs = columns.map(c => '"' + c + '" TEXT');
  db.exec('CREATE TABLE "' + t.name + '" (' + colDefs.join(', ') + ')');
  
  // Insert data
  const ph = columns.map(() => '?').join(', ');
  const ins = db.prepare('INSERT INTO "' + t.name + '" (' + columns.map(c => '"' + c + '"').join(', ') + ') VALUES (' + ph + ')');
  let ok = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const vals = columns.map(c => {
        const v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
      });
      try { ins.run(vals); ok++; } catch(e) {}
    }
  });
  tx();
  console.log(t.name + ': ' + ok + '/' + rows.length + ' rows');
}

db.close();
console.log('Done');
'''

with c.open_sftp() as sftp:
    with sftp.open('/www/wwwroot/campus-wall/fix_all_tables.js', 'w') as f:
        f.write(fix_code)

si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' fix_all_tables.js 2>&1', timeout=15)
print(so.read().decode('utf-8', errors='replace'))

# Verify
print('\n=== Verify ===')
for t in ['feedbacks', 'pickup_reports', 'qrcodes', 'sensitive_custom', 'reports', 'bullying']:
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'SELECT COUNT(*) FROM " + t + ";'", timeout=5)
    cnt = so.read().decode('utf-8', errors='replace').strip()
    si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 campus.db 'PRAGMA table_info(" + t + ");' | wc -l", timeout=5)
    cols = so.read().decode('utf-8', errors='replace').strip()
    print(f'{t}: {cnt} rows, {cols} cols')

# Clean up
c.exec_command('rm /www/wwwroot/campus-wall/fix_all_tables.js')

c.close()
