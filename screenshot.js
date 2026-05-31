const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  const shots = [
    { url: 'http://localhost:3000/', name: 'screenshot_index.png' },
    { url: 'http://localhost:3000/admin.html', name: 'screenshot_admin.png' },
    { url: 'http://localhost:3000/user.html?id=1', name: 'screenshot_user.png' },
  ];

  for (const s of shots) {
    try {
      await page.goto(s.url, { waitUntil: 'networkidle', timeout: 8000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: s.name, fullPage: false });
      console.log('OK: ' + s.name);
    } catch (e) {
      console.log('FAIL: ' + s.name + ': ' + e.message);
    }
  }

  await browser.close();
})();
