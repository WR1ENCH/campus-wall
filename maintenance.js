// ===== maintenance.js - 维护模式模块 =====
// 处理维护状态、测试密钥生成与验证
const crypto = require('crypto');
const db = require('./db');

// 测试密钥有效期：24小时
const KEY_TTL = 24 * 60 * 60 * 1000;

// ===== 测试密钥管理 =====

/**
 * 生成测试密钥
 * @returns {string} 8位大写字母+数字密钥
 */
function generateTestKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = 'TW-';
  for (let i = 0; i < 8; i++) {
    key += chars[crypto.randomInt(chars.length)];
  }
  return key;
}

/**
 * 读取当前维护数据
 */
function getMaintenanceData() {
  return db.readMaintenance() || { enabled: false };
}

/**
 * 保存维护数据（保留已有字段，合并新字段）
 */
function saveMaintenanceData(patch) {
  const current = getMaintenanceData();
  const merged = { ...current, ...patch };
  db.writeMaintenance(merged);
  return merged;
}

/**
 * 创建新的测试密钥（管理员操作）
 * @returns {{ key: string, expiresAt: string }}
 */
function createTestKey() {
  const data = getMaintenanceData();
  const keys = data.testKeys || [];

  // 清理过期密钥
  const now = Date.now();
  const validKeys = keys.filter(k => new Date(k.expiresAt).getTime() > now);

  const key = generateTestKey();
  const expiresAt = new Date(now + KEY_TTL).toISOString();
  validKeys.push({ key, createdAt: new Date().toISOString(), expiresAt });

  saveMaintenanceData({ testKeys: validKeys });
  return { key, expiresAt };
}

/**
 * 验证测试密钥
 * @param {string} key 用户输入的密钥
 * @returns {{ valid: boolean, msg: string }}
 */
function verifyTestKey(key) {
  if (!key || typeof key !== 'string') {
    return { valid: false, msg: '请输入测试密钥' };
  }

  const data = getMaintenanceData();
  const keys = data.testKeys || [];
  const now = Date.now();

  const found = keys.find(k => k.key === key.toUpperCase());
  if (!found) {
    return { valid: false, msg: '密钥无效' };
  }

  if (new Date(found.expiresAt).getTime() < now) {
    return { valid: false, msg: '密钥已过期' };
  }

  return { valid: true, msg: '验证通过' };
}

/**
 * 删除指定测试密钥
 */
function deleteTestKey(key) {
  const data = getMaintenanceData();
  const keys = data.testKeys || [];
  const filtered = keys.filter(k => k.key !== key);
  saveMaintenanceData({ testKeys: filtered });
}

/**
 * 获取所有未过期的测试密钥列表
 */
function listTestKeys() {
  const data = getMaintenanceData();
  const keys = data.testKeys || [];
  const now = Date.now();
  return keys.filter(k => new Date(k.expiresAt).getTime() > now);
}

module.exports = {
  getMaintenanceData,
  saveMaintenanceData,
  createTestKey,
  verifyTestKey,
  deleteTestKey,
  listTestKeys
};
