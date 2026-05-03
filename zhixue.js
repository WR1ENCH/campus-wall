/**
 * 智学网自动登录 + 获取用户信息
 * 依赖：playwright（Chromium）
 *
 * 使用方式：
 *   const { loginZhixue } = require('./zhixue');
 *   const info = await loginZhixue('账号', '密码');
 *   // info = { realName, schoolName, className, ... }
 */

const { chromium } = require('playwright');

/**
 * 用 Playwright 打开智学网登录页，
 * 填入账号密码并等待用户完成人机验证，
 * 登录成功后读取用户信息。
 *
 * @param {string} username - 智学网账号
 * @param {string} password - 智学网密码
 * @param {number} timeoutMs - 等待用户完成验证的超时（ms），默认 90 秒
 * @returns {Promise<object>} 用户信息
 */
async function loginZhixue(username, password, timeoutMs = 120000) {
  if (!username || !password) {
    throw new Error('智学网账号和密码不能为空');
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  let context, page;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    page = await context.newPage();

    // 1. 打开登录页
    console.log('[zhixue] 正在打开智学网登录页...');
    await page.goto('https://www.zhixue.com/', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('[zhixue] 页面已加载，当前URL:', page.url());

    // 2. 截图调试（保存到项目目录）
    await page.screenshot({ path: 'zhixue_debug_1_loaded.png' });
    console.log('[zhixue] 已保存截图: zhixue_debug_1_loaded.png');

    // 3. 尝试点击登录入口（多种可能的选择器）
    const loginSelectors = [
      '#loginBtn', '.login-btn', '.loginLink', 
      'a[href*="login"]', 'a[href*="Login"]',
      'button:has-text("登录")', 'a:has-text("登录")',
      '.header-login', '.nav-login', '.user-login'
    ];
    
    for (const sel of loginSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          console.log('[zhixue] 点击登录入口:', sel);
          await el.click();
          await page.waitForTimeout(2000);
          break;
        }
      } catch (_) {}
    }

    // 4. 再次截图
    await page.screenshot({ path: 'zhixue_debug_2_after_login_click.png' });

    // 5. 等待账号输入框出现（更灵活的选择器）
    const usernameSelectors = [
      'input[type="text"]',
      'input[name="username"]',
      'input[name="userName"]',
      'input[name="account"]',
      'input[placeholder*="账号"]',
      'input[placeholder*="用户名"]',
      'input[placeholder*="手机"]',
      'input[id*="username"]',
      'input[id*="user"]',
      '#username',
      '#userName',
      '#account'
    ];

    let usernameInput = null;
    for (const sel of usernameSelectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 5000 });
        if (el) {
          usernameInput = sel;
          console.log('[zhixue] 找到账号输入框:', sel);
          break;
        }
      } catch (_) {}
    }

    if (!usernameInput) {
      // 最后尝试：获取页面所有 input 并截图
      const inputs = await page.$$eval('input', els => els.map(e => e.outerHTML));
      console.log('[zhixue] 页面所有input:', inputs);
      await page.screenshot({ path: 'zhixue_debug_3_no_input.png' });
      throw new Error('未找到账号输入框，请查看截图 zhixue_debug_3_no_input.png');
    }

    // 6. 填入账号密码
    const passSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[name="pwd"]',
      'input[id*="password"]',
      '#password',
      '#pwd'
    ];
    let passInput = null;
    for (const sel of passSelectors) {
      try {
        const el = await page.waitForSelector(sel, { timeout: 3000 });
        if (el) {
          passInput = sel;
          break;
        }
      } catch (_) {}
    }

    console.log('[zhixue] 填写账号密码...');
    await page.fill(usernameInput, username);
    if (passInput) {
      await page.fill(passInput, password);
    } else {
      // 尝试通用的密码选择器
      await page.fill('input[type="password"]', password);
    }

    // 7. 截图确认填写
    await page.screenshot({ path: 'zhixue_debug_4_filled.png' });

    // 8. 点击登录按钮
    const loginBtnSelectors = [
      'button[type="submit"]',
      'button:has-text("登录")',
      'button:has-text("登 录")',
      '.login-btn',
      '.login-button',
      '#loginBtn',
      '#login',
      'a:has-text("登录")'
    ];

    for (const sel of loginBtnSelectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          console.log('[zhixue] 点击登录按钮:', sel);
          await el.click();
          break;
        }
      } catch (_) {}
    }

    // 等待一段时间让页面跳转
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'zhixue_debug_5_after_submit.png' });

    // 9. 等待登录成功（URL 变化或出现用户信息元素）
    //    智学网通常跳转到 /home 或 /student/...
    console.log('[zhixue] 等待登录跳转，当前URL:', page.url());
    let loginOk = false;
    
    try {
      await page.waitForURL('**/home**', { timeout: 10000 });
      loginOk = true;
      console.log('[zhixue] URL跳转到home页');
    } catch (_) {
      try {
        await page.waitForURL('**/student/**', { timeout: 10000 });
        loginOk = true;
        console.log('[zhixue] URL跳转到student页');
      } catch (_) {
        // 备用：等待页面中出现退出按钮或用户昵称
        try {
          await page.waitForSelector('a[href*="logout"], .user-name, .avatar, [class*="user"], [class*="nick"]', { timeout: 10000 });
          loginOk = true;
          console.log('[zhixue] 页面出现用户信息元素');
        } catch (_) { /* 继续判断 */ }
      }
    }

    // 截图记录登录后状态
    await page.screenshot({ path: 'zhixue_debug_6_after_login.png' });

    // 7. 检查是否有错误提示
    const errorText = await page.evaluate(() => {
      const el = document.querySelector('.error, .error-msg, .login-error, [class*="error"]');
      return el ? el.textContent.trim() : '';
    });
    if (errorText) {
      throw new Error('智学网登录失败：' + errorText);
    }

    if (!loginOk) {
      // 最后尝试：截图供调试，然后假设登录成功（可能有人机验证）
      console.warn('[zhixue] 未能确认登录状态，继续尝试获取用户信息...');
    }

    // 8. 获取用户信息（从页面的 JS 变量或 API 请求）
    const userInfo = await page.evaluate(() => {
      // 尝试从全局变量读取
      if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user) {
        return window.__INITIAL_STATE__.user;
      }
      if (window.userInfo) return window.userInfo;
      if (window.currentUser) return window.currentUser;

      // 从页面 DOM 中提取
      const name = document.querySelector('.user-name, .nickname, .real-name, [class*="name"]')?.textContent?.trim() || '';
      const school = document.querySelector('.school-name, [class*="school"]')?.textContent?.trim() || '';
      if (name || school) return { realName: name, schoolName: school };
      return null;
    });

    // 9. 如果页面上拿不到，尝试调用智学网的用户信息 API
    let apiUserInfo = null;
    try {
      const cookies = await context.cookies();
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 尝试几个已知的学生信息接口
      const apiUrls = [
        'https://www.zhixue.com/api/user/info',
        'https://www.zhixue.com/zhixue-web/api/user/getUserInfo',
        'https://www.zhixue.com/student/api/getStudentInfo'
      ];

      for (const url of apiUrls) {
        try {
          const resp = await page.evaluate(async ({ url, cookieStr }) => {
            const r = await fetch(url, { headers: { 'Cookie': cookieStr } });
            return { ok: r.ok, status: r.status, text: await r.text() };
          }, { url, cookieStr });
          if (resp.ok) {
            try {
              const json = JSON.parse(resp.text);
              // 适配不同返回格式
              const data = json.result || json.data || json;
              if (data && (data.realName || data.name || data.schoolName || data.school)) {
                apiUserInfo = {
                  realName: data.realName || data.name || '',
                  schoolName: data.schoolName || data.school || '',
                  className: data.className || data.class || '',
                  studentId: data.studentId || data.id || ''
                };
                break;
              }
            } catch (_) {}
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn('[zhixue] API 获取用户信息失败：', e.message);
    }

    const result = apiUserInfo || userInfo || {};
    if (!result.realName && !result.schoolName) {
      console.warn('[zhixue] 未能自动获取用户信息，页面 URL：', page.url());
      // 返回空对象，让调用方决定如何处理
    }

    return {
      realName: result.realName || result.name || '',
      schoolName: result.schoolName || result.school || '',
      className: result.className || result.class || '',
      studentId: result.studentId || result.id || ''
    };

  } finally {
    await browser.close();
  }
}

module.exports = { loginZhixue };
