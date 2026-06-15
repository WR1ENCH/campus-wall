import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

# Fix the dropAndInsert function in db.js on the server
fix_code = '''
// 在 getDb 函数后替换 dropAndInsert
// 关键修复: 将 boolean → 0/1, 避免 better-sqlite3 拒绝 boolean 类型
'''

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Use node to do the surgery
NODE = '/www/server/nodejs/v22.22.3/bin/node'

# Read current db.js
stdin, stdout, stderr = c.exec_command('cat /www/wwwroot/campus-wall/db.js')
current = stdout.read().decode('utf-8', errors='replace')

# Replace the dropAndInsert function
import re

# Old version (buggy)
old_func = '''function dropAndInsert(table, rows) {
  const d = getDb();
  d.exec(`DELETE FROM "${table}"`);
  if (!rows || rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const ph = cols.map(() => '?').join(',');
  const ins = d.prepare(`INSERT INTO "${table}" (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${ph})`);
  const tx = d.transaction((data) => {
    for (const row of data) {
      const vals = cols.map(c => {
        const v = row[c];
        return v !== null && v !== undefined && typeof v === 'object' ? JSON.stringify(v) : v;
      });
      try { ins.run(vals); } catch {}
    }
  });
  tx(rows);
}'''

# New version (fixed)
new_func = '''function toSqlValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function dropAndInsert(table, rows) {
  const d = getDb();
  const tx = d.transaction(() => {
    d.exec(`DELETE FROM "${table}"`);
    if (!rows || rows.length === 0) return;
    const cols = Object.keys(rows[0]);
    const ph = cols.map(() => '?').join(',');
    const ins = d.prepare(`INSERT INTO "${table}" (${cols.map(c => '"' + c + '"').join(',')}) VALUES (${ph})`);
    for (const row of rows) {
      const vals = cols.map(c => toSqlValue(row[c]));
      try { ins.run(vals); } catch (e) { console.error('[db.js] INSERT failed:', e.message); }
    }
  });
  tx();
}'''

if current.find('function dropAndInsert') >= 0:
    current_updated = current.replace(old_func, new_func)
    
    # Write updated file back
    with c.open_sftp() as sftp:
        with sftp.open('/www/wwwroot/campus-wall/db.js', 'w') as f:
            f.write(current_updated)
    
    print('db.js updated with fix')
    
    # Syntax check
    stdin, stdout, stderr = c.exec_command('cd /www/wwwroot/campus-wall && ' + NODE + ' -c db.js 2>&1')
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    print('Syntax:', out or 'OK')
    if err: print('ERR:', err[:300])
else:
    print('ERROR: dropAndInsert not found in db.js')

c.close()
