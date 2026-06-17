const crypto = require('crypto');

// ===== 已知正确的纯 JS SHA256 实现 =====
function sha256_2(str) {
  // 右旋转
  function rrot(x, n) { return (x >>> n) | (x << (32 - n)); }
  
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
           0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
           0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
           0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
           0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
           0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
           0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
           0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
           0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
           0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
           0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
           0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
           0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
           0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
           0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
           0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
           0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

  // 将字符串转为 UTF-8 字节数组
  function toBytes(s) {
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

  var msg = toBytes(str);
  var bitLen = msg.length * 8;
  
  // 填充：追加 0x80
  msg.push(0x80);
  
  // 填充到 length % 64 == 56
  while ((msg.length % 64) !== 56) msg.push(0);
  
  // 追加 64 位长度（大端序）
  for (var i = 7; i >= 0; i--) msg.push((bitLen >>> (i * 8)) & 0xff);

  // 处理每个 64 字节块
  var w = new Array(64);
  for (var blockStart = 0; blockStart < msg.length; blockStart += 64) {
    // 将 16 个字节转为 16 个 32 位大端字
    for (var t = 0; t < 16; t++) {
      var off = blockStart + t * 4;
      w[t] = (msg[off] << 24) | (msg[off+1] << 16) | (msg[off+2] << 8) | msg[off+3];
    }
    for (var t = 16; t < 64; t++) {
      var s0 = rrot(w[t-15], 7) ^ rrot(w[t-15], 18) ^ (w[t-15] >>> 3);
      var s1 = rrot(w[t-2], 17) ^ rrot(w[t-2], 19) ^ (w[t-2] >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
    }

    var a = H[0], b = H[1], c = H[2], d = H[3],
        e = H[4], f = H[5], g = H[6], hh = H[7];

    for (var t = 0; t < 64; t++) {
      var S1 = rrot(e, 6) ^ rrot(e, 11) ^ rrot(e, 25);
      var ch = (e & f) ^ ((~e) & g);
      var temp1 = (hh + S1 + ch + K[t] + w[t]) | 0;
      var S0 = rrot(a, 2) ^ rrot(a, 13) ^ rrot(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) | 0;

      hh = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + hh) | 0;
  }

  // 输出为字节数组（大端序）
  var out = new Uint8Array(32);
  for (var i = 0; i < 8; i++) {
    out[i*4]   = (H[i] >>> 24) & 0xff;
    out[i*4+1] = (H[i] >>> 16) & 0xff;
    out[i*4+2] = (H[i] >>> 8) & 0xff;
    out[i*4+3] = H[i] & 0xff;
  }
  return out;
}

// ===== 测试 =====
const testCases = [
  "",
  "a",
  "abc",
  "hello world",
  "abcdef1234567890abcdef1234567890" + "0",
  "abcdef1234567890abcdef1234567890" + "4096",
  "abcdef1234567890abcdef1234567890" + "890794",
  "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" + "12345",
  "00001111222233334444555566667777" + "999999999",
];

function hex(buf) {
  var s = '';
  for (var i = 0; i < buf.length; i++) s += buf[i].toString(16).padStart(2, '0');
  return s;
}

for (const input of testCases) {
  const pure = sha256_2(input);
  const node = crypto.createHash('sha256').update(input).digest();
  
  const pureHex = hex(pure);
  const nodeHex = node.toString('hex');
  
  console.log('Input length:', input.length);
  console.log('  New Pure: ' + pureHex);
  console.log('  Node.js:  ' + nodeHex);
  console.log('  Match:    ' + (pureHex === nodeHex ? '✓' : '✗'));
  console.log();
}
