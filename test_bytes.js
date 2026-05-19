const crypto = require('crypto');

function toBytesOld(s) {
  var bytes = [], i = 0;
  while (i < s.length) {
    var c = s.charCodeAt(i++);
    if (c < 0x80) { bytes.push(c); }
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
    else if (c < 0xd800 || c >= 0xe000) { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    else { c = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i++) & 0x3ff)); bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
  }
  return bytes;
}

function toBytesNew(s) {
  var bytes = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) { bytes.push(c); }
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
    else if (c < 0xd800 || c >= 0xe000) { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    else {
      c = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(++i) & 0x3ff));
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return bytes;
}

// Test UTF-8 encoding
const tests = ["", "a", "abc", "hello", "abcdef1234567890abcdef12345678900"];
for (const t of tests) {
  const bufNode = Buffer.from(t, 'utf-8');
  const oldBytes = toBytesOld(t);
  const newBytes = toBytesNew(t);
  
  console.log('String:', JSON.stringify(t));
  console.log('  Node  len:', bufNode.length);
  console.log('  Old   len:', oldBytes.length, 'match:', JSON.stringify(oldBytes) === JSON.stringify([...bufNode]));
  console.log('  New   len:', newBytes.length, 'match:', JSON.stringify(newBytes) === JSON.stringify([...bufNode]));
  if (JSON.stringify(oldBytes) !== JSON.stringify([...bufNode])) {
    console.log('  Old bytes:', oldBytes);
    console.log('  Node bytes:', [...bufNode]);
  }
  console.log();
}

// Now let me check padding for "a"
console.log('=== Padding verification for "a" ===');
var msg = toBytesOld("a");
var bitLen = msg.length * 8;
msg.push(0x80);
while ((msg.length % 64) !== 56) msg.push(0);
for (var i = 7; i >= 0; i--) msg.push((bitLen >>> (i * 8)) & 0xff);

// First 16 bytes
console.log('Total bytes after padding:', msg.length);
console.log('First 8 bytes:', msg.slice(0, 8));
console.log('Last 8 bytes:', msg.slice(-8));

// Pad "a" the Node.js way
var buf = Buffer.from("a", 'utf-8');
var bitLen2 = buf.length * 8;
var padded = Buffer.alloc(64, 0);
buf.copy(padded);
padded[buf.length] = 0x80;
padded[62] = (bitLen2 >>> 8) & 0xff;
padded[63] = bitLen2 & 0xff;
console.log('Node-style first 8 bytes:', [...padded.slice(0, 8)]);
console.log('Node-style last 8 bytes:', [...padded.slice(-8)]);

// Compare
console.log('Bytes match:', JSON.stringify(msg) === JSON.stringify([...padded]));
