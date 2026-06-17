const acorn = require('acorn');
const fs = require('fs');
const js = fs.readFileSync('_extracted.js', 'utf8');
const lines = js.split('\n');

let lo = 0, hi = lines.length - 1;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  try {
    acorn.parse(lines.slice(0, mid + 1).join('\n'), { ecmaVersion: 2020, sourceType: 'script' });
    lo = mid + 1;
  } catch (e) {
    hi = mid;
  }
}

console.log('First error near line', lo);
for (let i = Math.max(0, lo - 5); i < Math.min(lines.length, lo + 5); i++) {
  console.log((i + 1) + ': ' + lines[i]);
}
