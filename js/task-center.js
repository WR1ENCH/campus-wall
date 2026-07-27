/* ===== Task Center - Premium Interactive Module ===== */
(function () {
  'use strict';

  var token = localStorage.getItem('campus_user_token');
  var root = document.getElementById('tcRoot');
  if (!root) return;

  // --- Utility ---
  function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers || {}, token ? { 'x-user-token': token } : {});
    return fetch(url, opts).then(function (r) { return r.json(); });
  }

  function getBeijingDate(d) {
    d = d || new Date();
    var utc = d.getTime() + d.getTimezoneOffset() * 60000;
    return new Date(utc + 8 * 3600000);
  }

  function fmtDate(d) {
    var dd = getBeijingDate(new Date(d));
    return (dd.getMonth() + 1) + '/' + dd.getDate();
  }

  function $(id) { return document.getElementById(id); }

  // --- Icons (inline SVG for key UI elements) ---
  var ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    fire: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 23c-3.5 0-7-2.5-7-7.5 0-3.5 2.5-6 4-8 .5 2.5 2 3.5 3 3.5-1-3 0-7 2.5-10 1 2 2.5 4 2.5 6 2-1.5 3.5-4 3.5-6.5C20.5 3 22 4.5 22 7c0 4.5-3 8-5 10 .5 2 0 4-1.5 5S13.5 23 12 23z"/></svg>',
    coin: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill="#d4a029"/><text x="12" y="16" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff">¢</text></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="#34a853" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 01-2 2H7a2 2 0 01-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 010-5A4.8 8 0 0112 8a4.8 8 0 014.5-5 2.5 2.5 0 010 5"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 1012 0V2Z"/></svg>',
  };
  // --- Task / Achievement emoji → SVG map ---
  var TASK_ICONS = {
    '\u270D\uFE0F': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    '\uD83D\uDCAC': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    '\uD83D\uDCA1': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>',
    '\u2764\uFE0F': '<svg viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
    '\uD83E\uDD2B': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    '\uD83D\uDC40': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    '\uD83D\uDCF1': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
    '\uD83D\uDD0D': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    '\uD83D\uDD14': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    '\u2B50': '<svg viewBox="0 0 24 24" fill="#f5c518" stroke="#f5c518" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    '\uD83C\uDF1F': '<svg viewBox="0 0 24 24" fill="#f5c518" stroke="#f5c518" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/><circle cx="12" cy="12" r="2" fill="#fff"/></svg>',
    '\uD83C\uDFC5': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8m-4-4v4m-2-8a4 4 0 118 0c0 2-2 3-2 5h-4c0-2-2-3-2-5z"/><circle cx="12" cy="5" r="3"/></svg>',
    '\uD83C\uDFAF': '<svg viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    '\uD83D\uDC51': '<svg viewBox="0 0 24 24" fill="#f5c518" stroke="#d4a029" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 17l10-12 10 12H2z"/><circle cx="12" cy="14" r="2" fill="#fff" stroke="#d4a029"/><path d="M5 17l7-8.5L19 17"/></svg>',
    '\uD83E\uDD8B': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 6 4 8 4 12c0 4 3.5 8 8 10 4.5-2 8-6 8-10 0-4-4-6-8-10z"/><path d="M12 2v20"/><path d="M4 12h16"/></svg>',
    '\uD83D\uDD2D': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3l-4.5 4.5"/><circle cx="10" cy="10" r="6"/><path d="M3 21l4.5-4.5"/><line x1="17.5" y1="8.5" x2="21" y2="5"/></svg>',
    '\uD83D\uDEE1\uFE0F': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  };
  function resolveIcon(emoji) { return TASK_ICONS[emoji] || emoji; }

  // --- State ---
  var state = {
    calendar: [],
    streak: 0,
    checkedToday: false,
    tasks: [],
    achievements: [],
  };

  // --- Render Page Shell ---
  function renderShell() {
    root.innerHTML =
      '<header class="tc-header">' +
        '<a href="/" class="tc-back">' + ICONS.back + ' 返回</a>' +
        '<span class="tc-title">任务中心</span>' +
        '<div class="tc-streak-badge" id="tcStreakBadge"></div>' +
      '</header>' +
      '<section class="tc-section" id="tcCheckinSection"></section>' +
      '<section class="tc-section" id="tcTasksSection"></section>' +
      '<section class="tc-section" id="tcAchieveSection"></section>';
  }

  // --- Check-in Section ---
  function renderCheckinSection() {
    var sec = $('tcCheckinSection');
    var today = getBeijingDate();
    var year = today.getFullYear();
    var month = today.getMonth();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var firstDay = new Date(year, month, 1).getDay();
    var checkedDates = state.calendar.map(function (r) { return r.date; });
    var weekdays = ['日', '一', '二', '三', '四', '五', '六'];

    // Build calendar grid
    var calHtml = '<div class="tc-calendar">';
    // Weekday headers
    for (var w = 0; w < 7; w++) {
      calHtml += '<div class="tc-calendar-weekday">' + weekdays[w] + '</div>';
    }
    // Empty cells
    for (var e = 0; e < firstDay; e++) {
      calHtml += '<div class="tc-calendar-day empty"></div>';
    }
    // Day cells
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var cls = 'tc-calendar-day';
      if (checkedDates.indexOf(dateStr) !== -1) cls += ' checked';
      if (d === today.getDate()) cls += ' today';
      calHtml += '<div class="' + cls + '">' + d + '</div>';
    }
    calHtml += '</div>';

    // Milestone progress
    var milestones = [7, 30, 100, 365];
    var nextMs = milestones.find(function (m) { return m > state.streak; }) || 365;
    var prevMs = 0;
    for (var i = milestones.length - 1; i >= 0; i--) {
      if (milestones[i] <= state.streak) { prevMs = milestones[i]; break; }
    }
    var msProgress = nextMs > prevMs ? ((state.streak - prevMs) / (nextMs - prevMs)) * 100 : 100;

    var html =
      '<div class="tc-checkin-card">' +
        '<div class="tc-checkin-top">' +
          '<span class="tc-checkin-label">每日签到</span>' +
          (state.streak > 0 ?
            '<div class="tc-checkin-streak">' + ICONS.fire +
              '<span>连续</span><span class="tc-checkin-streak-num">' + state.streak + '</span><span>天</span>' +
            '</div>' : '') +
        '</div>' +
        calHtml +
        '<div class="tc-checkin-btn-wrap">' +
          '<button class="tc-checkin-btn" id="tcCheckinBtn"' + (state.checkedToday ? ' disabled' : '') + '>' +
            '<span class="btn-shimmer"></span>' +
            (state.checkedToday ? '已签到 ✓' : '✨ 今日签到') +
          '</button>' +
        '</div>' +
        (state.streak > 0 ?
          '<div class="tc-milestone">' +
            '<div class="tc-milestone-header">' +
              '<span>距下一里程碑</span>' +
              '<span>' + state.streak + ' / ' + nextMs + ' 天</span>' +
            '</div>' +
            '<div class="tc-milestone-bar">' +
              '<div class="tc-milestone-fill" style="width:' + msProgress + '%"></div>' +
            '</div>' +
          '</div>' : '') +
        '<div class="tc-checkin-info" id="tcCheckinInfo">' +
          (state.checkedToday ? '今天已签到，明天继续加油' : '签到获得积分奖励') +
        '</div>' +
      '</div>';

    sec.innerHTML = html;

    // Bind check-in
    var btn = $('tcCheckinBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = '签到中...';
        authFetch('/api/user/checkin', { method: 'POST' }).then(function (res) {
          if (res.ok) {
            state.checkedToday = true;
            showToast('签到成功 +' + res.data.reward + '积分');
            spawnCoinFly(btn);
            loadAll();
          } else {
            showToast(res.msg || '签到失败');
            btn.disabled = false;
            btn.innerHTML = '<span class="btn-shimmer"></span>✨ 今日签到';
          }
        });
      });
    }

    // Update streak badge in header
    var badge = $('tcStreakBadge');
    if (badge && state.streak > 0) {
      badge.innerHTML = ICONS.fire + ' ' + state.streak + '天';
      badge.classList.add('visible');
    }
  }

  // --- Tasks Section ---
  function renderTasksSection() {
    var sec = $('tcTasksSection');
    if (!state.tasks.length) {
      sec.innerHTML =
        '<div class="tc-section-header"><span class="tc-section-title">每日任务</span></div>' +
        '<div class="tc-empty"><div class="tc-empty-icon">' + ICONS.clipboard + '</div>今日任务加载中...</div>';
      return;
    }

    var completedAll = state.tasks.every(function (t) { return t.claimed || t.completed; });
    var claimedCount = state.tasks.filter(function (t) { return t.claimed; }).length;

    var html =
      '<div class="tc-section-header">' +
        '<span class="tc-section-title">每日任务</span>' +
        '<span class="tc-section-extra">' + claimedCount + '/' + state.tasks.length + ' 已完成</span>' +
      '</div>' +
      '<div class="tc-tasks-list">';

    state.tasks.forEach(function (t, idx) {
      var pct = t.targetCount > 0 ? Math.min(100, Math.round(t.currentCount / t.targetCount * 100)) : 0;
      var isComplete = !!t.completed;
      var isClaimed = !!t.claimed;
      var cardCls = 'tc-task-card';
      if (isClaimed) cardCls += ' claimed';
      else if (isComplete) cardCls += ' completed';

      html +=
        '<div class="' + cardCls + '" style="animation-delay:' + (idx * 0.06) + 's">' +
          '<div class="tc-task-icon">' + resolveIcon(t.taskIcon || '') + '</div>' +
          '<div class="tc-task-body">' +
            '<div class="tc-task-name">' + t.taskTitle + '</div>' +
            '<div class="tc-task-desc">' + t.taskDescription + '</div>' +
            '<div class="tc-task-progress">' +
              '<div class="tc-task-progress-fill' + (isComplete ? ' full' : '') + '" style="width:' + pct + '%"></div>' +
            '</div>' +
          '</div>' +
          '<div class="tc-task-reward">' +
            '<div class="tc-task-reward-num">' + ICONS.coin + ' +' + t.reward + '</div>' +
          '</div>' +
          '<div class="tc-task-action">' +
            (isClaimed ?
              '<span class="tc-claimed-tag">' + ICONS.check + ' 已领取</span>' :
              '<button class="tc-claim-btn" data-id="' + t.id + '"' + (!isComplete ? ' disabled' : '') + '>' +
                (isComplete ? '领取' : t.currentCount + '/' + t.targetCount) +
              '</button>') +
          '</div>' +
        '</div>';
    });

    html += '</div>';
    sec.innerHTML = html;

    // Bind claim buttons
    sec.addEventListener('click', function (e) {
      var btn = e.target.closest('.tc-claim-btn');
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      btn.textContent = '领取中...';
      authFetch('/api/user/daily-tasks/' + btn.dataset.id + '/claim', { method: 'POST' }).then(function (r) {
        if (r.ok) {
          showToast('+' + r.reward + '积分 已到账');
          spawnCoinFly(btn);
          loadAll();
        } else {
          showToast(r.msg || '领取失败');
          btn.disabled = false;
          btn.textContent = '领取';
        }
      });
    });
  }
  // --- Achievements ---
  function renderAchieveSection() {
    var sec = $('tcAchieveSection');
    if (!state.achievements.length) {
      sec.innerHTML =
        '<div class="tc-section-header"><span class="tc-section-title">成就</span></div>' +
        '<div class="tc-empty"><div class="tc-empty-icon">' + ICONS.trophy + '</div>暂无成就数据</div>';
      return;
    }

    var unlockedCount = state.achievements.filter(function (a) { return a.unlocked; }).length;

    var html =
      '<div class="tc-section-header">' +
        '<span class="tc-section-title">成就</span>' +
        '<span class="tc-section-extra">' + unlockedCount + '/' + state.achievements.length + ' 已解锁</span>' +
      '</div>' +
      '<div class="tc-achievements-grid">';

    state.achievements.forEach(function (a, idx) {
      var cls = 'tc-achievement-card ' + (a.unlocked ? 'unlocked' : 'locked');
      html +=
        '<div class="' + cls + '" style="animation-delay:' + (idx * 0.05) + 's">' +
          '<span class="tc-achievement-icon">' + resolveIcon(a.icon) + '</span>' +
          '<div class="tc-achievement-name">' + a.name + '</div>' +
          '<div class="tc-achievement-desc">' + a.description + '</div>' +
          (a.unlocked && a.unlockedAt ?
            '<div class="tc-achievement-date">' + fmtDate(a.unlockedAt) + '</div>' :
            '<div class="tc-achievement-date">' + a.progress + '/' + a.target + '</div>') +
        '</div>';
    });

    html += '</div>';
    sec.innerHTML = html;
  }

  var toastTimer = null;
  function showToast(msg) {
    var old = document.querySelector('.tc-toast');
    if (old) old.remove();
    clearTimeout(toastTimer);

    var el = document.createElement('div');
    el.className = 'tc-toast';
    el.textContent = msg;
    document.body.appendChild(el);

    toastTimer = setTimeout(function () {
      el.classList.add('leaving');
      setTimeout(function () { el.remove(); }, 300);
    }, 2500);
  }
  function spawnCoinFly(fromEl) {
    var rect = fromEl.getBoundingClientRect();
    var coin = document.createElement('div');
    coin.className = 'tc-coin-fly';
    coin.innerHTML = ICONS.coin;
    coin.style.left = rect.left + rect.width / 2 - 10 + 'px';
    coin.style.top = rect.top + 'px';
    document.body.appendChild(coin);
    setTimeout(function () { coin.remove(); }, 900);
  }

  // --- Data Loading ---
  function loadCheckin() {
    var today = getBeijingDate();
    var yearMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    return authFetch('/api/user/checkin-calendar?month=' + yearMonth).then(function (res) {
      if (res.ok) {
        state.calendar = res.data || [];
        var lastRecord = state.calendar.length > 0 ? state.calendar[state.calendar.length - 1] : null;
        state.streak = lastRecord ? lastRecord.streak : 0;
        var todayStr = getBeijingDate().toISOString().slice(0, 10);
        state.checkedToday = state.calendar.some(function (r) { return r.date === todayStr; });
      }
    });
  }

  function loadTasks() {
    return authFetch('/api/user/daily-tasks').then(function (res) {
      if (res.ok) {
        state.tasks = res.tasks || [];
      }
    });
  }


  function loadAchievements() {
    return authFetch('/api/user/achievements').then(function (res) {
      if (res.ok) {
        state.achievements = res.achievements || [];
      }
    });
  }

  function loadAll() {
    Promise.all([
      loadCheckin(),
      loadTasks(),
      loadAchievements(),
    ]).then(function () {
      renderCheckinSection();
      renderTasksSection();
      renderAchieveSection();
    });
  }


  // --- Init ---
  renderShell();
  loadAll();
})();
