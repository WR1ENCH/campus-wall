/**
 * 调试智学网登录页
 * 打开页面并截图，列出所有input元素
 */

const { chromium } = require('playwright');

async function debug() {
  console.log('[debug] 启动浏览器...');
  
  const browser = await chromium.launch({
    headless: false,  // 可见模式，方便调试
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    console.log('[debug] 访问智学网...');
    await page.goto('https://www.zhixue.com/', { waitUntil: 'networkidle', timeout: 30000 });
    
    console.log('[debug] 页面已加载，URL:', page.url());
    await page.waitForTimeout(3000);
    
    // 截图
    await page.screenshot({ path: 'zhixue_debug_1.png', fullPage: true });
    console.log('[debug] 截图已保存: zhixue_debug_1.png');
    
    // 列出所有input元素
    const inputs = await page.$$eval('input', els => els.map(el => ({
      tag: el.tagName,
      type: el.type,
      name: el.name,
      id: el.id,
      className: el.className,
      placeholder: el.placeholder,
      visible: el.offsetParent !== null
    })));
    
    console.log('[debug] 页面所有input元素:');
    console.log(JSON.stringify(inputs, null, 2));
    
    // 列出所有button元素
    const buttons = await page.$$eval('button, a[role="button"]', els => els.map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 50),
      className: el.className,
      id: el.id
    })));
    
    console.log('[debug] 页面所有button元素:');
    console.log(JSON.stringify(buttons, null, 2));
    
    // 检查是否有iframe
    const frames = page.frames();
    console.log('[debug] 页面帧数:', frames.length);
    for (let i = 0; i < frames.length; i++) {
      console.log(`[debug] 帧 ${i}:`, frames[i].url());
    }
    
    // 尝试点击登录按钮
    console.log('[debug] 尝试查找登录按钮...');
    const loginSelectors = [
      'button:has-text("登录")',
      'a:has-text("登录")',
      '.login-btn',
      '#loginBtn'
    ];
    
    for (const sel of loginSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          console.log(`[debug] 找到登录按钮: ${sel}`);
          await btn.click();
          await page.waitForTimeout(2000);
          
          // 点击后再次截图
          await page.screenshot({ path: 'zhixue_debug_2_after_click.png', fullPage: true });
          console.log('[debug] 点击后截图: zhixue_debug_2_after_click.png');
          break;
        }
      } catch (e) {
        // 继续
      }
    }
    
    // 再次列出所有input
    const inputs2 = await page.$$eval('input', els => els.map(el => ({
      tag: el.tagName,
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder
    })));
    
    console.log('[debug] 点击登录后，所有input元素:');
    console.log(JSON.stringify(inputs2, null, 2));
    
    console.log('[debug] 浏览器保持打开，按Ctrl+C关闭');
    await page.waitForTimeout(60000);  // 保持60秒
    
  } catch (error) {
    console.error('[debug] 错误:', error.message);
  } finally {
    await browser.close();
  }
}

debug();
