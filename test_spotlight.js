const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 截图辅助函数
  const screenshot = async (name) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test_spotlight_${name}.png` });
    console.log(`📸 截图: test_spotlight_${name}.png`);
  };

  try {
    console.log('=== 测试聚光灯引导流程 ===\n');

    // 1. 打开首页
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(500);
    await screenshot('01_homepage');
    console.log('✅ 首页加载完成');

    // 2. 清除 localStorage 确保引导可以触发
    await page.evaluate(() => localStorage.clear());

    // 3. 点击登录按钮
    await page.click('#loginBtn');
    await page.waitForTimeout(300);
    await screenshot('02_login_modal');

    // 4. 切换到注册标签
    await page.click('button.login-tab:has-text("注册")');
    await page.waitForTimeout(300);
    await screenshot('03_register_tab');

    // 5. 填写注册信息
    const timestamp = Date.now();
    const username = `testuser_${timestamp}`;
    await page.fill('input[id="regUsername"]', username);
    await page.fill('input[id="regPassword"]', 'test123456');
    await page.fill('input[id="regPassword2"]', 'test123456');
    await screenshot('04_register_filled');

    // 6. 点击注册按钮
    await page.click('button:has-text("注册")');
    await page.waitForTimeout(1000);
    await screenshot('05_after_register');

    // 7. 检查引导是否出现（应该是step 1，发帖按钮）
    const spotlightVisible = await page.evaluate(() => {
      const overlay = document.getElementById('spotlightOverlay');
      const tooltip = document.getElementById('spotlightTooltip');
      return {
        overlayDisplay: overlay ? overlay.style.display : 'null',
        tooltipDisplay: tooltip ? tooltip.style.display : 'null',
        overlayVisible: overlay ? getComputedStyle(overlay).display !== 'none' : false,
        tooltipVisible: tooltip ? getComputedStyle(tooltip).display !== 'none' : false
      };
    });
    console.log('聚光灯状态:', spotlightVisible);

    if (!spotlightVisible.overlayVisible) {
      console.log('❌ 引导未出现！检查 Console 错误');
      // 检查控制台错误
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      await page.waitForTimeout(1000);
      if (consoleErrors.length > 0) {
        console.log('Console 错误:', consoleErrors);
      }
      await screenshot('06_guide_not_shown');
    } else {
      console.log('✅ 引导已出现！');
      await screenshot('06_guide_step1');

      // 获取引导文字
      const guideText = await page.evaluate(() => {
        const tooltip = document.getElementById('spotlightTooltip');
        return tooltip ? tooltip.innerText : '未找到';
      });
      console.log('引导内容:', guideText.replace(/\n/g, ' | '));

      // 检查高亮元素
      const highlightedElement = await page.evaluate(() => {
        const overlay = document.getElementById('spotlightOverlay');
        if (!overlay) return null;
        const svg = overlay.querySelector('svg');
        if (!svg) return null;
        const rings = svg.querySelectorAll('.spotlight-ring');
        if (rings.length > 0) {
          const rect = rings[0].getBoundingClientRect();
          // 查找覆盖这个区域的元素
          const elements = document.elementsFromPoint(rect.x + rect.width/2, rect.y + rect.height/2);
          return elements.map(el => el.className || el.id || el.tagName);
        }
        return null;
      });
      console.log('高亮区域覆盖的元素:', highlightedElement);

      // 8. 点"知道了"打开发帖模态框
      const nextBtn = await page.locator('button.spotlight-next, button.spotlight-done').first();
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(500);
        await screenshot('07_post_modal');

        // 9. 填写帖子内容
        await page.fill('#noteInput', '这是引导测试帖子内容！');
        await screenshot('08_post_filled');

        // 10. 提交帖子
        await page.click('button.modal-submit');
        await page.waitForTimeout(1000);
        await screenshot('09_after_post');

        // 11. 检查引导是否更新到 step 2
        const guideAfterPost = await page.evaluate(() => {
          const tooltip = document.getElementById('spotlightTooltip');
          return tooltip ? tooltip.innerText : '未找到';
        });
        console.log('发帖后引导内容:', guideAfterPost.replace(/\n/g, ' | '));
        await screenshot('10_guide_step2');

        console.log('\n✅ 引导流程测试完成！');
      } else {
        console.log('❌ 未找到引导按钮');
      }
    }

  } catch (err) {
    console.error('❌ 测试失败:', err.message);
    await page.screenshot({ path: 'test_error.png' });
    console.log('📸 错误截图: test_error.png');
  } finally {
    await browser.close();
    console.log('\n测试结束');
  }
})();
