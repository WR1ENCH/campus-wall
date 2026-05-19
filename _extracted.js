
  window.onerror = function(msg, url, line, col, err) {
    alert('JS错误: ' + msg + ' (行:' + line + ')');
    return false;
  };

  // ===== 全局输入过滤：禁止特殊字符 =====
  // 允许的字符：中文、英文、数字、下划线、空格
  // 禁止的字符：~!@#$%^&*()+=[{}]|\\;:'",./<>? 以及反引号
  function sanitizeInput(val) {
    return val.replace(/[~!@#$%^&*()+=\[\]{}|\\;:'",./<>?`]/g, '');
  }
  function onInputFilter(e) {
    const el = e.target;
    const cleaned = sanitizeInput(el.value);
    if (el.value !== cleaned) {
      el.value = cleaned;
      if (!el._warnTimer) {
        showToast('禁止输入特殊符号', 'warning');
        el._warnTimer = setTimeout(() => { el._warnTimer = null; }, 1500);
      }
    }
  }
  // 给所有输入框和文本域绑定过滤（DOMContentLoaded 后执行）
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('input[type="text"], input[type="password"], textarea').forEach(el => {
      el.addEventListener('input', onInputFilter);
    });
  });

  // ===== 常量 =====
  const PAGE_SIZE = 15;
  const TOKEN_KEY = 'campus_admin_token';

  // ===== 状态 =====
  let currentAdmin = null;   // { id, name, role, token }
  let allPosts = [];
  let filteredPosts = [];
  let currentPage = 1;
  let selectedIds = new Set();
  let currentDetailId = null;
  let currentPageId = 'dashboard';
  let allAdmins = [];
  let editingAdminId = null; // 正在编辑的管理员 ID

  // ===== Token 工具 =====
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  function authHeaders() {
    const t = getToken();
    return t ? { 'x-admin-token': t } : {};
  }

  // ===== 登录 =====
  async function doLogin() {
    const id = document.getElementById('loginId').value.trim();
    const pwd = document.getElementById('loginPwd').value;
    if (!id || !pwd) {
      showLoginError('请输入账号和密码');
      return;
    }
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password: pwd })
      });
      const json = await res.json();
      if (!json.ok) {
        showLoginError(json.msg || '登录失败');
        return;
      }
      currentAdmin = json.data;
      setToken(currentAdmin.token);
      localStorage.setItem('campus_admin_name', currentAdmin.name);
      localStorage.setItem('campus_admin_role', currentAdmin.role);
      showMainApp();
    } catch {
      showLoginError('网络错误，请检查服务器');
    }
  }

  function showLoginError(msg) {
    const err = document.getElementById('loginError');
    err.textContent = '❌ ' + msg;
    setTimeout(() => { err.textContent = ''; }, 3000);
  }

  function doLogout() {
    clearToken();
    currentAdmin = null;
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginId').value = '';
    document.getElementById('loginPwd').value = '';
  }

  // ===== 主界面初始化 =====
  async function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';
    showPage('dashboard');

    // 更新用户信息
    document.getElementById('userName').textContent = currentAdmin.name;
    const roleText = currentAdmin.role === 'super' ? '最高管理员' : '管理员';
    document.getElementById('userRole').textContent = roleText;
    document.getElementById('userAvatar').textContent = currentAdmin.role === 'super' ? '👑' : '👤';

    // 超级管理员显示管理员管理入口
    document.getElementById('superAdminNav').style.display =
      currentAdmin.role === 'super' ? 'block' : 'none';

    updateClock();
    setInterval(updateClock, 1000);
    await Promise.all([loadDashboard(), loadPosts()]);
  }

  // ===== 举报处理 =====
  let allReports = [];

  async function loadReports() {
    try {
      const res = await fetch('/api/admin/reports', { headers: authHeaders() });
      const json = await res.json();
      if (!json.ok) throw new Error(json.msg);
      allReports = json.data || [];
      filterReports();
    } catch (e) {
      document.getElementById('reportsBody').innerHTML = '<div class="empty-tip">⚠️ 加载失败：' + escHtml(e.message) + '</div>';
    }
  }

  function filterReports() {
    try {
      const status = document.getElementById('reportStatusFilter').value;
      const filtered = status ? allReports.filter(r => r.status === status) : allReports;

      document.getElementById('reportTotalCount').textContent = allReports.length;
      const pending = allReports.filter(r => r.status === 'pending').length;
      document.getElementById('reportPendingCount').textContent =
        pending > 0 ? `（${pending} 条待处理 🔴）` : '';

      if (filtered.length === 0) {
        document.getElementById('reportsBody').innerHTML = '<div class="empty-tip">暂无相关举报记录</div>';
        return;
      }
      const reportsBody = document.getElementById('reportsBody');

      const html = filtered.map((r, i) => {
        const statusBadge = r.status === 'pending' ? 'badge-danger' :
                              r.status === 'resolved' ? 'badge-admin' : 'badge-super';
        const statusText = r.status === 'pending' ? '待处理' :
                             r.status === 'resolved' ? '已处理' : '已忽略';
        const timeStr = r.createdAt ? new Date(r.createdAt).toLocaleString('zh-CN') : '-';
        const isCommentReport = r.type === 'comment';
        const targetLabel = isCommentReport ? '被举报评论' : '被举报帖';
        const targetContent = isCommentReport ? (r.commentContent || '') : (r.postContent || '');
        const deleteAction = isCommentReport ? 'delete_comment' : 'delete_post';
        const deleteLabel = isCommentReport ? '删除评论' : '删除帖子';
        const actionBtns = r.status === 'pending'
          ? '<button class="btn-view" onclick="handleReport(\'' + r.id.replace(/'/g, "\\'") + '\', \'resolved\', \'' + deleteAction + '\')">' + deleteLabel + '</button>' +
            '<button class="btn-del" onclick="handleReport(\'' + r.id.replace(/'/g, "\\'") + '\', \'ignored\', \'\')">忽略</button>'
          : '<span style="font-size:12px;color:var(--text-sub);">已处理</span>';
        return '<div class="table-row" style="grid-template-columns:36px 1fr 100px 120px 100px 100px 80px;align-items:start;">' +
          '<div>' + (i + 1) + '</div>' +
          '<div style="min-width:0;">' +
            '<div style="font-size:12px;color:var(--accent);margin-bottom:4px;">' + (isCommentReport ? '💬 ' + targetLabel : '📌 ' + targetLabel) + '：' + escHtml(targetContent) + '</div>' +
            '<div style="font-size:12px;color:var(--text-sub);">举报人：' + escHtml(r.reporterName || '') + '</div>' +
            '<div style="font-size:12px;margin-top:4px;color:#92400e;background:var(--yellow);padding:2px 8px;border-radius:4px;display:inline-block;">原因：' + escHtml(r.reason || '') + '</div>' +
          '</div>' +
          '<div class="post-time-cell">' + timeStr + '</div>' +
          '<div><span class="type-badge ' + statusBadge + '">' + statusText + '</span></div>' +
          '<div class="post-time-cell" style="font-size:11px;">' + (r.handledAt ? new Date(r.handledAt).toLocaleString('zh-CN') : '-') + '</div>' +
          '<div class="post-time-cell" style="font-size:11px;">' + escHtml(r.handledBy || '-') + '</div>' +
          '<div class="action-btns">' + actionBtns + '</div>' +
        '</div>';
      }).join('');
      reportsBody.innerHTML = html;
      } catch(e) {
      document.getElementById('reportsBody').innerHTML = '<div class="empty-tip">⚠️ 渲染失败：' + escHtml(e.message) + '</div>';
    }
  }

  async function handleReport(id, status, action) {
    const actionText = status === 'ignored' ? '忽略' : '处理';
    showConfirm('⚠️', actionText + '举报', `确定${actionText}这条举报吗？`, async () => {
      try {
        const res = await fetch('/api/admin/reports/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ status, action })
        });
        const json = await res.json();
        if (json.ok) {
          showToast('✅ 举报已' + actionText, 'success');
          loadReports();
          // 刷新帖子列表（可能删了帖）
          loadPosts();
          // 刷新评论列表（可能删了评论）
          loadComments();
        } else showToast('❌ ' + (json.msg || '操作失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    });
  }

  // ===== 评论管理 =====
  let allComments = [];
  let selectedCommentIds = [];

  async function loadComments() {
    try {
      const res = await fetch('/api/admin/comments', { headers: authHeaders() });
      const json = await res.json();
      if (!json.ok) throw new Error(json.msg);
      allComments = json.data || [];
      document.getElementById('commentTotalCount').textContent = allComments.length;
      filterComments();
    } catch (e) {
      document.getElementById('commentsBody').innerHTML = '<div class="empty-tip">⚠️ 加载失败：' + escHtml(e.message) + '</div>';
    }
  }

  function filterComments() {
    const kw = (document.getElementById('commentSearchInput').value || '').trim().toLowerCase();
    const filtered = kw
      ? allComments.filter(c =>
          (c.author || '').toLowerCase().includes(kw) ||
          (c.content || '').toLowerCase().includes(kw) ||
          (c.postContent || '').toLowerCase().includes(kw)
        )
      : allComments;
    const countEl = document.getElementById('commentFilteredCount');
    if (kw && filtered.length !== allComments.length) {
      countEl.textContent = '（筛选 ' + filtered.length + ' 条）';
    } else {
      countEl.textContent = '';
    }
    renderComments(filtered);
  }

  function renderComments(comments) {
    const body = document.getElementById('commentsBody');
    if (!comments || comments.length === 0) {
      body.innerHTML = '<div class="empty-tip">暂无评论</div>';
      return;
    }
    body.innerHTML = comments.map((c, i) => {
      const timeStr = new Date(c.time).toLocaleString('zh-CN');
      return '<div class="table-row" style="grid-template-columns:30px 1fr 80px 80px 60px;align-items:start;">' +
        '<div><input type="checkbox" class="comment-check" value="' + escHtml(c.id) + '" onchange="updateCommentSelection()"></div>' +
        '<div style="min-width:0;">' +
          '<div style="font-size:13px;margin-bottom:4px;">' + escHtml(c.author || '匿名') + ' <span style="opacity:0.5;">在帖</span>「' + escHtml(c.postContent || '') + '」中</div>' +
          '<div style="font-size:12px;color:var(--text-sub);">' + escHtml(c.avatar || '🙈') + ' 评论：' + escHtml(c.content || '') + '</div>' +
          '<div style="font-size:11px;opacity:0.5;margin-top:4px;">❤️ ' + (c.likes || 0) + '</div>' +
        '</div>' +
        '<div class="post-time-cell">' + timeStr + '</div>' +
        '<div class="action-btns" style="flex-direction:column;gap:4px;">' +
          '<button class="btn-del" style="font-size:11px;padding:3px 8px;" onclick="adminDeleteComment(\'' + c.id.replace(/'/g, "\\'") + '\')">🗑️ 删除</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function updateCommentSelection() {
    selectedCommentIds = Array.from(document.querySelectorAll('.comment-check:checked')).map(cb => cb.value);
    document.getElementById('batchDelCommentsBtn').style.display = selectedCommentIds.length > 0 ? 'inline-block' : 'none';
  }

  async function adminDeleteComment(commentId) {
    showConfirm('⚠️', '删除评论', '确定删除这条评论吗？', async () => {
      try {
        const delRes = await fetch('/api/admin/comments/' + commentId, {
          method: 'DELETE',
          headers: authHeaders()
        });
        const delJson = await delRes.json();
        if (delJson.ok) {
          showToast('✅ 评论已删除', 'success');
          loadComments();
          loadPosts();
        } else showToast('❌ ' + (delJson.msg || '删除失败'), 'error');
      } catch (e) { showToast('❌ ' + e.message, 'error'); }
    });
  }

  async function batchDeleteComments() {
    if (selectedCommentIds.length === 0) return;
    showConfirm('⚠️', '批量删除评论', '确定删除选中的 ' + selectedCommentIds.length + ' 条评论吗？', async () => {
      try {
        const res = await fetch('/api/comments/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ ids: selectedCommentIds })
        });
        const json = await res.json();
        if (json.ok) {
          showToast('✅ 已删除 ' + json.deleted + ' 条评论', 'success');
          selectedCommentIds = [];
          loadComments();
          loadPosts();
        } else showToast('❌ ' + (json.msg || '删除失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    });
  }

  // 自动登录检查
  async function checkSession() {
    try {
      // 先检查是否需要初始化
      const checkRes = await fetch('/api/admin/check-init');
      const checkJson = await checkRes.json();
      if (checkJson.ok && checkJson.data.needInit) {
        // 需要初始化，显示初始化表单
        document.getElementById('loginBox').style.display = 'none';
        document.getElementById('initBox').style.display = 'block';
        return;
      }

      // 检查是否有保存的 token
      const t = getToken();
      if (!t) return;
      const res = await fetch('/api/admin/me', { headers: authHeaders() });
      const json = await res.json();
      if (json.ok) {
        currentAdmin = { ...json.data, token: t };
        showMainApp();
      } else {
        clearToken();
      }
    } catch {
      // 网络错误，静默处理
    }
  }

  // 初始化管理员
  async function doInit() {
    const id = document.getElementById('initId').value.trim();
    const name = document.getElementById('initName').value.trim();
    const pwd = document.getElementById('initPwd').value;
    const pwd2 = document.getElementById('initPwd2').value;
    const errEl = document.getElementById('initError');

    // 验证
    if (!id) { errEl.textContent = '请输入账号'; return; }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
      errEl.textContent = '账号：3-20位字母、数字、下划线';
      return;
    }
    if (!name) { errEl.textContent = '请输入昵称'; return; }
    if (!pwd || pwd.length < 6) { errEl.textContent = '密码至少6位'; return; }
    if (pwd !== pwd2) { errEl.textContent = '两次密码不一致'; return; }

    errEl.textContent = '创建中…';
    try {
      const res = await fetch('/api/admin/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, password: pwd })
      });
      const json = await res.json();
      if (json.ok) {
        // 保存 token 并登录
        setToken(json.data.token);
        currentAdmin = json.data;
        localStorage.setItem('campus_admin_name', currentAdmin.name);
        localStorage.setItem('campus_admin_role', currentAdmin.role);
        showMainApp();
      } else {
        errEl.textContent = json.msg || '创建失败';
      }
    } catch {
      errEl.textContent = '网络错误，请检查服务器';
    }
  }

    // ===== 同学认证审核 =====
    async function loadZhixuePending() {
      try {
        const res = await fetch('/api/admin/zhixue-pending', { headers: authHeaders() });
        const json = await res.json();
        if (!json.ok) { document.getElementById('zhixueBody').innerHTML = '<div class="error">' + json.msg + '</div>'; return; }
        const list = json.data || [];
        document.getElementById('zhixuePendingCount').textContent = list.length;
        if (list.length === 0) {
          document.getElementById('zhixueBody').innerHTML = '<div class="empty">暂无待审核申请</div>';
          return;
        }
        let html = '';
        list.forEach(u => {
          const submittedAt = u.submittedAt ? new Date(u.submittedAt).toLocaleString('zh-CN') : '-';
          const isManual = u.certType === 'manual';
          const typeBadge = isManual
            ? '<span style="background:#f59e0b;color:#fff;padding:2px 7px;border-radius:8px;font-size:11px;font-weight:bold;">📄 手动认证</span>'
            : '<span style="background:#22c55e;color:#fff;padding:2px 7px;border-radius:8px;font-size:11px;font-weight:bold;">🖥️ 智学认证</span>';

          // 认证详细信息
          let certDetail = '';
          if (isManual) {
            certDetail = `
              <div style="font-size:13px; margin-bottom:10px; padding:10px; background:var(--bg-main); border-radius:10px;">
                <div style="font-weight:600; margin-bottom:6px; color:var(--text-main);">说明</div>
                <div style="color:var(--text-sub); white-space:pre-wrap; font-size:13px;">${u.manualNote || '-'}</div>
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                ${(u.manualImages || []).map((src, idx) => `
                  <img src="${src}" onclick="viewCertImage('${src}')"
                    style="width:72px;height:72px;object-fit:cover;border-radius:8px;border:2px solid var(--border);cursor:pointer;"
                    title="点击查看大图">
                `).join('')}
              </div>`;
          } else {
            certDetail = `
              <div style="font-size:13px; color:var(--text-sub); margin-bottom:12px; padding:10px; background:var(--bg-main); border-radius:10px;">
                <div style="margin-bottom:4px;">账号：<strong style="color:var(--text-main);">${u.zhixueUsername || '-'}</strong></div>
                <div>密码：<strong style="color:var(--text-main);">${u.zhixuePassword || '-'}</strong></div>
              </div>`;
          }

          html += `
          <div class="user-card" style="padding:16px; border-bottom:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
              <div class="user-avatar" style="width:40px;height:40px;font-size:18px;">${u.avatar || u.nickname?.charAt(0) || '👤'}</div>
              <div style="flex:1;">
                <div style="font-weight:600; display:flex; align-items:center; gap:8px;">
                  ${u.nickname || '匿名'} ${typeBadge}
                </div>
                <div style="font-size:12px;color:var(--text-sub);">提交时间：${submittedAt}</div>
              </div>
            </div>
            ${certDetail}
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn-primary" style="font-size:12px;padding:6px 14px;" onclick="approveZhixue('${u.id}')">✅ 通过</button>
              <button class="btn-danger" style="font-size:12px;padding:6px 14px;" onclick="rejectZhixue('${u.id}')">❌ 拒绝</button>
            </div>
          </div>
        `;
        });
        document.getElementById('zhixueBody').innerHTML = html;
      } catch (e) {
        document.getElementById('zhixueBody').innerHTML = '<div class="error">加载失败：' + e.message + '</div>';
      }
    }

    // 查看认证图片大图
    function viewCertImage(src) {
      const old = document.getElementById('certImageViewer');
      if (old) old.remove();
      const overlay = document.createElement('div');
      overlay.id = 'certImageViewer';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
      overlay.innerHTML = `<img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:12px;object-fit:contain;">`;
      overlay.onclick = () => overlay.remove();
      document.body.appendChild(overlay);
    }

    async function approveZhixue(userId) {
      if (!confirm(`确定通过此同学认证申请？`)) return;
      try {
        const res = await fetch('/api/admin/zhixue/' + userId + '/review', {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve' })
        });
        const json = await res.json();
        if (json.ok) { alert('已通过审核'); loadZhixuePending(); }
        else alert(json.msg || '操作失败');
      } catch (e) { alert('操作失败：' + e.message); }
    }

  async function rejectZhixue(userId) {
    if (!confirm('确定拒绝该认证申请？')) return;
    try {
      const res = await fetch('/api/admin/zhixue/' + userId + '/review', {
        method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject' })
      });
      const json = await res.json();
      if (json.ok) { alert('已拒绝'); loadZhixuePending(); }
      else alert(json.msg || '操作失败');
    } catch (e) { alert('操作失败：' + e.message); }
  }

    function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent =
      now.toLocaleDateString('zh-CN') + ' ' +
      now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ===== 页面切换 =====
  function showPage(id, navItem) {
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const targetPage = document.getElementById('page-' + id);
    if (targetPage) targetPage.style.display = 'block';
    if (navItem) navItem.classList.add('active');
    currentPageId = id;
    const titles = { dashboard: '数据总览', posts: '帖子管理', users: '用户列表', admins: '管理员管理', reports: '举报处理', comments: '评论管理', discussions: '讨论管理', loginlogs: '登录日志', zhixue: '同学认证审核' };
    document.getElementById('pageTitle').textContent = titles[id] || id;
    if (id === 'admins' && currentAdmin.role === 'super') loadAdmins();
    if (id === 'users') loadUsers();
    if (id === 'reports') { loadReports(); }
    if (id === 'comments') { loadComments(); }
    if (id === 'discussions') { loadDiscussionsAdmin(); }
    if (id === 'loginlogs') { loadLoginLogs(); }
    if (id === 'zhixue') { loadZhixuePending(); }
  }

  function refreshCurrent() {
    if (currentPageId === 'dashboard') loadDashboard();
    else if (currentPageId === 'posts') loadPosts();
    else if (currentPageId === 'admins') loadAdmins();
    else if (currentPageId === 'users') loadUsers();
    else if (currentPageId === 'reports') loadReports();
    else if (currentPageId === 'comments') loadComments();
    else if (currentPageId === 'discussions') loadDiscussionsAdmin();
    else if (currentPageId === 'loginlogs') loadLoginLogs();
    showToast('数据已刷新', 'success');
  }

  // ===== 加载统计 =====
  async function loadDashboard() {
    try {
      const res = await fetch('/api/admin/stats', { headers: authHeaders() });
      const json = await res.json();
      if (!json.ok) throw new Error(json.msg);
      const d = json.data;

      document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card">
          <div class="stat-icon blue">📋</div>
          <div class="stat-body"><div class="stat-value">${d.total}</div><div class="stat-label">帖子总数</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">📅</div>
          <div class="stat-body"><div class="stat-value">${d.today}</div><div class="stat-label">今日发帖</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow">📆</div>
          <div class="stat-body"><div class="stat-value">${d.week}</div><div class="stat-label">本周发帖</div></div>
        </div>
        <div class="stat-card">
          <div class="stat-icon purple">❤️</div>
          <div class="stat-body"><div class="stat-value">${d.totalLikes}</div><div class="stat-label">累计点赞数</div></div>
        </div>
      `;

      const maxVal = Math.max(...d.dailyChart.map(x => x.count), 1);
      document.getElementById('barChart').innerHTML = d.dailyChart.map(item => `
        <div class="bar-item">
          <div class="bar-val">${item.count}</div>
          <div class="bar" style="height:${Math.max(4, (item.count / maxVal) * 120)}px;"></div>
          <div class="bar-label">${item.label}</div>
        </div>
      `).join('');

      const typeColors = { '日常':'#f59e0b','表白':'#ec4899','树洞':'#22c55e','失物招领':'#f97316','活动':'#3b82f6' };
      const typeEmoji = { '日常':'💬','表白':'💕','树洞':'🌳','失物招领':'🔍','活动':'🎉' };
      const maxType = Math.max(...Object.values(d.byType), 1);
      document.getElementById('typeChart').innerHTML = Object.entries(d.byType).map(([name, count]) => `
        <div class="type-row">
          <div class="type-meta">
            <span class="type-name">${typeEmoji[name]} ${name}</span>
            <span class="type-count">${count} 条</span>
          </div>
          <div class="type-bar-bg">
            <div class="type-bar-fill" style="width:${(count/maxType)*100}%;background:${typeColors[name]};"></div>
          </div>
        </div>
      `).join('');
    } catch (e) {
      document.getElementById('statsGrid').innerHTML = '<div class="loading" style="color:#ef4444;">⚠️ 加载失败：' + escHtml(e.message) + '</div>';
    }
  }

  // ===== 加载帖子 =====
  async function loadPosts() {
    try {
      const res = await fetch('/api/posts');
      const json = await res.json();
      if (!json.ok) throw new Error();
      allPosts = json.data;
      applyFilter();
    } catch {
      document.getElementById('postsBody').innerHTML = '<div class="empty-tip">⚠️ 加载失败</div>';
    }
  }

  function applyFilter() {
    const search = document.getElementById('searchInput').value.trim().toLowerCase();
    const type = document.getElementById('typeFilter').value;
    const sort = document.getElementById('sortSelect').value;
    filteredPosts = allPosts.filter(p => {
      const matchType = !type || p.type === type;
      const matchSearch = !search ||
        (p.content && p.content.toLowerCase().includes(search)) ||
        (p.author && p.author.toLowerCase().includes(search));
      return matchType && matchSearch;
    });
    if (sort === 'newest') filteredPosts.sort((a, b) => new Date(b.time) - new Date(a.time));
    else if (sort === 'oldest') filteredPosts.sort((a, b) => new Date(a.time) - new Date(b.time));
    else if (sort === 'mostLiked') filteredPosts.sort((a, b) => (b.likes||0) - (a.likes||0));
    currentPage = 1;
    selectedIds.clear();
    renderPostsTable();
  }
  function onSearch() { applyFilter(); }
  function onFilter() { applyFilter(); }

  function renderPostsTable() {
    const total = filteredPosts.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);
    const pagePosts = filteredPosts.slice(start, end);

    if (total === 0) {
      document.getElementById('postsBody').innerHTML = '<div class="empty-tip">🤷 没有找到相关帖子</div>';
      document.getElementById('pagination').style.display = 'none';
      document.getElementById('selectedCount').textContent = '已选 0 条';
      return;
    }

    const allSelected = pagePosts.every(p => selectedIds.has(p.id));
    document.getElementById('selectAll').checked = allSelected && pagePosts.length > 0;

    document.getElementById('postsBody').innerHTML = pagePosts.map(post => {
      const timeStr = formatTime(post.time);
      const shortId = post.id ? post.id.slice(-6) : '-';
      const isSelected = selectedIds.has(post.id);
      return `
        <div class="table-row posts-row ${isSelected ? 'selected' : ''}" id="row-${post.id}">
          <div><input type="checkbox" ${isSelected?'checked':''} onchange="toggleSelect('${post.id}', this)"></div>
          <div><span class="type-badge badge-${post.type}">${typeEmoji(post.type)} ${post.type}</span></div>
          <div class="post-content-cell" title="${escHtml(post.content||'')}">${escHtml(post.content||'')}</div>
          <div class="post-author-cell">${post.avatar||''} ${escHtml(post.author||'匿名')}</div>
          <div class="post-likes-cell">❤️ ${post.likes||0}</div>
          <div class="post-time-cell">${timeStr}</div>
          <div class="post-time-cell" style="font-family:monospace;font-size:11px;">${shortId}</div>
          <div class="action-btns">
            <button class="btn-view" onclick="viewDetail('${post.id}')">查看</button>
            <button class="btn-del" onclick="deletePost('${post.id}')">删除</button>
          </div>
        </div>
      `;
    }).join('');

    const pgInfo = document.getElementById('paginationInfo');
    pgInfo.textContent = `共 ${total} 条，第 ${start+1}–${end} 条`;
    document.getElementById('pagination').style.display = 'flex';

    let btnHtml = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage<=1?'disabled':''}>‹</button>`;
    const range = pageRange(currentPage, totalPages);
    range.forEach(p => {
      if (p === '…') btnHtml += `<button class="page-btn" disabled>…</button>`;
      else btnHtml += `<button class="page-btn ${p===currentPage?'active':''}" onclick="goPage(${p})">${p}</button>`;
    });
    btnHtml += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage>=totalPages?'disabled':''}>›</button>`;
    document.getElementById('paginationBtns').innerHTML = btnHtml;
    document.getElementById('selectedCount').textContent = `已选 ${selectedIds.size} 条`;
  }

  function pageRange(cur, total) {
    if (total <= 7) return Array.from({length: total}, (_, i) => i+1);
    const pages = new Set([1, total, cur, cur-1, cur+1].filter(p => p >= 1 && p <= total));
    const sorted = [...pages].sort((a, b) => a-b);
    const result = [];
    let prev = 0;
    for (const p of sorted) {
      if (p - prev > 1) result.push('…');
      result.push(p);
      prev = p;
    }
    return result;
  }

  function goPage(p) {
    const total = Math.ceil(filteredPosts.length / PAGE_SIZE);
    if (p < 1 || p > total) return;
    currentPage = p;
    renderPostsTable();
  }

  // ===== 选择 =====
  function toggleSelect(id, checkbox) {
    if (checkbox.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    const row = document.getElementById('row-' + id);
    if (row) row.classList.toggle('selected', checkbox.checked);
    document.getElementById('selectedCount').textContent = `已选 ${selectedIds.size} 条`;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pagePosts = filteredPosts.slice(start, start + PAGE_SIZE);
    document.getElementById('selectAll').checked = pagePosts.every(p => selectedIds.has(p.id));
  }

  function toggleSelectAll(checkbox) {
    const start = (currentPage - 1) * PAGE_SIZE;
    const pagePosts = filteredPosts.slice(start, start + PAGE_SIZE);
    pagePosts.forEach(p => {
      if (checkbox.checked) selectedIds.add(p.id);
      else selectedIds.delete(p.id);
    });
    renderPostsTable();
  }

  // ===== 删除帖子 =====
  function deletePost(id) {
    showConfirm('⚠️', '确认删除', '删除后无法恢复，确定要删除这条帖子吗？', async () => {
      try {
        const res = await fetch('/api/posts/' + id, { method:'DELETE', headers: authHeaders() });
        const json = await res.json();
        if (json.ok) {
          allPosts = allPosts.filter(p => p.id !== id);
          selectedIds.delete(id);
          applyFilter();
          showToast('✅ 帖子已删除', 'success');
        } else showToast('❌ ' + (json.msg || '删除失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    });
  }

  function batchDelete() {
    if (selectedIds.size === 0) { showToast('⚠️ 请先选择要删除的帖子'); return; }
    showConfirm('⚠️', '批量删除', `确定删除选中的 <strong>${selectedIds.size}</strong> 条帖子吗？此操作不可撤销！`, async () => {
      try {
        const res = await fetch('/api/posts/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ ids: [...selectedIds] })
        });
        const json = await res.json();
        if (json.ok) {
          const ids = [...selectedIds];
          allPosts = allPosts.filter(p => !ids.includes(p.id));
          selectedIds.clear();
          applyFilter();
          showToast(`✅ 已删除 ${json.deleted} 条帖子`, 'success');
        } else showToast('❌ ' + (json.msg || '删除失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    });
  }

  // ===== 帖子详情 =====
  function viewDetail(id) {
    const post = allPosts.find(p => p.id === id);
    if (!post) return;
    currentDetailId = id;
    const timeStr = post.time ? new Date(post.time).toLocaleString('zh-CN') : '未知';
    document.getElementById('detailBody').innerHTML = `
      <div class="detail-row">
        <div class="detail-label">板块 / 类型</div>
        <div class="detail-value"><span class="type-badge badge-${post.type}">${typeEmoji(post.type)} ${post.type}</span></div>
      </div>
      <div class="detail-row">
        <div class="detail-label">内容</div>
        <div class="detail-content">${escHtml(post.content||'')}</div>
      </div>
      <div class="detail-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div class="detail-label">作者</div>
          <div class="detail-value">${post.avatar||''} ${escHtml(post.author||'匿名')}</div>
        </div>
        <div>
          <div class="detail-label">点赞数</div>
          <div class="detail-value">❤️ ${post.likes||0}</div>
        </div>
      </div>
      <div class="detail-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div class="detail-label">发布时间</div>
          <div class="detail-value" style="font-size:13px;">${timeStr}</div>
        </div>
        <div>
          <div class="detail-label">帖子 ID</div>
          <div class="detail-value" style="font-family:monospace;font-size:12px;">${post.id}</div>
        </div>
      </div>
    `;
    document.getElementById('detailModal').classList.add('show');
  }

  function closeDetail() {
    document.getElementById('detailModal').classList.remove('show');
    currentDetailId = null;
  }

  function deleteFromDetail() {
    if (!currentDetailId) return;
    closeDetail();
    deletePost(currentDetailId);
  }

  // ===== 管理员管理 =====
  async function loadAdmins() {
    try {
      const res = await fetch('/api/admin/list', { headers: authHeaders() });
      const json = await res.json();
      if (!json.ok) throw new Error(json.msg);
      allAdmins = json.data;
      document.getElementById('adminTotalCount').textContent = allAdmins.length;
      renderAdminsTable();
    } catch (e) {
      document.getElementById('adminsBody').innerHTML = '<div class="empty-tip">⚠️ 加载失败：' + escHtml(e.message) + '</div>';
    }
  }

  function renderAdminsTable() {
    document.getElementById('adminsBody').innerHTML = allAdmins.map((a, i) => `
      <div class="table-row admins-row">
        <div class="admin-id-cell">${i + 1}</div>
        <div class="admin-id-cell">${escHtml(a.id)}</div>
        <div class="admin-name-cell">${escHtml(a.name)}</div>
        <div><span class="type-badge badge-${a.role}">${a.role==='super'?'👑 最高管理员':'👤 管理员'}</span></div>
        <div class="post-time-cell">${formatDate(a.createdAt)}</div>
        <div class="action-btns">
          ${a.id !== 'wr1Ench' ? `<button class="btn-edit" onclick="editAdmin('${escHtml(a.id)}')">编辑</button>` : ''}
          ${a.id !== currentAdmin.id && a.id !== 'wr1Ench' ? `<button class="btn-del" onclick="deleteAdmin('${escHtml(a.id)}')">删除</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  function openAddAdminModal() {
    editingAdminId = null;
    document.getElementById('adminModalTitle').textContent = '添加管理员';
    document.getElementById('adminModalBtn').textContent = '确认添加';
    document.getElementById('adminIdField').style.display = 'block';
    document.getElementById('adminIdInput').value = '';
    document.getElementById('adminNameInput').value = '';
    document.getElementById('adminPwdInput').value = '';
    document.getElementById('adminRoleInput').value = 'admin';
    document.getElementById('pwdRequired').style.display = 'inline';
    document.getElementById('pwdHint').textContent = '设置管理员登录密码';
    document.getElementById('adminModal').classList.add('show');
  }

  function editAdmin(id) {
    const admin = allAdmins.find(a => a.id === id);
    if (!admin) return;
    editingAdminId = id;
    document.getElementById('adminModalTitle').textContent = '编辑管理员';
    document.getElementById('adminModalBtn').textContent = '保存修改';
    document.getElementById('adminIdField').style.display = 'none';
    document.getElementById('adminIdInput').value = id;
    document.getElementById('adminNameInput').value = admin.name;
    document.getElementById('adminPwdInput').value = '';
    document.getElementById('adminRoleInput').value = admin.role;
    // 禁止降最高管理员角色
    if (id === 'wr1Ench') {
      document.getElementById('adminRoleInput').disabled = true;
    } else {
      document.getElementById('adminRoleInput').disabled = false;
    }
    document.getElementById('pwdRequired').style.display = 'none';
    document.getElementById('pwdHint').textContent = '留空则保持原密码不变';
    document.getElementById('adminModal').classList.add('show');
  }

  function closeAdminModal() {
    document.getElementById('adminModal').classList.remove('show');
    editingAdminId = null;
    document.getElementById('adminRoleInput').disabled = false;
  }

  async function submitAdminForm() {
    const name = document.getElementById('adminNameInput').value.trim();
    const pwd = document.getElementById('adminPwdInput').value;
    const role = document.getElementById('adminRoleInput').value;

    if (!name) { showToast('⚠️ 昵称不能为空', 'error'); return; }

    if (editingAdminId) {
      // 编辑
      const body = { name };
      if (pwd) body.password = pwd;
      if (role) body.role = role;
      try {
        const res = await fetch('/api/admin/' + editingAdminId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(body)
        });
        const json = await res.json();
        if (json.ok) {
          showToast('✅ 管理员已更新', 'success');
          closeAdminModal();
          loadAdmins();
        } else showToast('❌ ' + (json.msg || '更新失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    } else {
      // 添加
      const id = document.getElementById('adminIdInput').value.trim();
      if (!id) { showToast('⚠️ 账号不能为空', 'error'); return; }
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(id)) {
        showToast('⚠️ 账号格式：3-20位字母、数字、下划线', 'error');
        return;
      }
      if (!pwd || pwd.length < 6) { showToast('⚠️ 密码至少 6 位', 'error'); return; }
      try {
        const res = await fetch('/api/admin/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ id, name, password: pwd, role })
        });
        const json = await res.json();
        if (json.ok) {
          showToast('✅ 管理员已添加', 'success');
          closeAdminModal();
          loadAdmins();
        } else showToast('❌ ' + (json.msg || '添加失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    }
  }

  function deleteAdmin(id) {
    showConfirm('⚠️', '删除管理员', `确定删除管理员账号 <strong>${escHtml(id)}</strong> 吗？该账号将无法再登录。`, async () => {
      try {
        const res = await fetch('/api/admin/' + id, { method: 'DELETE', headers: authHeaders() });
        const json = await res.json();
        if (json.ok) {
          showToast('✅ 管理员已删除', 'success');
          loadAdmins();
        } else showToast('❌ ' + (json.msg || '删除失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    });
  }

  // ===== 用户管理 =====
  let allUsers = [];

  async function loadUsers() {
    try {
      const res = await fetch('/api/admin/users', { headers: authHeaders() });
      const json = await res.json();
      if (!json.ok) { showToast('❌ 加载用户列表失败', 'error'); return; }
      allUsers = json.data;
      filterUsers();
    } catch { showToast('❌ 网络错误', 'error'); }
  }

  function filterUsers() {
    const kw = document.getElementById('userSearchInput').value.trim().toLowerCase();
    const filtered = kw
      ? allUsers.filter(u =>
          u.username.toLowerCase().includes(kw) ||
          u.nickname.toLowerCase().includes(kw))
      : allUsers;
    renderUsers(filtered);
  }

  function renderUsers(users) {
    document.getElementById('userTotalCount').textContent = allUsers.length;
    const banned = allUsers.filter(u => u.status === 'banned').length;
    document.getElementById('userBannedCount').textContent =
      banned > 0 ? `（${banned} 位已封禁）` : '';
    if (users.length === 0) {
      document.getElementById('usersBody').innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--text-sub);font-size:14px;">暂无用户</div>';
      return;
    }
    document.getElementById('usersBody').innerHTML = users.map((u, i) => `
      <div class="table-row users-row">
        <div>${i + 1}</div>
        <div class="admin-id-cell">@${escHtml(u.username)}</div>
        <div class="admin-name-cell">
          <span>${u.avatar || '🙈'}</span> ${escHtml(u.nickname)}
        </div>
        <div>
          <span class="type-badge ${u.status === 'banned' ? 'badge-danger' : 'badge-admin'}">
            ${u.status === 'banned' ? '封禁' : '正常'}
          </span>
        </div>
        <div class="post-likes-cell">${u.postCount}</div>
        <div class="post-time-cell" style="font-size:12px;color:var(--text-sub);">${escHtml(u.regIp || '-')}</div>
        <div class="post-time-cell">${new Date(u.createdAt).toLocaleDateString('zh-CN')}</div>
        <div>
          <button class="action-btn action-reset" onclick="resetUserPassword('${u.id}', '${escHtml(u.username)}')">
            🔑 重置
          </button>
        </div>
        <div>
          <button class="action-btn ${u.status === 'banned' ? 'action-unban' : 'action-ban'}"
                  onclick="toggleUserStatus('${u.id}', '${u.status === 'banned' ? 'active' : 'banned'}')">
            ${u.status === 'banned' ? '解封' : '封禁'}
          </button>
        </div>
        <div>
          <button class="action-btn action-delete" onclick="deleteUser('${u.id}', '${escHtml(u.username)}')">
            删除
          </button>
        </div>
      </div>
    `).join('');
  }

  async function toggleUserStatus(id, status) {
    const label = status === 'banned' ? '封禁' : '解封';
    showConfirm('⚠️', label + '用户', `确定${label}该用户吗？${status === 'banned' ? '封禁后该用户将无法登录。' : ''}`, async () => {
      try {
        const res = await fetch('/api/admin/user/' + id + '/status', {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        const json = await res.json();
        if (json.ok) {
          showToast('✅ 已' + label, 'success');
          loadUsers();
        } else showToast('❌ ' + (json.msg || label + '失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    });
  }

  function deleteUser(id, username) {
    showConfirm('⚠️', '删除用户', `确定删除用户账号 <strong>${escHtml(username)}</strong> 吗？该账号和所有帖子都将被删除。`, async () => {
      try {
        const res = await fetch('/api/admin/user/' + id, { method: 'DELETE', headers: authHeaders() });
        const json = await res.json();
        if (json.ok) {
          const deletedPosts = json.deletedPosts || 0;
          if (deletedPosts > 0) {
            showToast(`✅ 用户已删除，同时删除了 ${deletedPosts} 条帖子`, 'success');
          } else {
            showToast('✅ 用户已删除', 'success');
          }
          loadUsers();
          loadPosts(); // 刷新帖子列表
        } else showToast('❌ ' + (json.msg || '删除失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    });
  }

  async function resetUserPassword(id, username) {
    showConfirm('🔑', '重置密码', `确定重置用户 <strong>${escHtml(username)}</strong> 的密码吗？`, async () => {
      try {
        const res = await fetch('/api/admin/user/' + id + '/reset-password', {
          method: 'POST',
          headers: authHeaders()
        });
        const json = await res.json();
        if (json.ok) {
          document.getElementById('resetPwdUsername').textContent = '@' + username;
          document.getElementById('newPasswordDisplay').textContent = json.data.password;
          document.getElementById('resetPwdModal').classList.add('show');
        } else showToast('❌ ' + (json.msg || '重置失败'), 'error');
      } catch { showToast('❌ 网络错误', 'error'); }
    });
  }

  function closeResetPwdModal() {
    document.getElementById('resetPwdModal').classList.remove('show');
  }

  // ===== 修改密码 =====
  function openChangePwdModal() {
    document.getElementById('oldPwdInput').value = '';
    document.getElementById('newPwdInput').value = '';
    document.getElementById('newPwdInput2').value = '';
    document.getElementById('changePwdError').textContent = '';
    document.getElementById('changePwdModal').classList.add('show');
    setTimeout(() => document.getElementById('oldPwdInput').focus(), 100);
  }
  function closeChangePwdModal() {
    document.getElementById('changePwdModal').classList.remove('show');
  }
  async function doChangePwd() {
    const oldPwd = document.getElementById('oldPwdInput').value;
    const newPwd = document.getElementById('newPwdInput').value;
    const newPwd2 = document.getElementById('newPwdInput2').value;
    const errEl = document.getElementById('changePwdError');

    if (!oldPwd) { errEl.textContent = '请输入旧密码'; return; }
    if (!newPwd || newPwd.length < 6) { errEl.textContent = '新密码至少6位'; return; }
    if (newPwd !== newPwd2) { errEl.textContent = '两次新密码不一致'; return; }

    errEl.textContent = '提交中…';
    try {
      const res = await fetch('/api/admin/change-pwd', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ oldPwd, newPwd })
      });
      const json = await res.json();
      if (json.ok) {
        closeChangePwdModal();
        showToast('密码修改成功，即将重新登录…', 'success');
        setTimeout(() => { clearToken(); location.reload(); }, 1500);
      } else {
        errEl.textContent = json.msg || '修改失败';
      }
    } catch {
      errEl.textContent = '网络错误，请检查服务器';
    }
  }

  // ===== 登录记录 =====
  async function loadLoginLogs() {
    const body = document.getElementById('loginLogsBody');
    body.innerHTML = '<div class="loading"><div class="spinner"></div>加载中…</div>';
    try {
      const res = await fetch('/api/admin/login-logs', { headers: authHeaders() });
      const json = await res.json();
      if (!json.ok) {
        body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-sub);font-size:14px;">加载失败：${escHtml(json.msg || '')}</div>`;
        return;
      }
      const logs = json.data || [];
      document.getElementById('loginLogTotalCount').textContent = logs.length;
      if (logs.length === 0) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-sub);font-size:14px;">暂无登录记录</div>';
        return;
      }
      body.innerHTML = logs.map(log => `
        <div class="table-row" style="display:grid;grid-template-columns:80px 100px 80px 1fr 160px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <div>
            <span class="type-badge ${log.type === 'admin' ? 'badge-admin' : 'badge-normal'}">${log.type === 'admin' ? '管理员' : '用户'}</span>
          </div>
          <div style="font-weight:bold;">${escHtml(log.account || '未登录用户')}</div>
          <div>
            <span class="type-badge ${log.success ? 'badge-success' : 'badge-danger'}">${log.success ? '✅ 成功' : '❌ 失败'}</span>
          </div>
          <div style="color:var(--text-sub);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(log.ua)}">
            <div>IP：${escHtml(log.ip || '-')}</div>
            <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">UA：${escHtml(log.ua || '-')}</div>
          </div>
          <div style="color:var(--text-sub);font-size:12px;">${formatTime(log.time)}</div>
        </div>
      `).join('');
    } catch (e) {
      body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-sub);font-size:14px;">网络错误</div>`;
    }
  }

  // ===== 确认弹窗 =====
  let _confirmCallback = null;
  function showConfirm(icon, title, msg, onOk, primary = false) {
    document.getElementById('confirmIcon').textContent = icon;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').innerHTML = msg;
    _confirmCallback = onOk;
    const okBtn = document.getElementById('confirmOkBtn');
    okBtn.textContent = primary ? '确认' : '确认删除';
    okBtn.className = 'confirm-ok' + (primary ? ' primary' : '');
    okBtn.onclick = () => { closeConfirm(); if (_confirmCallback) _confirmCallback(); };
    document.getElementById('confirmOverlay').classList.add('show');
  }
  function closeConfirm() {
    document.getElementById('confirmOverlay').classList.remove('show');
  }

  // ===== Toast =====
  function showToast(msg, type = '') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  // ===== 工具函数 =====
  function formatTime(isoStr) {
    if (!isoStr) return '未知';
    const now = Date.now();
    const t = new Date(isoStr).getTime();
    const diff = Math.floor((now - t) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';
    return new Date(isoStr).toLocaleDateString('zh-CN');
  }

  function formatDate(isoStr) {
    if (!isoStr) return '-';
    return new Date(isoStr).toLocaleDateString('zh-CN');
  }

  function typeEmoji(type) {
    const map = { '日常':'💬','表白':'💕','树洞':'🌳','失物招领':'🔍','活动':'🎉' };
    return map[type] || '📌';
  }

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ===== 讨论管理 =====
  let allDiscussions = [];
  let currentDiscussionId = null;

  function showDiscussionsPage() {
    // 左侧栏高亮
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector('[onclick*="discussions"]');
    if (navItem) navItem.classList.add('active');
    // 隐藏所有页面，显示讨论页面
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    document.getElementById('page-discussions').style.display = 'block';
    document.getElementById('page-discussion-comments').style.display = 'none';
    loadDiscussionsAdmin();
  }

  async function loadDiscussionsAdmin() {
    try {
      const res = await fetch('/api/discussions');
      const json = await res.json();
      if (!json.ok) throw new Error(json.msg);
      allDiscussions = json.data || [];
      document.getElementById('discussionTotalCount').textContent = allDiscussions.length;
      renderDiscussions(allDiscussions);
    } catch (e) {
      document.getElementById('discussionsBody').innerHTML = '<div class="empty-tip">⚠️ 加载失败：' + escHtml(e.message) + '</div>';
    }
  }

  function renderDiscussions(list) {
    const body = document.getElementById('discussionsBody');
    if (!list || list.length === 0) {
      body.innerHTML = '<div class="empty-tip">暂无讨论话题，请点击上方"创建话题"按钮添加</div>';
      return;
    }
    body.innerHTML = list.map(d => {
      const expires = d.expiresAt ? new Date(d.expiresAt).toLocaleString('zh-CN') : '无限期';
      const isExpired = d.expiresAt && new Date(d.expiresAt) < new Date();
      return `<div class="table-row" style="display:grid;grid-template-columns:1fr 180px 100px 120px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);">
        <div style="font-weight:600;color:${isExpired ? '#9ca3af' : '#1a1a2e'};">${escHtml(d.title)}
          ${isExpired ? '<span style="font-size:11px;color:var(--text-sub);margin-left:6px;">(已过期)</span>' : ''}
        </div>
        <div class="post-time-cell">${expires}</div>
        <div class="post-likes-cell">💬 ${d.commentCount || 0}</div>
        <div class="action-btns">
          <button class="btn-view" onclick="showDiscussionComments('${d.id}')">管理评论</button>
          <button class="btn-edit" onclick="editDiscussion('${d.id}')">编辑</button>
          <button class="btn-del" onclick="deleteDiscussion('${d.id}')">删除</button>
        </div>
      </div>`;
    }).join('');
  }

  function openAddDiscussionModal() {
    currentDiscussionId = null;
    document.getElementById('discussionModalTitle').textContent = '创建话题';
    document.getElementById('discussionModalBtn').textContent = '创建';
    document.getElementById('discussionTitleInput').value = '';
    document.getElementById('discussionExpiresInput').value = '';
    document.getElementById('discussionModal').classList.add('show');
  }

  function editDiscussion(id) {
    const d = allDiscussions.find(x => x.id === id);
    if (!d) return;
    currentDiscussionId = id;
    document.getElementById('discussionModalTitle').textContent = '编辑话题';
    document.getElementById('discussionModalBtn').textContent = '保存';
    document.getElementById('discussionTitleInput').value = d.title || '';
    document.getElementById('discussionExpiresInput').value = d.expiresAt ? d.expiresAt.slice(0, 16) : '';
    document.getElementById('discussionModal').classList.add('show');
  }

  function closeDiscussionModal() {
    document.getElementById('discussionModal').classList.remove('show');
    currentDiscussionId = null;
  }

  async function submitDiscussionForm() {
    const title = document.getElementById('discussionTitleInput').value.trim();
    const expiresAt = document.getElementById('discussionExpiresInput').value || null;
    if (!title) { showToast('⚠️ 标题不能为空', 'error'); return; }
    if (hasSpecialChars(title)) { showToast('⚠️ 标题包含特殊字符', 'error'); return; }

    try {
      const url = currentDiscussionId ? '/api/discussions/' + currentDiscussionId : '/api/discussions';
      const method = currentDiscussionId ? 'PUT' : 'POST';
      const body = currentDiscussionId ? { title, expiresAt } : { title, expiresAt };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.ok) {
        showToast('✅ 操作成功', 'success');
        closeDiscussionModal();
        loadDiscussionsAdmin();
      } else {
        showToast('❌ ' + (json.msg || '操作失败'), 'error');
      }
    } catch (e) {
      showToast('❌ 网络错误', 'error');
    }
  }

  async function deleteDiscussion(id) {
    if (!confirm('确定删除该话题吗？相关评论也会一并删除。')) return;
    try {
      const res = await fetch('/api/discussions/' + id, { method: 'DELETE', headers: authHeaders() });
      const json = await res.json();
      if (json.ok) {
        showToast('✅ 话题已删除', 'success');
        loadDiscussionsAdmin();
      } else {
        showToast('❌ ' + (json.msg || '删除失败'), 'error');
      }
    } catch (e) {
      showToast('❌ 网络错误', 'error');
    }
  }

  function showDiscussionComments(discussionId) {
    currentDiscussionId = discussionId;
    const d = allDiscussions.find(x => x.id === discussionId);
    if (d) {
      document.getElementById('discussionCommentsTitle').textContent = '「' + d.title + '」的评论';
    }
    document.getElementById('page-discussions').style.display = 'none';
    document.getElementById('page-discussion-comments').style.display = 'block';
    loadDiscussionComments();
  }

  function showDiscussionsPage() {
    currentDiscussionId = null;
    document.getElementById('page-discussions').style.display = 'block';
    document.getElementById('page-discussion-comments').style.display = 'none';
  }

  async function loadDiscussionComments() {
    if (!currentDiscussionId) return;
    try {
      const res = await fetch('/api/discussions/' + currentDiscussionId + '/comments');
      const json = await res.json();
      if (!json.ok) throw new Error(json.msg);
      renderDiscussionComments(json.data || []);
    } catch (e) {
      document.getElementById('discussionCommentsBody').innerHTML = '<div class="empty-tip">⚠️ 加载失败：' + escHtml(e.message) + '</div>';
    }
  }

  function renderDiscussionComments(comments) {
    const body = document.getElementById('discussionCommentsBody');
    if (!comments || comments.length === 0) {
      body.innerHTML = '<div class="empty-tip">暂无评论</div>';
      return;
    }
    const flatList = [];
    function flatten(list, level) {
      list.forEach(c => {
        c._level = level;
        flatList.push(c);
        if (c.replies && c.replies.length) flatten(c.replies, level + 1);
      });
    }
    flatten(comments, 0);
    body.innerHTML = flatList.map(c => {
      const bg = c._level > 0 ? 'background:#f8f9ff;' : '';
      const replyTag = c._level > 0 ? '<span style="color:#3d6ce8;font-size:11px;">↳ 回复</span>' : '';
      const reportWarn = c.reportCount > 20 ? '<div style="font-size:11px;color:var(--danger);background:#fee2e2;padding:2px 8px;border-radius:4px;display:inline-block;margin-top:4px;">⚠️ 举报数超标（' + c.reportCount + '）</div>' : '';
      const hiddenTag = c.hidden ? '<span class="type-badge badge-danger">已隐藏</span>' : '';
      return '<div class="table-row" style="display:grid;grid-template-columns:1fr 120px 100px 80px 100px;align-items:flex-start;padding:12px 16px;border-bottom:1px solid var(--border);' + bg + '">' +
        '<div style="min-width:0;">' +
          '<div style="font-size:13px;color:var(--text-sub);">' + escHtml(c.author || '匿名') + ' ' + replyTag + '</div>' +
          '<div style="font-size:13px;margin-top:4px;">' + escHtml(c.content) + '</div>' +
          reportWarn +
        '</div>' +
        '<div class="post-time-cell">' + new Date(c.createdAt).toLocaleString('zh-CN') + '</div>' +
        '<div class="post-likes-cell">' + (c.reportCount || 0) + '</div>' +
        '<div>' + hiddenTag + '</div>' +
        '<div class="action-btns"><button class="btn-del" onclick="deleteDiscussionComment(\'' + c.id + '\')">删除</button></div>' +
      '</div>';
    }).join('');
  }

  async function deleteDiscussionComment(commentId) {
    if (!confirm('确定删除该评论吗？')) return;
    try {
      const res = await fetch('/api/discussions/comments/' + commentId, { method: 'DELETE', headers: authHeaders() });
      const json = await res.json();
      if (json.ok) {
        showToast('✅ 评论已删除', 'success');
        loadDiscussionComments();
      } else {
        showToast('❌ ' + (json.msg || '删除失败'), 'error');
      }
    } catch (e) {
      showToast('❌ 网络错误', 'error');
    }
  }

  // ===== 启动 =====
  checkSession();
