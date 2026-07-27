const assert = require('assert');
const express = require('express');
const { signToken } = require('../lib/crypto');

const app = express();
app.use(express.json());
require('../routes/task-center')(app);

const testToken = signToken({ id: 'test_api_user', username: 'testapi', loginAt: Date.now() });

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (e) {
    console.error(`❌ ${name}:`, e.message);
    process.exit(1);
  }
}

async function run() {
  const server = await new Promise(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://localhost:${server.address().port}`;

  await test('GET /api/user/checkin-calendar requires auth', async () => {
    const res = await fetch(`${baseUrl}/api/user/checkin-calendar`);
    const data = await res.json();
    assert(data.ok === false);
    assert(data.code === 'NOT_LOGIN');
  });

  await test('GET /api/user/checkin-calendar with auth', async () => {
    const res = await fetch(`${baseUrl}/api/user/checkin-calendar?month=2026-07`, {
      headers: { 'x-user-token': testToken }
    });
    const data = await res.json();
    assert(data.ok === true);
    assert(Array.isArray(data.data));
  });

  await test('GET /api/user/daily-tasks with auth', async () => {
    const res = await fetch(`${baseUrl}/api/user/daily-tasks`, {
      headers: { 'x-user-token': testToken }
    });
    const data = await res.json();
    assert(data.ok === true);
    assert(Array.isArray(data.tasks));
  });

  await test('GET /api/user/lucky-wheel/can-spin with auth', async () => {
    const res = await fetch(`${baseUrl}/api/user/lucky-wheel/can-spin`, {
      headers: { 'x-user-token': testToken }
    });
    const data = await res.json();
    assert(data.ok === true);
    assert(typeof data.data.canSpin === 'boolean');
  });

  await test('GET /api/user/achievements with auth', async () => {
    const res = await fetch(`${baseUrl}/api/user/achievements`, {
      headers: { 'x-user-token': testToken }
    });
    const data = await res.json();
    assert(data.ok === true);
    assert(Array.isArray(data.achievements));
    assert(data.achievements.length >= 5);
  });

  await test('POST /api/user/checkin with auth', async () => {
    const res = await fetch(`${baseUrl}/api/user/checkin`, {
      method: 'POST',
      headers: { 'x-user-token': testToken, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    assert('ok' in data);
  });

  await test('POST /api/user/lucky-wheel/spin without enough tasks', async () => {
    const res = await fetch(`${baseUrl}/api/user/lucky-wheel/spin`, {
      method: 'POST',
      headers: { 'x-user-token': testToken, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    assert(data.ok === false);
  });

  server.close();
  console.log('\n✅ 任务中心路由测试全部通过');
}

run().catch(e => {
  console.error('测试失败:', e);
  process.exit(1);
});
