const fs = require('fs');
let c = fs.readFileSync('C:\\Users\\wyxgg\\Desktop\\test\\server.js', 'utf8');

// Find all notice push objects that have level: 'T0' or level: 'T1' and author: '系统'
// Insert auto: true after the createdAt line

// Pattern: we insert `auto: true,` after `createdAt: new Date().toISOString()`
// but only for system notices (where `author: '系统'` is nearby)

let count = 0;

// Find each system notice by looking for "author: '系统'" then finding the surrounding push
let searchFrom = 0;
while (true) {
  const authIdx = c.indexOf("author: '系统'", searchFrom);
  if (authIdx === -1) break;
  
  // Find the containing notices.push({ block
  const pushStart = c.lastIndexOf('notices.push({', authIdx);
  if (pushStart === -1) { searchFrom = authIdx + 1; continue; }
  
  // Find the closing }); of this push
  const closeBrace = c.indexOf('});', authIdx);
  if (closeBrace === -1) { searchFrom = authIdx + 1; continue; }
  
  // Check if this is in a push block and if auto is already present
  const block = c.slice(pushStart, closeBrace + 3);
  if (block.includes('auto: true')) {
    searchFrom = closeBrace + 3;
    continue;
  }
  
  // Find createdAt: line and insert auto: true after it
  const createdIdx = c.indexOf('createdAt: new Date().toISOString()', pushStart);
  if (createdIdx === -1 || createdIdx > closeBrace) {
    searchFrom = authIdx + 1;
    continue;
  }
  
  const afterCreated = createdIdx + 'createdAt: new Date().toISOString()'.length;
  // Check if auto already exists
  if (c.slice(afterCreated, afterCreated + 20).includes('auto')) {
    searchFrom = closeBrace + 3;
    continue;
  }
  
  // Insert auto: true right after createdAt
  c = c.slice(0, afterCreated) + ',\n      auto: true' + c.slice(afterCreated);
  count++;
  searchFrom = afterCreated + 20;
}

console.log('Added auto: true to ' + count + ' system notices');

// Add filter to GET /api/notices
const oldFilter = "notices.filter(n => !n.deleted)";
const newFilter = "notices.filter(n => !n.deleted && n.auto !== true)";
if (c.includes(newFilter)) {
  console.log('Filter already present');
} else if (c.includes(oldFilter)) {
  c = c.replace(oldFilter, newFilter);
  console.log('Updated filter');
} else {
  console.log('Filter NOT found!');
}

fs.writeFileSync('C:\\Users\\wyxgg\\Desktop\\test\\server.js', c, 'utf8');
console.log('Done');
