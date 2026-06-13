import paramiko, io, sys, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(host, username=user, password=passwd, timeout=15)

NODE_BIN = '/www/server/nodejs/v22.22.3/bin'
PATH_PREFIX = 'export PATH=' + NODE_BIN + ':$PATH &&'

# Step 1: 安装 better-sqlite3
print('📦 安装 better-sqlite3...')
stdin, stdout, stderr = client.exec_command(
    'cd /www/wwwroot/campus-wall && ' + PATH_PREFIX + ' npm install better-sqlite3 2>&1 | tail -5'
)
out = stdout.read().decode('utf-8', errors='replace')
print(out)

# Step 2: 上传动态迁移脚本
print('\n📝 创建动态数据迁移脚本...')

migrate_script = r'''
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(__dirname, 'data', 'campus.db');

// 如果已有数据库则删除重建
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 读取 JSON 文件
function readJSON(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch(e) {
    console.warn('  ⚠️ ' + file + ': ' + e.message);
    return null;
  }
}

// 将对象统一转为数组
function toArray(data) {
  if (data === null || data === undefined) return [];
  if (Array.isArray(data)) return data;
  // 对象：trust_tokens 等是 { key: {obj} } 结构
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

// 推断所有字段的 SQL 类型
function inferTypes(rows) {
  const types = {};
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      const v = row[k];
      if (v === null || v === undefined) continue;
      if (typeof v === 'number') {
        if (Number.isInteger(v)) types[k] = 'INTEGER';
        else types[k] = 'REAL';
      } else if (typeof v === 'boolean') {
        types[k] = 'INTEGER';
      } else {
        // string / object / array → TEXT (JSON stringified)
        types[k] = 'TEXT';
      }
    }
  }
  return types;
}

// 将值转为适合 SQLite 存储
function toSqlValue(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

// ===== 主流程 =====
const fileTableMap = {
  'users.json': 'users',
  'admins.json': 'admins',
  'posts.json': 'posts',
  'discussions.json': 'discussions',
  'discussion_comments.json': 'discussion_comments',
  'qa_questions.json': 'qa_questions',
  'qa_answers.json': 'qa_answers',
  'notices.json': 'notices',
  'credit_cards.json': 'credit_cards',
  'credit_logs.json': 'credit_logs',
  'login_logs.json': 'login_logs',
  'reports.json': 'reports',
  'feedbacks.json': 'feedbacks',
  'trust_tokens.json': 'trust_tokens',
  'pickup_auctions.json': 'pickup_auctions',
  'pickup_reports.json': 'pickup_reports',
  'bullying.json': 'bullying',
  'sensitive_custom.json': 'sensitive_custom',
  'student_council.json': 'student_council',
  'announcement.json': 'announcement',
  'notice_applications.json': 'notice_applications',
  'notice_passkey.json': 'notice_passkey',
  'qrcodes.json': 'qrcodes',
};

let totalRows = 0;
const tableNames = Object.keys(fileTableMap);

for (const file of tableNames) {
  const table = fileTableMap[file];
  const raw = readJSON(file);
  const rows = toArray(raw);

  if (!raw || rows.length === 0) {
    console.log('  ' + table + ': 0 rows (no data / empty)');
    // 创建空表
    db.exec('CREATE TABLE IF NOT EXISTS "' + table + '" (_id INTEGER PRIMARY KEY AUTOINCREMENT)');
    continue;
  }

  // 推断字段
  const types = inferTypes(rows);
  const columns = Object.keys(types);

  // 动态建表
  const colDefs = columns.map(c => '"' + c + '" ' + (types[c] || 'TEXT'));
  const createSQL = 'CREATE TABLE IF NOT EXISTS "' + table + '" (' + colDefs.join(', ') + ')';
  try {
    db.exec(createSQL);
  } catch(e) {
    console.error('  ❌ ' + table + ' CREATE failed: ' + e.message);
    continue;
  }

  // 插入数据
  const placeholders = columns.map(() => '?').join(', ');
  const insertSQL = 'INSERT INTO "' + table + '" (' + columns.map(c => '"' + c + '"').join(', ') + ') VALUES (' + placeholders + ')';
  const insertStmt = db.prepare(insertSQL);

  const insertMany = db.transaction((dataRows) => {
    for (const row of dataRows) {
      const vals = columns.map(c => toSqlValue(row[c]));
      try {
        insertStmt.run(vals);
      } catch(e) {
        console.warn('    ⚠️ 跳过一行: ' + e.message.slice(0, 80));
      }
    }
  });

  try {
    insertMany(rows);
    console.log('  ' + table + ': ' + rows.length + ' rows');
    totalRows += rows.length;
  } catch(e) {
    console.error('  ❌ ' + table + ' insert failed: ' + e.message);
  }
}

// 验证
console.log('\nVerifying...');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
let verifiedTotal = 0;
for (const t of tables) {
  const cnt = db.prepare('SELECT COUNT(*) as c FROM "' + t.name + '"').get();
  verifiedTotal += cnt.c;
  console.log('  ' + t.name + ': ' + cnt.c + ' rows');
}
console.log('\nTotal: ' + verifiedTotal + ' rows across ' + tables.length + ' tables');
console.log('DB size: ' + (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1) + ' MB');
console.log('\n✅ Migration complete!');
db.close();
'''

with client.open_sftp() as sftp:
  with sftp.open('/www/wwwroot/campus-wall/migrate.js', 'w') as f:
    f.write(migrate_script)

# Step 3: 执行迁移
print('🚀 Running migration...')
stdin, stdout, stderr = client.exec_command(
    'cd /www/wwwroot/campus-wall && ' + PATH_PREFIX + ' node migrate.js 2>&1'
)

# 实时读取输出
while True:
    if stdout.channel.recv_ready():
        data = stdout.channel.recv(4096).decode('utf-8', errors='replace')
        print(data, end='')
    if stdout.channel.exit_status_ready():
        break
    time.sleep(0.1)

exit_code = stdout.channel.recv_exit_status()
if exit_code == 0:
    print('\n✅ Migration completed successfully!')
else:
    err = stderr.read().decode('utf-8', errors='replace')
    print(f'\n❌ Migration failed (exit code {exit_code}): {err[:500]}')

client.close()
