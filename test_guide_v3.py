# -*- coding: utf-8 -*-
"""
新用户引导功能 Playwright 全链路测试 v3
5步引导完整测试
"""
import sys, time, random, string, traceback
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BASE_URL = "http://localhost:3000"
TIMEOUT = 8000

results = []
bugs_found = []

def log(msg):
    print(msg)
    sys.stdout.flush()

def ok(name):
    results.append(("PASS", name))
    log(f"  [PASS] {name}")

def fail(name, reason):
    results.append(("FAIL", name, reason))
    bugs_found.append((name, reason))
    log(f"  [FAIL] {name}: {reason}")

def rand_user():
    s = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"pw{s}", f"Pass{s}1", f"Nick{s}"

def js_state(page):
    return page.evaluate("""() => {
        var o = document.getElementById('spotlightOverlay');
        var t = document.getElementById('spotlightTooltip');
        return {
            overlayDisplay: o ? o.style.display : 'missing',
            tooltipDisplay: t ? t.style.display : 'missing',
            step: window._spotlight ? window._spotlight.step : -1,
            tooltipText: t ? t.innerText.replace(/\\n/g, ' ').substring(0, 120) : ''
        };
    }""")

def try_click_next(page, label):
    """尝试点击 Next/Done 按钮，失败则用 JS 调用"""
    for sel in [".spotlight-next", ".spotlight-done"]:
        try:
            btn = page.locator(sel)
            if btn.count() > 0 and btn.is_visible():
                btn.click(force=True, timeout=3000)
                log(f"  -> {label}: 直接点击 {sel} 成功")
                return True
        except Exception:
            pass
    # 降级：JS 调用
    page.evaluate("_nextSpotlight ? _nextSpotlight() : hideNewbieGuide()")
    log(f"  -> {label}: JS 降级调用 _nextSpotlight()")
    return True

