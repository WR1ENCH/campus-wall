const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:3000/admin.html');
  await page.waitForTimeout(1500);
  await page.fill('#loginId', 'wr1Ench');
  await page.fill('#loginPwd', 'cai091226');
  await page.click('.login-btn');
  await page.waitForTimeout(1200);

  const sidebar = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.nav-section')).map(sec => ({
      label: sec.querySelector('.nav-label')?.textContent?.trim() || '',
      items: Array.from(sec.querySelectorAll('.nav-item')).map(i => i.textContent.trim().replace(/\s+/g,' '))
    }));
  });
  console.log('=== 侧边栏结构 ===');
  sidebar.forEach(s => console.log('[' + s.label + ']', s.items.join(' | ')));

  await page.click('text=用户列表');
  await page.waitForTimeout(1200);
  const hasCol = await page.evaluate(() => document.querySelector('.users-header')?.textContent?.includes('注册IP'));
  const ip = await page.evaluate(() => {
    const row = document.querySelector('.users-row');
    if (!row) return 'no-row';
    return row.textContent.match(/(::ffff:[\d.:]+|[\d.]+)/)?.[0] || 'no-ip';
  });
  console.log('\n=== 用户列表 ===');
  console.log('注册IP列存在:', hasCol, '| 示例IP:', ip);

  await page.click('text=登录日志');
  await page.waitForTimeout(800);
  const title = await page.evaluate(() => document.getElementById('pageTitle')?.textContent);
  const logCount = await page.evaluate(() => document.getElementById('loginLogTotalCount')?.textContent);
  console.log('\n=== 登录日志 ===');
  console.log('页面标题:', title, '| 记录数:', logCount);

  if (errors.length) console.log('\nJS错误:', errors.join(', '));
  await browser.close();
  console.log('\n验证完成');
})().catch(e => { console.error('测试失败:', e.message); process.exit(1); });
