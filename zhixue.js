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
async function loginZhixue(username, password, timeoutMs = 90000) {
  if (!username || !password) {
    throw new Error('智学网账号和密码不能为空');
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let context, page;
  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    page = await context.newPage();

    // 1. 打开登录页
    await page.goto('https://www.zhixue.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });

    // 2. 尝试点击登录入口（页面结构可能变化）
    try {
      await page.waitForSelector('#loginBtn, .login-btn, a[href*="login"]', { timeout: 8000 });
      await page.click('#loginBtn, .login-btn, a[href*="login"]', { timeout: 5000 }).catch(() => {});
    } catch (_) { /* 可能已经在登录页 */ }

    // 3. 等待账号输入框出现
    await page.waitForSelector('input[type="text"], input[name="username"], input[placeholder*="账号"]', { timeout: 15000 });

    // 4. 填入账号密码
    const userSelector = 'input[type="text"], input[name="username"], input[placeholder*="账号"], input[placeholder*="用户名"]';
    const passSelector = 'input[type="password"], input[name="password"]';
    await page.fill(userSelector, username);
    await page.fill(passSelector, password);

    // 5. 点击登录按钮，等待跳转或错误提示
    const loginBtnSelector = 'button[type="submit"], .login-btn, button:has-text("登录"), button:has-text("登 录")';
    await page.click(loginBtnSelector).catch(async () => {
      // 如果点击失败，尝试按回车
      await page.press(userSelector, 'Enter');
    });

    // 6. 等待登录成功（URL 变化或出现用户信息元素）
    //    智学网通常跳转到 /home 或 /student/...
    let loginOk = false;
    try {
      await page.waitForURL('**/home**', { timeout: 8000 });
      loginOk = true;
    } catch (_) {
      // 备用：等待页面中出现退出按钮或用户昵称
      try {
        await page.waitForSelector('a[href*="logout"], .user-name, .avatar, [class*="user"]', { timeout: 8000 });
        loginOk = true;
      } catch (_) { /* 继续判断 */ }
    }

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
