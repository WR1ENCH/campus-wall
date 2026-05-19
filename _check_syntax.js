// 提取admin.html中的JS并检查语法
const fs = require('fs');
const { execSync } = require('child_process');

const html = fs.readFileSync('admin.html', 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);

if (!match) {
  console.log('ERROR: No script tag found');
  process.exit(1);
}

const js = match[1];
fs.writeFileSync('_extracted.js', js);

try {
  // 使用Node.js解析JS语法
  new Function(js);
  console.log('✅ JS syntax is valid');
  console.log('JS length:', js.length, 'chars');
} catch (e) {
  console.log('❌ JS Syntax Error:', e.message);
  
  // 尝试找到错误位置
  const lineMatch = e.message.match(/(\d+)/);
  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1]);
    const lines = js.split('\n');
    console.log('\nContext around error:');
    for (let i = Math.max(0, lineNum - 3); i < Math.min(lines.length, lineNum + 2); i++) {
      console.log((i + 1) + ': ' + lines[i]);
    }
  }
}