def run_all():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=200)
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()

        username, password, nickname = rand_user()
        log(f"\n{'='*60}")
        log(f"  [准备] 注册新用户: {username} / 昵称: {nickname}")
        log(f"{'='*60}")

        # ——— 访问首页 ———
        page.goto(BASE_URL, wait_until="networkidle")
        time.sleep(0.8)

        # 强制清除所有 localStorage（确保引导会触发）
        page.evaluate("""() => {
            localStorage.removeItem('campus_wall_visited');
            localStorage.removeItem('newbieGuideShown');
            localStorage.removeItem('newbieGuideForceOff');
            localStorage.removeItem('campus_wall_user');
            localStorage.removeItem('campus_user_token');
        }""")
        log("  清除 localStorage 完成")

        # ——— 确保登录框出现 ———
        login_visible = page.evaluate("() => !!document.getElementById('userLoginOverlay').classList.contains('show')")
        if not login_visible:
            log("  登录框未出现，手动触发...")
            page.evaluate("showLoginModal()")
            time.sleep(0.4)

        # ——— 切换到注册 ———
        page.click("#tabRegister")
        time.sleep(0.3)
        log("  切换到注册 Tab")

        page.fill("#regUsernameInput", username)
        page.fill("#regPasswordInput", password)
        page.fill("#regNicknameInput", nickname)
        time.sleep(0.2)

        # 截图确认表单填写状态
        reg_vals = page.evaluate("""() => ({
            u: document.getElementById('regUsernameInput').value,
            p: document.getElementById('regPasswordInput').value,
            n: document.getElementById('regNicknameInput').value
        })""")
        log(f"  表单值: user={reg_vals['u']}, nick={reg_vals['n']}, pwd={'*'*len(reg_vals['p'])}")

        page.click("#loginConfirmBtn")
        log("  点击注册按钮")
        time.sleep(2.0)

        # 检查注册结果
        err_text = page.evaluate("() => document.getElementById('userLoginError').innerText.trim()")
        overlay_show = page.evaluate("() => document.getElementById('userLoginOverlay').classList.contains('show')")
        cur_user = page.evaluate("() => JSON.parse(localStorage.getItem('campus_wall_user') || 'null')")

        log(f"  注册错误文本: '{err_text}'")
        log(f"  登录框 show: {overlay_show}")
        log(f"  currentUser in localStorage: {cur_user}")

        if cur_user and cur_user.get("username") == username:
            ok("0. 新用户注册成功")
        elif not overlay_show:
            ok("0. 新用户注册成功 (弹窗已关闭)")
        else:
            fail("0. 新用户注册成功", f"err='{err_text}', overlay仍显示")
            # 尝试用 API 注册后直接设置 localStorage
            log("  >> 尝试 API 直接注册...")
            import json
            import urllib.request
            data = json.dumps({"username": username, "password": password, "nickname": nickname}).encode()
            req = urllib.request.Request(f"{BASE_URL}/api/user/register",
                                         data=data,
                                         headers={"Content-Type": "application/json"},
                                         method="POST")
            try:
                with urllib.request.urlopen(req, timeout=5) as resp:
                    body = json.loads(resp.read())
                    log(f"  API 注册结果: {body.get('ok')} msg={body.get('msg')}")
                    if body.get("ok"):
                        d = body["data"]
                        page.evaluate(f"""() => {{
                            var u = {json.dumps(d)};
                            localStorage.setItem('campus_wall_user', JSON.stringify(u));
                            localStorage.setItem('campus_user_token', u.token || '');
                            localStorage.removeItem('newbieGuideShown');
                            window.currentUser = u;
                        }}""")
                        page.evaluate("hideLoginModal(); updateUserBar(); _spotlight.step=0; localStorage.removeItem('newbieGuideShown'); setTimeout(()=>showNewbieGuide(),800);")
                        log("  API 注册成功，手动触发引导")
                        ok("0b. API 注册成功 (备用路径)")
                        time.sleep(1.2)
            except Exception as ex:
                fail("0b. API 注册备用路径", str(ex))
                browser.close()
                return

        time.sleep(1.5)  # 等待引导自动弹出

        # ==========================================
        # Step 1 验证: compose-btn 高亮
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Step 1] compose-btn 高亮验证")
        log(f"{'-'*50}")

        s = js_state(page)
        log(f"  state={s}")

        if s["overlayDisplay"] != "none" and s["overlayDisplay"] != "missing":
            ok("1a. Spotlight overlay 可见")
        else:
            fail("1a. Spotlight overlay 可见", f"display={s['overlayDisplay']}")

        if s["tooltipDisplay"] != "none" and s["tooltipDisplay"] != "missing":
            ok("1b. Spotlight tooltip 可见")
        else:
            fail("1b. Spotlight tooltip 可见", f"display={s['tooltipDisplay']}")

        if s["step"] == 0:
            ok("1c. 当前步骤=0 (发帖按钮)")
        else:
            fail("1c. 当前步骤=0 (发帖按钮)", f"step={s['step']}")

        if "发帖子" in s["tooltipText"] or "贴一张" in s["tooltipText"]:
            ok("1d. Tooltip 含'发帖子'")
        else:
            fail("1d. Tooltip 含'发帖子'", f"text={s['tooltipText'][:60]}")

        # 检查 compose-btn 的 rect
        cb = page.evaluate("""() => {
            var e = document.querySelector('.compose-btn');
            if (!e) return null;
            var r = e.getBoundingClientRect();
            return {w:r.width, h:r.height, top:r.top, left:r.left};
        }""")
        log(f"  compose-btn rect: {cb}")
        if cb and cb["w"] > 0 and cb["h"] > 0:
            ok("1e. compose-btn rect 非零")
        else:
            fail("1e. compose-btn rect 非零", f"rect={cb}")

        # ==========================================
        # 点击"知道了" -> 发帖模态框打开
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Action] 点击'知道了' -> 发帖模态框")
        log(f"{'-'*50}")

        try_click_next(page, "Step0 Next")
        time.sleep(1.0)

        modal_open = page.evaluate("() => document.getElementById('modalOverlay').classList.contains('show')")
        log(f"  modalOverlay.show={modal_open}")
        if modal_open:
            ok("2a. 发帖模态框已打开")
        else:
            fail("2a. 发帖模态框已打开", "modal 未打开")
            # 手动打开
            page.evaluate("openModal()")
            time.sleep(0.5)

        # 填写并提交帖子
        note_content = "Playwright引导测试" + ''.join(random.choices(string.ascii_lowercase, k=4))
        log(f"  发帖内容: {note_content}")
        page.fill("#noteInput", note_content)
        page.click(".modal-submit")
        log("  点击'贴上去'按钮")
        time.sleep(1.8)

        # 确认模态框关闭
        modal_closed = not page.evaluate("() => document.getElementById('modalOverlay').classList.contains('show')")
        if modal_closed:
            ok("2b. 发帖后模态框关闭")
        else:
            fail("2b. 发帖后模态框关闭", "模态框仍打开")
            page.evaluate("document.getElementById('modalOverlay').classList.remove('show')")

        # 检查 _justPostedId
        jpid = page.evaluate("() => window._justPostedId")
        log(f"  _justPostedId={jpid}")
        if jpid:
            ok("2c. _justPostedId 有值")
        else:
            fail("2c. _justPostedId 有值", "为 null")

        # ==========================================
        # Step 2 验证: 便利贴卡片高亮
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Step 2] 便利贴卡片高亮验证")
        log(f"{'-'*50}")

        time.sleep(0.5)
        s2 = js_state(page)
        log(f"  state={s2}")

        if s2["step"] == 1:
            ok("3a. 步骤切换到1 (便利贴卡片)")
        else:
            fail("3a. 步骤切换到1 (便利贴卡片)", f"step={s2['step']}")

        if "你的帖子" in s2["tooltipText"] or "帖子已发布" in s2["tooltipText"]:
            ok("3b. Tooltip 含'你的帖子已发布'")
        else:
            fail("3b. Tooltip 含'你的帖子已发布'", f"text={s2['tooltipText'][:60]}")

        # 刚发的卡片是否存在
        if jpid:
            card_exists = page.evaluate(f"() => !!document.querySelector('[data-id=\"{jpid}\"]')")
            if card_exists:
                ok("3c. 刚发的便利贴卡片存在 (data-id)")
            else:
                fail("3c. 刚发的便利贴卡片存在 (data-id)", f"找不到 data-id={jpid}")
                # 打印当前所有便利贴
                notes = page.evaluate("() => Array.from(document.querySelectorAll('.sticky-note')).map(e=>e.dataset.id)")
                log(f"  现有便利贴 data-id: {notes[:5]}")

        # ==========================================
        # 点击"点击查看" -> 打开帖子详情
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Action] 点击'点击查看' -> 帖子详情")
        log(f"{'-'*50}")

        try_click_next(page, "Step1 Next")
        time.sleep(1.5)

        detail_open = page.evaluate("() => document.getElementById('noteDetailOverlay').classList.contains('show')")
        log(f"  noteDetailOverlay.show={detail_open}")
        if detail_open:
            ok("4a. 帖子详情弹窗已打开")
        else:
            fail("4a. 帖子详情弹窗已打开", "overlay 未打开")
            # 手动打开
            if jpid:
                page.evaluate(f"openNoteDetail('{jpid}')")
                time.sleep(0.5)
                detail_open = page.evaluate("() => document.getElementById('noteDetailOverlay').classList.contains('show')")
                log(f"  手动打开后 show={detail_open}")

        # ==========================================
        # Step 3 验证: detailLinkBtn 高亮
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Step 3] detailLinkBtn 高亮验证")
        log(f"{'-'*50}")

        s3 = js_state(page)
        log(f"  state={s3}")

        if s3["step"] == 2:
            ok("5a. 步骤切换到2 (查看详情按钮)")
        else:
            fail("5a. 步骤切换到2 (查看详情按钮)", f"step={s3['step']}")

        if "查看详情" in s3["tooltipText"]:
            ok("5b. Tooltip 含'查看详情'")
        else:
            fail("5b. Tooltip 含'查看详情'", f"text={s3['tooltipText'][:60]}")

        lb = page.evaluate("""() => {
            var e = document.getElementById('detailLinkBtn');
            if (!e) return null;
            var r = e.getBoundingClientRect();
            return {w:r.width, h:r.height};
        }""")
        log(f"  detailLinkBtn rect={lb}")
        if lb and lb["w"] > 0:
            ok("5c. detailLinkBtn rect 非零")
        else:
            fail("5c. detailLinkBtn rect 非零", f"rect={lb}")

        # ==========================================
        # 点击"下一步" -> step3
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Action] 点击'下一步' step2->3")
        log(f"{'-'*50}")

        try_click_next(page, "Step2 Next")
        time.sleep(0.8)

        # ==========================================
        # Step 4 验证: detailLikeBtn 高亮
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Step 4] detailLikeBtn 高亮验证")
        log(f"{'-'*50}")

        s4 = js_state(page)
        log(f"  state={s4}")

        if s4["step"] == 3:
            ok("7a. 步骤切换到3 (点赞按钮)")
        else:
            fail("7a. 步骤切换到3 (点赞按钮)", f"step={s4['step']}")

        if "点赞" in s4["tooltipText"]:
            ok("7b. Tooltip 含'点赞'")
        else:
            fail("7b. Tooltip 含'点赞'", f"text={s4['tooltipText'][:60]}")

        lkb = page.evaluate("""() => {
            var e = document.getElementById('detailLikeBtn');
            if (!e) return null;
            var r = e.getBoundingClientRect();
            return {w:r.width, h:r.height};
        }""")
        log(f"  detailLikeBtn rect={lkb}")
        if lkb and lkb["w"] > 0:
            ok("7c. detailLikeBtn rect 非零")
        else:
            fail("7c. detailLikeBtn rect 非零", f"rect={lkb}")

        # ==========================================
        # 点击"下一步" -> step4 (头像)，详情关闭
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Action] 点击'下一步' step3->4 (关闭详情)")
        log(f"{'-'*50}")

        try_click_next(page, "Step3 Next")
        time.sleep(1.2)

        detail_closed = not page.evaluate("() => document.getElementById('noteDetailOverlay').classList.contains('show')")
        log(f"  详情弹窗关闭={detail_closed}")
        if detail_closed:
            ok("8a. step3->4 后详情弹窗关闭")
        else:
            fail("8a. step3->4 后详情弹窗关闭", "弹窗未关闭")

        # ==========================================
        # Step 5 验证: topUserAvatar 高亮
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Step 5] topUserAvatar 高亮验证")
        log(f"{'-'*50}")

        s5 = js_state(page)
        log(f"  state={s5}")

        if s5["step"] == 4:
            ok("9a. 步骤切换到4 (用户头像)")
        else:
            fail("9a. 步骤切换到4 (用户头像)", f"step={s5['step']}")

        if "个人主页" in s5["tooltipText"] or "头像" in s5["tooltipText"]:
            ok("9b. Tooltip 含'个人主页'")
        else:
            fail("9b. Tooltip 含'个人主页'", f"text={s5['tooltipText'][:60]}")

        av = page.evaluate("""() => {
            var e = document.getElementById('topUserAvatar');
            if (!e) return null;
            var r = e.getBoundingClientRect();
            return {w:r.width, h:r.height};
        }""")
        log(f"  topUserAvatar rect={av}")
        if av and av["w"] > 0:
            ok("9c. topUserAvatar rect 非零")
        else:
            fail("9c. topUserAvatar rect 非零", f"rect={av}")

        # ==========================================
        # 点击"完成！" -> 引导结束
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [Action] 点击'完成！' 结束引导")
        log(f"{'-'*50}")

        # 尝试点击 done 或 next
        done_clicked = False
        for sel in [".spotlight-done", ".spotlight-next"]:
            try:
                btn = page.locator(sel)
                if btn.count() > 0 and btn.is_visible():
                    btn.click(force=True, timeout=3000)
                    done_clicked = True
                    log(f"  点击 {sel} 成功")
                    break
            except Exception:
                pass
        if not done_clicked:
            page.evaluate("hideNewbieGuide()")
            log("  JS 调用 hideNewbieGuide()")

        time.sleep(0.8)

        s_final = js_state(page)
        log(f"  最终 state={s_final}")

        if s_final["overlayDisplay"] == "none" and s_final["tooltipDisplay"] == "none":
            ok("10a. 引导结束 overlay+tooltip 隐藏")
        else:
            fail("10a. 引导结束 overlay+tooltip 隐藏",
                 f"overlay={s_final['overlayDisplay']}, tooltip={s_final['tooltipDisplay']}")

        guide_mark = page.evaluate("() => localStorage.getItem('newbieGuideShown')")
        log(f"  newbieGuideShown={guide_mark}")
        if guide_mark == username:
            ok("10b. localStorage 标记引导已完成")
        else:
            fail("10b. localStorage 标记引导已完成", f"期望={username}, 实际={guide_mark}")

        # ==========================================
        # 重访验证：引导不再弹出
        # ==========================================
        log(f"\n{'-'*50}")
        log("  [验证] 重访不再弹出引导")
        log(f"{'-'*50}")

        page.goto(BASE_URL, wait_until="networkidle")
        time.sleep(1.5)
        sr = js_state(page)
        log(f"  重访 state={sr}")
        if sr["overlayDisplay"] == "none":
            ok("11. 重访引导不再自动弹出")
        else:
            fail("11. 重访引导不再自动弹出", f"overlay display={sr['overlayDisplay']}")

        browser.close()

    # ——— 报告 ———
    log(f"\n{'='*60}")
    log("  [测试报告]")
    log(f"{'='*60}")
    pcount = sum(1 for r in results if r[0]=="PASS")
    fcount = sum(1 for r in results if r[0]=="FAIL")
    log(f"  总计: {len(results)}  PASS: {pcount}  FAIL: {fcount}")
    if bugs_found:
        log("\n  [FAIL 列表]")
        for b in bugs_found:
            log(f"  - {b[0]}: {b[1]}")
    else:
        log("\n  [ALL PASS] 5步引导全部通过！")
    return bugs_found

if __name__ == "__main__":
    try:
        bugs = run_all()
        sys.exit(0 if not bugs else 1)
    except Exception as e:
        log(f"\n[FATAL] {e}")
        traceback.print_exc()
        sys.exit(2)
