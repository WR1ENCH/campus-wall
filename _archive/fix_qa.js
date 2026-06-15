const fs = require('fs');

let content = fs.readFileSync('/www/wwwroot/campus-wall/server.js', 'utf8');

const missing = [
  "function readQAAnswers() { return db.readQAAnswers(); }",
  "function writeQAQuestions(data) { db.writeQAQuestions(data); }",
  "function writeQAAnswers(data) { db.writeQAAnswers(data); }"
];

const marker = "function readQAQuestions() { return db.readQAQuestions(); }";
if (content.includes(marker)) {
  const add = missing.filter(fn => !content.includes(fn.split('(')[0]));
  if (add.length > 0) {
    content = content.replace(marker, marker + '\n' + add.join('\n'));
    fs.writeFileSync('/www/wwwroot/campus-wall/server.js', content, 'utf8');
    console.log('Added: ' + add.join(', '));
  } else {
    console.log('All QA functions already exist');
  }
} else {
  console.log('ERROR: readQAQuestions marker not found!');
}
