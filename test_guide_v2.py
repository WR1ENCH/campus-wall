from playwright.sync_api import sync_playwright
import time
import os

SS = r"C:\Users\wyxgg\Desktop\test\guide_v2"
os.makedirs(SS, exist_ok=True)

def ss(page, name):
    time.sleep(0.5)
    fname = os.path.join(SS, name + ".png")
    page.screenshot(path=fname)
    print("  [截图] " + name + ".png")

def main():
    with sync_playwright() as p:
        br = p.chromium.launch(headless=False)
        ctx = br.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        # 捕获 console
        def on_console(msg):
            txt = msg.text
            if "Guide" in txt:
                print("  [console] " + txt)
        page.on("console", on_console)

        print("=== 测试引导 ===")
        page.goto("http://localhost:3000")
        time.sleep(1)
        ss(page, "01_home")

        # 清除存储并刷新
        page.evaluate("localStorage.clear(); location.reload()")
        time.sleep(2)
        ss(page, "02_after_clear")

        # 切换到注册标签
        page.click("button.login-tab:has-text('注册')")
        time.sleep(0.5)
        ss(page, "03_register_tab")

        # 填写注册
        import time as t
        uname = "test_" + str(int(t.time()))
        page.fill("#regUsernameInput", uname)
        page.fill("#regPasswordInput", "test123")
        page.fill("#regNicknameInput", "测试用户")
        ss(page, "04_filled")

        # 提交注册
        print("  提交注册...")
        page.click("#loginConfirmBtn")
        time.sleep(2)
        ss(page, "05_after_reg")


        # 检查引导是否出现
        overlay = page.locator("#spotlightOverlay")
        tooltip = page.locator("#spotlightTooltip")
        print("  overlay可见: " + str(overlay.is_visible()))
        print("  tooltip可见: " + str(tooltip.is_visible()))

        if tooltip.is_visible():
            ss(page, "06_guide_step1")
            txt = tooltip.text_content()
            print("  引导已显示，文字长度: " + str(len(txt)))

            # 调用_nextSpotlight打开发帖模态框
            print("  调用 _nextSpotlight()...")
            page.evaluate("_nextSpotlight()")
            time.sleep(1)
            ss(page, "07_modal_opened")

            modal = page.locator("#modalOverlay")
            print("  发帖模态框可见: " + str(modal.is_visible()))

            if modal.is_visible():
                page.fill("#noteInput", "引导测试帖子！")
                ss(page, "08_post_filled")
                page.click("button.modal-submit")
                time.sleep(2)
                ss(page, "09_after_post")
                print("  帖子已发")

                time.sleep(1)
                if tooltip.is_visible():
                    ss(page, "10_guide_step2")
                    txt2 = tooltip.text_content()
                    print("  step2 已显示，文字长度: " + str(len(txt2)))


        print("")
        print("完成！截图在: " + SS)
        time.sleep(5)
        br.close()

if __name__ == "__main__":
    main()
