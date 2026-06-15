from playwright.sync_api import sync_playwright
import time
import os

def test_guide():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # 有头模式方便看
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        ss_dir = r"C:\Users\wyxgg\Desktop\test\guide_test"
        os.makedirs(ss_dir, exist_ok=True)
        
        def ss(name):
            time.sleep(0.4)
            page.screenshot(path=os.path.join(ss_dir, f"{name}.png"))
            print(f"  [截图] {name}.png")
        
        try:
            print("=== 打开校园墙 ===")
            page.goto("http://localhost:3000")
            time.sleep(1)
            ss("01_homepage")
            
            # 注入一个假用户，跳过注册
            page.evaluate("""
                () => {
                    const user = { id: 999, username: 'test', nickname: '测试用户', avatar: '🐱' };
                    localStorage.setItem('campus_wall_user', JSON.stringify(user));
                    localStorage.setItem('campus_user_token', 'fake_token_for_test');
                    location.reload();
                }
            """)
            time.sleep(2)
            ss("02_after_login")
            print("已注入测试用户并刷新")
            
            # 清除引导标记，强制触发
            page.evaluate("localStorage.removeItem('newbieGuideShown')")
            time.sleep(0.5)
            
            # 手动触发引导
            page.evaluate("showNewbieGuide()")
            time.sleep(1)
            ss("03_guide_step1")
            
            # 检查引导文字
            guide_text = page.evaluate("""
                () => {
                    const t = document.getElementById('spotlightTooltip');
                    return t ? t.innerText : 'NOT FOUND';
                }
            """)
            print(f"  引导内容: {guide_text.replace(chr(10), ' | ')}")
            
            # 获取高亮元素
            highlighted = page.evaluate("""
                () => {
                    const ring = document.querySelector('.spotlight-ring');
                    if (!ring) return null;
                    const rect = ring.getBoundingClientRect();
                    const el = document.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2);
                    return el ? (el.className + ' #' + el.id) : null;
                }
            """)
            print(f"  高亮元素: {highlighted}")
            
            # 点"知道了" → 打开发帖窗口
            print("\n  点击「知道了」...")
            page.click("button.spotlight-next")
            time.sleep(1)
            ss("05_after_step1")
            
            # 现在模态框应该打开了
            modal_open = page.evaluate("getComputedStyle(document.getElementById('modalOverlay')).display !== 'none'")
            print(f"  发帖模态框打开: {modal_open}")
            
            if modal_open:
                # 填写帖子
                page.fill("#noteInput", "引导测试帖子！")
                ss("06_post_filled")
                
                # 提交
                print("  提交帖子...")
                page.click("button.modal-submit")
                time.sleep(2)
                ss("07_after_post")
                
                # 检查引导是否到第二步
                guide_text2 = page.evaluate("""
                    () => {
                        const t = document.getElementById('spotlightTooltip');
                        return t && getComputedStyle(t).display !== 'none' ? t.innerText : 'GUIDE_CLOSED';
                    }
                """)
                print(f"  发帖后引导: {guide_text2.replace(chr(10), ' | ')}")
                ss("08_guide_step2")
                
                if guide_text2 != 'GUIDE_CLOSED':
                    # 点击帖子卡片
                    print("  点击帖子卡片...")
                    # 引导应该高亮刚发的帖子
                    time.sleep(1)
                    page.click(".sticky-note")
                    time.sleep(1)
                    ss("09_note_detail")
                    
                    # 现在应该在详情页，引导到第三步
                    guide_text3 = page.evaluate("""
                        () => {
                            const t = document.getElementById('spotlightTooltip');
                            return t && getComputedStyle(t).display !== 'none' ? t.innerText : 'GUIDE_CLOSED';
                        }
                    """)
                    print(f"  详情页引导: {guide_text3.replace(chr(10), ' | ')}")
            
            print("\n[OK] 测试完成！查看截图:")
            print(f"  {ss_dir}")
            
        except Exception as e:
            print(f"[FAIL] 测试失败: {e}")
            ss("error")
        finally:
            time.sleep(3)
            browser.close()

if __name__ == "__main__":
    test_guide()
