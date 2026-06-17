// 从 server.js 中提取的纯 JS SHA256（与客户端一致）
function sha256Pure(msg) {
  function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
  function ch(x, y, z) { return (x & y) ^ (~x & z); }
  function maj(x, y, z) { return (x & y) ^ (x & z) ^ (y & z); }
  function ep0(x) { return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x); }
  function ep1(x) { return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x); }
  function sig0(x) { return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3); }
  function sig1(x) { return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10); }
  function bytesToWords(bytes) {
    var words = [], i = 0;
    while (i < bytes.length) {
      words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
      i++;
    }
    return words;
  }
  function wordsToBytes(words) {
    var bytes = [], i = 0;
    while (i < words.length * 4) {
      bytes.push((words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
      i++;
    }
    return bytes;
  }
  function strToBytes(str) {
    var bytes = [], i = 0;
    while (i < str.length) {
      var c = str.charCodeAt(i++);
      if (c < 0x80) { bytes.push(c); }
      else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
      else if (c < 0xd800 || c >= 0xe000) { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
      else { c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i++) & 0x3ff)); bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
    }
    return bytes;
  }
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var bytes = strToBytes(msg);
  var ml = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) { bytes.push(0); }
  for (var i = 56; i >= 0; i -= 8) { bytes.push((ml >>> (i * 8)) & 0xff); }
  var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var w = [], a, b, c, d, e, f, g, h, i, j, t1, t2;
  for (i = 0; i < bytes.length; i += 64) {
    for (j = 0; j < 16; j++) { w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3]; }
    for (j = 16; j < 64; j++) { w[j] = (sig1(w[j - 2]) + w[j - 7] + sig0(w[j - 15]) + w[j - 16]) | 0; }
    a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
    for (j = 0; j < 64; j++) {
      t1 = (h + ep1(e) + ch(e, f, g) + K[j] + w[j]) | 0;
      t2 = (ep0(a) + maj(a, b, c)) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return new Uint8Array(wordsToBytes(H));
}

const crypto = require('crypto');

function hex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 测试多个不同的输入
const testCases = [
  "abcdef1234567890abcdef1234567890" + "0",
  "abcdef1234567890abcdef1234567890" + "4096",
  "abcdef1234567890abcdef1234567890" + "890794",
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" + "12345",
  "00001111222233334444555566667777" + "999999999",
];

for (const input of testCases) {
  const pure = sha256Pure(input);
  const node = crypto.createHash('sha256').update(input).digest();
  
  const pureHex = hex(pure);
  const nodeHex = hex(node);
  
  console.log('Input:', input.substring(0, 40) + '...');
  console.log('  Pure JS:  ' + pureHex);
  console.log('  Node.js:  ' + nodeHex);
  console.log('  Match:    ' + (pureHex === nodeHex ? '✓' : '✗ 不匹配!'));
  console.log();
}
