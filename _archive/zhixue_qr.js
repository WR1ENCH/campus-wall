/**
 * 智学网扫码登录模块
 * 
 * 流程：
 * 1. Playwright打开智学网扫码登录页面
 * 2. 截取二维码图片
 * 3. 前端显示二维码，让用户扫码
 * 4. 轮询扫码状态
 * 5. 返回用户信息
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 二维码图片保存路径
const QR_CODE_PATH = path.join(__dirname, 'zhixue_qrcode.png');

/**
 * 获取扫码登录二维码
 * Playwright打开页面 → 截图二维码
 * 
 * @returns {Promise<{qrCodePath: string, qrCodeBase64: string}>}
 */
async function getQRCode() {
  console.log('[zhixue-qr] 启动浏览器...');
  
  const browser = await chromium.launch({
    headless: true,  // 无头模式，不需要可见
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  let context, page;
  
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    page = await context.newPage();
    
    // 1. 访问智学网扫码登录页面
    console.log('[zhixue-qr] 访问智学网扫码登录页...');
    
    // 尝试多个可能的扫码登录URL
    const scanUrls = [
      'https://www.zhixue.com/scan-login.html',
      'https://www.zhixue.com/login/scan',
      'https://www.zhixue.com/login.html#scan',
      'https://www.zhixue.com/passport/scan-login'
    ];
    
    let pageLoaded = false;
    for (const url of scanUrls) {
      try {
        console.log(`[zhixue-qr] 尝试: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        
        // 检查页面是否有二维码元素
        await page.waitForTimeout(2000);
        
        const qrCodeElement = await page.$('img[src*="qr"], canvas, .qr-code, #qrcode, .scan-qr');
        
        if (qrCodeElement) {
          console.log(`[zhixue-qr] ✅ 找到二维码元素: ${url}`);
          pageLoaded = true;
          break;
        }
      } catch (e) {
        console.log(`[zhixue-qr] ❌ 失败: ${e.message}`);
      }
    }
    
    // 如果URL方式不行，尝试在主页找扫码入口
    if (!pageLoaded) {
      console.log('[zhixue-qr] 尝试从首页进入扫码页面...');
      await page.goto('https://www.zhixue.com/', { waitUntil: 'networkidle', timeout: 30000 });
      
      // 查找扫码登录按钮
      const scanBtnSelectors = [
        'a:has-text("扫码登录")',
        'a:has-text("扫码")',
        'button:has-text("扫码")',
        '.scan-login-btn',
        '[class*="scan"]'
      ];
      
      for (const selector of scanBtnSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn) {
            console.log(`[zhixue-qr] 找到扫码按钮: ${selector}`);
            await btn.click();
            await page.waitForTimeout(3000);
            pageLoaded = true;
            break;
          }
        } catch (e) {
          // 继续
        }
      }
    }
    
    if (!pageLoaded) {
      // 最后尝试：直接访问登录页，看是否有扫码选项
      console.log('[zhixue-qr] 尝试访问登录页...');
      await page.goto('https://www.zhixue.com/login.html', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);
      
      // 截图看看页面长什么样
      await page.screenshot({ path: 'zhixue_login_page.png', fullPage: true });
      console.log('[zhixue-qr] 已截图: zhixue_login_page.png');
      
      // 查找扫码相关元素
      const allText = await page.evaluate(() => document.body.innerText);
      console.log('[zhixue-qr] 页面文本片段:', allText.substring(0, 500));
    }
    
    // 2. 查找二维码元素并截图
    console.log('[zhixue-qr] 查找二维码元素...');
    
    const qrSelectors = [
      'img[src*="qr"]',
      'img[src*="QR"]',
      'img[class*="qr"]',
      'img[id*="qr"]',
      'canvas',
      '.qr-code',
      '#qrcode',
      '.scan-qr',
      '.qrcode',
      '[class*="qrCode"]'
    ];
    
    let qrElement = null;
    for (const selector of qrSelectors) {
      try {
        const el = await page.$(selector);
        if (el) {
          // 检查元素是否可见
          const isVisible = await el.isVisible();
          const box = await el.boundingBox();
          
          if (isVisible && box && box.width > 50 && box.height > 50) {
            console.log(`[zhixue-qr] 找到二维码元素: ${selector}, 尺寸: ${box.width}x${box.height}`);
            qrElement = { selector, ...box };
            break;
          }
        }
      } catch (e) {
        // 继续
      }
    }
    
    if (qrElement) {
      // 截取二维码区域
      const screenshot = await page.screenshot({
        clip: {
          x: qrElement.x - 10,
          y: qrElement.y - 10,
          width: qrElement.width + 20,
          height: qrElement.height + 20
        }
      });
      
      // 保存到文件
      fs.writeFileSync(QR_CODE_PATH, screenshot);
      console.log(`[zhixue-qr] ✅ 二维码已保存: ${QR_CODE_PATH}`);
      
      // 转换为base64
      const qrCodeBase64 = `data:image/png;base64,${screenshot.toString('base64')}`;
      
      return {
        qrCodePath: QR_CODE_PATH,
        qrCodeBase64: qrCodeBase64
      };
    }
    
    // 如果没找到特定元素，截图整个页面
    console.log('[zhixue-qr] 未找到特定二维码元素，截取整个页面...');
    await page.screenshot({ path: QR_CODE_PATH, fullPage: true });
    
    return {
      qrCodePath: QR_CODE_PATH,
      qrCodeBase64: null
    };
    
  } finally {
    await browser.close();
    console.log('[zhixue-qr] 浏览器已关闭');
  }
}

/**
 * 检查扫码状态（轮询方式）
 * 
 * @param {string} sessionId - 会话ID
 * @returns {Promise<{status: string, userInfo?: object}>}
 */
async function checkScanStatus(sessionId) {
  // 这个需要根据智学网的实际API实现
  // 目前暂时返回pending状态
  
  return {
    status: 'pending',
    message: '请用智学网APP扫码'
  };
}

/**
 * 完整的扫码登录流程
 * 
 * @param {function} onQRCode - 收到二维码时的回调
 * @param {function} onStatusChange - 状态变化时的回调
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<{name, school, class, grade}>}
 */
async function qrLogin(onQRCode, onStatusChange, timeout = 180000) {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    
    try {
      // 1. 获取二维码
      const qrData = await getQRCode();
      
      // 回调通知前端显示二维码
      if (onQRCode) {
        onQRCode(qrData);
      }
      
      console.log('[zhixue-qr] 请用智学网APP扫码...');
      
      // 2. 轮询扫码状态
      // 由于智学网扫码登录通常是网页端轮询，这里需要模拟
      // 实际上，我们需要在Playwright浏览器中轮询
      
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      const page = await context.newPage();
      
      // 访问扫码页面
      await page.goto('https://www.zhixue.com/login.html', { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      // 点击扫码登录（如果需要）
      try {
        const scanBtn = await page.$('a:has-text("扫码登录"), button:has-text("扫码")');
        if (scanBtn) {
          await scanBtn.click();
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        // 继续
      }
      
      // 轮询扫码状态
      const pollInterval = 3000;
      const pollTimer = setInterval(async () => {
        // 检查超时
        if (Date.now() - startTime > timeout) {
          clearInterval(pollTimer);
          await browser.close();
          reject(new Error('扫码登录超时，请重试'));
          return;
        }
        
        try {
          // 检查页面是否有登录成功的标志
          const url = page.url();
          
          // 如果URL变化，说明可能登录成功
          if (!url.includes('login') && !url.includes('signin')) {
            clearInterval(pollTimer);
            
            if (onStatusChange) {
              onStatusChange('success', {});
            }
            
            // 获取用户信息
            const userInfo = await page.evaluate(() => {
              // 从页面提取用户信息
              const name = document.querySelector('.user-name, .nickname, .real-name')?.textContent?.trim() || '';
              const school = document.querySelector('.school-name, [class*="school"]')?.textContent?.trim() || '';
              return { name, school };
            });
            
            await browser.close();
            
            resolve({
              name: userInfo.name || '',
              school: userInfo.school || '',
              class: '',
              grade: ''
            });
            return;
          }
          
          // 检查是否有扫码成功的提示
          const pageText = await page.evaluate(() => document.body.innerText);
          
          if (pageText.includes('扫码成功') || pageText.includes('已扫描')) {
            if (onStatusChange) {
              onStatusChange('scanned', {});
            }
          }
          
        } catch (e) {
          console.log(`[zhixue-qr] 轮询错误: ${e.message}`);
        }
        
      }, pollInterval);
      
    } catch (e) {
      reject(e);
    }
  });
}

// 导出模块
module.exports = {
  getQRCode,
  qrLogin
};

// 如果直接运行，进行测试
if (require.main === module) {
  console.log('='.repeat(50));
  console.log('智学网扫码登录测试 - Playwright方案');
  console.log('='.repeat(50));
  console.log();
  
  getQRCode().then(qrData => {
    console.log();
    console.log('='.repeat(50));
    console.log('✅ 获取二维码成功！');
    console.log('='.repeat(50));
    console.log('图片路径:', qrData.qrCodePath);
    
    if (qrData.qrCodeBase64) {
      console.log('Base64长度:', qrData.qrCodeBase64.length);
    }
    
    console.log();
    console.log('请用智学网APP扫码测试...');
  }).catch(err => {
    console.error();
    console.error('❌ 获取二维码失败:', err.message);
    console.error();
    console.error('请检查是否有 zhixue_login_page.png 截图');
  });
}
