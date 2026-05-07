// 敏感词库加密/解密工具
// 使用 AES-256-GCM 加密词库文件，防止明文词库暴露在 Git 仓库中
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;   // GCM 推荐的 IV 长度
const TAG_LENGTH = 16;  // GCM 认证标签长度

/**
 * 加密词库文件 → 生成 .enc 加密文件
 * @param {string} plainPath  明文词库文件路径
 * @param {string} encPath    输出的加密文件路径
 * @param {string} key        32字节 hex 密钥（可通过环境变量 SENSITIVE_KEY 传入）
 */
function encryptFile(plainPath, encPath, key) {
  const plaintext = fs.readFileSync(plainPath, 'utf-8');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 文件格式: [16字节IV] + [加密数据] + [16字节认证标签]
  const output = Buffer.concat([iv, encrypted, tag]);
  fs.writeFileSync(encPath, output);
  console.log(`[crypto] 已加密: ${plainPath} → ${encPath}`);
}

/**
 * 解密 .enc 加密词库文件 → 返回明文文本
 * @param {string} encPath  加密文件路径
 * @param {string} key      32字节 hex 密钥
 * @returns {string} 解密后的明文内容
 */
function decryptFile(encPath, key) {
  try {
    const data = fs.readFileSync(encPath);
    const iv = data.subarray(0, IV_LENGTH);
    const tag = data.subarray(data.length - TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH, data.length - TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key, 'hex'), iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf-8');
  } catch (e) {
    throw new Error(`解密词库失败: ${e.message}`);
  }
}

// ===== 命令行入口 =====
// node crypto_words.js encrypt <明文文件> [输出文件]
// node crypto_words.js decrypt <加密文件> [输出文件]
if (require.main === module) {
  const cmd = process.argv[2];
  const input = process.argv[3];
  const output = process.argv[4];
  const key = process.env.SENSITIVE_KEY;

  if (!key || key.length !== 64) {
    console.error('错误: 请设置环境变量 SENSITIVE_KEY（64位 hex，即32字节）');
    console.error('  powershell: $env:SENSITIVE_KEY="<your 64-char hex key>"');
    console.error('  生成密钥: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }

  if (cmd === 'encrypt' && input) {
    const outPath = output || input.replace(/\.\w+$/, '') + '.enc';
    encryptFile(input, outPath, key);
  } else if (cmd === 'decrypt' && input) {
    const outPath = output || input.replace(/\.enc$/, '') + '_decrypted.txt';
    const text = decryptFile(input, key);
    fs.writeFileSync(outPath, text, 'utf-8');
    console.log(`[crypto] 已解密: ${input} → ${outPath}`);
  } else {
    console.log('用法:');
    console.log('  node crypto_words.js encrypt <明文文件> [输出文件]');
    console.log('  node crypto_words.js decrypt <加密文件> [输出文件]');
    console.log('示例:');
    console.log('  $env:SENSITIVE_KEY="<密钥>"');
    console.log('  node crypto_words.js encrypt tencent_sensitive_words.txt');
  }
}

module.exports = { encryptFile, decryptFile };
