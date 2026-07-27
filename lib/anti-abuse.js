const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ABUSE_FILE = path.join(DATA_DIR, 'task-center-abuse.json');

function readAbuse() {
  try {
    if (fs.existsSync(ABUSE_FILE)) {
      return JSON.parse(fs.readFileSync(ABUSE_FILE, 'utf-8'));
    }
  } catch(e) {}
  return { dailyTaskClaims: {}, wheelSpins: {} };
}

function writeAbuse(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ABUSE_FILE, JSON.stringify(data, null, 2));
}

function getBeijingDate(d) {
  d = d || new Date();
  var utc = d.getTime() + d.getTimezoneOffset() * 60000;
  var bd = new Date(utc + 8 * 3600000);
  return bd.getFullYear() + '-' +
    String(bd.getMonth() + 1).padStart(2, '0') + '-' +
    String(bd.getDate()).padStart(2, '0');
}

function canClaimDailyTask(userId, taskId) {
  var data = readAbuse();
  var today = getBeijingDate();
  var key = userId + ':' + today;
  if (!data.dailyTaskClaims[key]) data.dailyTaskClaims[key] = {};
  var claims = data.dailyTaskClaims[key];
  var count = Object.keys(claims).length;
  if (claims[taskId]) return { allowed: false, reason: '已领取过' };
  if (count >= 10) return { allowed: false, reason: '今日领取次数已达上限' };
  return { allowed: true };
}

function recordDailyTaskClaim(userId, taskId) {
  var data = readAbuse();
  var today = getBeijingDate();
  var key = userId + ':' + today;
  if (!data.dailyTaskClaims[key]) data.dailyTaskClaims[key] = {};
  data.dailyTaskClaims[key][taskId] = Date.now();
  writeAbuse(data);
}

function canSpinWheel(userId) {
  var data = readAbuse();
  var today = getBeijingDate();
  var key = userId + ':' + today;
  var spins = data.wheelSpins[key] || 0;
  if (spins >= 5) return { allowed: false, reason: '今日转盘次数已达上限' };
  return { allowed: true };
}

function recordWheelSpin(userId) {
  var data = readAbuse();
  var today = getBeijingDate();
  var key = userId + ':' + today;
  data.wheelSpins[key] = (data.wheelSpins[key] || 0) + 1;
  writeAbuse(data);
}

function cleanup() {
  var data = readAbuse();
  var cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  Object.keys(data.dailyTaskClaims).forEach(function(key) {
    var claims = data.dailyTaskClaims[key];
    var allOld = Object.values(claims).every(function(ts) { return ts < cutoff; });
    if (allOld) delete data.dailyTaskClaims[key];
  });
  Object.keys(data.wheelSpins).forEach(function(key) {
    if (new Date(key).getTime() < cutoff) delete data.wheelSpins[key];
  });
  writeAbuse(data);
}

module.exports = {
  canClaimDailyTask: canClaimDailyTask,
  recordDailyTaskClaim: recordDailyTaskClaim,
  canSpinWheel: canSpinWheel,
  recordWheelSpin: recordWheelSpin,
  cleanup: cleanup
};