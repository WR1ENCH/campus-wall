const crypto = require('crypto');
const db = require('/www/wwwroot/campus-wall/db');
const user = db.readUsers().find(u => u.nickname === 'wr1ench');
if (!user) { console.log('User not found'); process.exit(1); }
console.log('Hash:', user.password);
function v(p, s) {
  if (!s || !s.includes(':')) return false;
  const [salt, hash] = s.split(':');
  const ih = crypto.pbkdf2Sync(p, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(ih, 'hex'));
}
console.log('cai091226:', v('cai091226', user.password));
console.log('wr1ench:', v('wr1ench', user.password));
console.log('admin:', v('admin', user.password));
console.log('admin_std:', v('admin_std', user.password));
console.log('123456:', v('123456', user.password));
