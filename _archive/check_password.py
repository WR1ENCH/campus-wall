import paramiko, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

host = '154.37.221.232'
user = 'root'
passwd = 'GAsYrIBjX8vWMCw6'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(host, username=user, password=passwd, timeout=15)

# Check the wr1ench user's stored password hash
print('=== wr1ench user password hash ===')
si, so, se = c.exec_command("cd /www/wwwroot/campus-wall/data && sqlite3 -json campus.db \"SELECT id, username, nickname, password FROM users WHERE nickname='wr1ench' OR username='wr1ench';\"", timeout=10)
print(so.read().decode('utf-8', errors='replace')[:300])

# Test verifyPassword directly with node
print('\n=== Direct password verification ===')
si, so, se = c.exec_command('cd /www/wwwroot/campus-wall && /www/server/nodejs/v22.22.3/bin/node -e "
const crypto = require(\"crypto\");
const db = require(\"./db\");
const user = db.readUsers().find(u => u.nickname === \"wr1ench\");
if (!user) { console.log(\"User not found\"); process.exit(1); }
console.log(\"Stored hash:\", user.password);
// Try to verify
function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(\":\")) return false;
  const [salt, hash] = storedHash.split(\":\");
  const inputHash = crypto.pbkdf2Sync(password, salt, 100000, 64, \"sha512\").toString(\"hex\");
  return crypto.timingSafeEqual(Buffer.from(hash, \"hex\"), Buffer.from(inputHash, \"hex\"));
}
console.log(\"Verify cai091226:\", verifyPassword(\"cai091226\", user.password));
console.log(\"Verify admin:\", verifyPassword(\"admin\", user.password));
console.log(\"Verify 123456:\", verifyPassword(\"123456\", user.password));
"', timeout=10)
print(so.read().decode('utf-8', errors='replace')[:300])

c.close()
