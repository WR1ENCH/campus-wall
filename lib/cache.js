// ===== lib/cache.js - TTL 内存缓存 =====

const cache = {};

function get(key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete cache[key];
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs = 3000) {
  cache[key] = { value, expiresAt: Date.now() + ttlMs };
}

function invalidate(key) {
  delete cache[key];
}

function invalidateAll() {
  for (const k of Object.keys(cache)) delete cache[k];
}

module.exports = { get, set, invalidate, invalidateAll };
