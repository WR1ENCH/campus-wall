var crypto = require('crypto');
var db = require('./db');

var KEY_TTL = 24 * 60 * 60 * 1000;

function generateTestKey() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var key = 'TW-';
  for (var i = 0; i < 8; i++) {
    key += chars[crypto.randomInt(chars.length)];
  }
  return key;
}

function getMaintenanceData() {
  return db.readMaintenance() || { enabled: false };
}

function saveMaintenanceData(patch) {
  var current = getMaintenanceData();
  var merged = {};
  for (var k in current) merged[k] = current[k];
  for (var k in patch) merged[k] = patch[k];
  db.writeMaintenance(merged);
  return merged;
}

function createTestKey() {
  var data = getMaintenanceData();
  var keys = data.testKeys || [];
  if (typeof keys === 'string') {
    try { keys = JSON.parse(keys); } catch (e) { keys = []; }
  }
  var now = Date.now();
  var validKeys = [];
  for (var i = 0; i < keys.length; i++) {
    if (new Date(keys[i].expiresAt).getTime() > now) validKeys.push(keys[i]);
  }
  var key = generateTestKey();
  var expiresAt = new Date(now + KEY_TTL).toISOString();
  validKeys.push({ key: key, createdAt: new Date().toISOString(), expiresAt: expiresAt });
  saveMaintenanceData({ testKeys: validKeys });
  return { key: key, expiresAt: expiresAt };
}

function verifyTestKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, msg: 'Please enter test key' };
  }
  var data = getMaintenanceData();
  var keys = data.testKeys || [];
  if (typeof keys === 'string') {
    try { keys = JSON.parse(keys); } catch (e) { keys = []; }
  }
  var now = Date.now();
  var upperKey = key.toUpperCase();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].key === upperKey) {
      if (new Date(keys[i].expiresAt).getTime() < now) {
        return { valid: false, msg: 'Key expired' };
      }
      return { valid: true, msg: 'OK' };
    }
  }
  return { valid: false, msg: 'Invalid key' };
}

function deleteTestKey(key) {
  var data = getMaintenanceData();
  var keys = data.testKeys || [];
  if (typeof keys === 'string') {
    try { keys = JSON.parse(keys); } catch (e) { keys = []; }
  }
  var filtered = [];
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].key !== key) filtered.push(keys[i]);
  }
  saveMaintenanceData({ testKeys: filtered });
}

function listTestKeys() {
  var data = getMaintenanceData();
  var keys = data.testKeys || [];
  if (typeof keys === 'string') {
    try { keys = JSON.parse(keys); } catch (e) { keys = []; }
  }
  var now = Date.now();
  var result = [];
  for (var i = 0; i < keys.length; i++) {
    if (new Date(keys[i].expiresAt).getTime() > now) result.push(keys[i]);
  }
  return result;
}

module.exports = {
  getMaintenanceData: getMaintenanceData,
  saveMaintenanceData: saveMaintenanceData,
  createTestKey: createTestKey,
  verifyTestKey: verifyTestKey,
  deleteTestKey: deleteTestKey,
  listTestKeys: listTestKeys
};
