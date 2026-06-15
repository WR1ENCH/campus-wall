from playwright.sync_api import sync_playwright
import time
import os

def test_spotlight_guide():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        screenshot_dir = r"C:\Users\wyxgg\Desktop\test\test_screenshots"
        os.makedirs(screenshot_dir, exist_ok=True)
        
        def screenshot(name):
            time.sleep(0.3)
            path = os.path.join(screenshot_dir, f"spotlight_{name}.png")
            page.screenshot(path=path)
            print(f"[screenshot] spotlight_{name}.png")
        
        try:
            print("=== Test Spotlight Guide ===\n")
            
            # 1. 打开首页
            page.goto("http://localhost:3000")
            page.wait_for_timeout(500)
            screenshot("01_homepage")
            print("[OK] 首页加载完成")
            
            # 2. 清除 localStorage
            page.evaluate("localStorage.clear()")
            page.reload()
            page.wait_for_timeout(500)
            screenshot("02_after_clear_storage")
            
            # 3. 登录框应该已经打开，检查并切换到注册标签
            modal_open = page.evaluate("""
                () => {
                    const modal = document.getElementById('loginModal');
                    return modal ? getComputedStyle(modal).display !== 'none' : false;
                }
            """)
            print(f"登录框已打开: {modal_open}")
            page.wait_for_timeout(300)
            screenshot("03_login_modal")
            
            # 4. 切换到注册标签
            page.click("button.login-tab:text('注册')")
            page.wait_for_timeout(300)
            screenshot("04_register_tab")
            
            # 5. 填写注册信息
            import random
            username = f"testuser_{int(time.time())}"
            page.fill("#regUsernameInput", username)
            page.fill("#regPasswordInput", "test123456")
            # 昵称需要2-12字
            page.fill("#regNicknameInput", f"测试用户{int(time.time()) % 10000}")
            screenshot("05_register_filled")
            print(f"注册用户: {username}")
            
            # 6. 点击登录/注册按钮（在注册Tab下会调用doUserRegister）
            page.click("#loginConfirmBtn")
            page.wait_for_timeout(1500)
            screenshot("06_after_register")
            
            # 7. 检查引导是否出现
            page.wait_for_timeout(1000)  # 等待引导触发
            
            # 先检查 _spotlight 对象状态
            spotlight_debug = page.evaluate("""
                () => {
                    return {
                        spotlightExists: typeof _spotlight !== 'undefined',
                        spotlightStep: typeof _spotlight !== 'undefined' ? _spotlight.step : null,
                        spotlightStepsLen: typeof _spotlight !== 'undefined' ? _spotlight.steps.length : null,
                        currentUser: typeof currentUser !== 'undefined' ? currentUser : null,
                        guideShown: localStorage.getItem('newbieGuideShown'),
                        userKey: localStorage.getItem('campus_wall_user') ? 'exists' : 'null',
                        forceOff: localStorage.getItem('newbieGuideForceOff')
                    };
                }
            """)
            print(f"Debug: {spotlight_debug}")
            
            guide_visible = page.evaluate("""
                () => {
                    const overlay = document.getElementById('spotlightOverlay');
                    const tooltip = document.getElementById('spotlightTooltip');
                    if (!overlay || !tooltip) return { found: false };
                    return {
                        found: true,
                        overlayDisplay: getComputedStyle(overlay).display,
                        tooltipDisplay: getComputedStyle(tooltip).display,
                        tooltipText: tooltip ? tooltip.innerText : ''
                    };
                }
            """)
            
            if not guide_visible.get('found'):
                print("[FAIL] 引导元素未找到！")
                return
            
            if guide_visible['tooltipDisplay'] == 'none':
                print("[FAIL] 引导未显示！")
                screenshot("07_guide_not_shown")
                return
            
            print("[OK] 引导已出现！")
            print(f"引导内容: {guide_visible['tooltipText'].replace(chr(10), ' | ')}")
            screenshot("07_guide_step1")
            
            # 获取高亮元素
            highlighted = page.evaluate("""
                () => {
                    const overlay = document.getElementById('spotlightOverlay');
                    if (!overlay) return null;
                    const svg = overlay.querySelector('svg');
                    if (!svg) return null;
                    const ring = svg.querySelector('.spotlight-ring');
                    if (!ring) return null;
                    const rect = ring.getBoundingClientRect();
                    const centerX = rect.x + rect.width / 2;
                    const centerY = rect.y + rect.height / 2;
                    const el = document.elementFromPoint(centerX, centerY);
                    return el ? (el.className + ' #' + el.id) : null;
                }
            """)
            print(f"高亮元素: {highlighted}")
            
            # 8. 检查按钮文字
            btn_text = page.locator("button.spotlight-next, button.spotlight-done").first.text_content()
            print(f"引导按钮: {btn_text}")
            print(f"引导按钮: {btn_text}")
            
            # 9. 点"知道了"打开发帖模态框
            page.click("button.spotlight-next, button.spotlight-done")
            page.wait_for_timeout(800)
            screenshot("08_post_modal_opened")
            
            # 检查模态框是否打开
            modal_open = page.evaluate("""
                () => getComputedStyle(document.getElementById('modalOverlay')).display !== 'none'
            """)
            modal_visible = page.evaluate("getComputedStyle(document.getElementById('modalOverlay')).display !== 'none'")
            print(f"发帖模态框已打开: {modal_visible}")
            
            # 10. 填写帖子内容
            page.fill("#noteInput", "这是引导测试帖子！")
            screenshot("09_post_filled")
            
            # 11. 提交帖子
            page.click("button.modal-submit")
            page.wait_for_timeout(1500)
            screenshot("10_after_post")
            
            # 12. 检查引导状态
            guide_after = page.evaluate("""
                () => {
                    const tooltip = document.getElementById('spotlightTooltip');
                    return tooltip ? {
                        visible: getComputedStyle(tooltip).display !== 'none',
                        text: tooltip.innerText.replace(/\\n/g, ' | ')
                    } : null;
                }
            """)
            
            if guide_after and guide_after['visible']:
                print(f"发帖后引导: {guide_after['text']}")
                screenshot("11_guide_step2")
            else:
                print("[WARN] 发帖后引导已关闭")
                screenshot("11_guide_closed")
            
            print("\n[OK] 测试完成！")
            
        except Exception as e:
            print(f"[FAIL] 测试失败: {e}")
            screenshot("error")
        finally:
            browser.close()

if __name__ == "__main__":
    test_spotlight_guide()
