/* ===== Task Center - Premium Interactive Module ===== */
(function () {
  'use strict';

  var token = localStorage.getItem('token');
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
  };

  // --- Wheel Config ---
  var SEGMENTS = [
    { label: '5', credit: 5, weight: 25, color: '#f5c518' },
    { label: '10', credit: 10, weight: 20, color: '#e8a530' },
    { label: '20', credit: 20, weight: 15, color: '#d4a029' },
    { label: '30', credit: 30, weight: 10, color: '#c49025' },
    { label: '50', credit: 50, weight: 5, color: '#b07d1e' },
    { label: '80', credit: 80, weight: 3, color: '#8b6514' },
    { label: '100', credit: 100, weight: 2, color: '#6b4c0e' },
    { label: '再来', credit: 0, weight: 20, color: '#5a3d00' },
  ];
  var TOTAL_WEIGHT = SEGMENTS.reduce(function (s, p) { return s + p.weight; }, 0);

  // --- State ---
  var state = {
    calendar: [],
    streak: 0,
    checkedToday: false,
    tasks: [],
    canSpin: false,
    completedCount: 0,
    totalNeeded: 3,
    spinHistory: [],
    achievements: [],
    isSpinning: false,
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
      '<section class="tc-section tc-wheel-section" id="tcWheelSection"></section>' +
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
        '<div class="tc-empty"><div class="tc-empty-icon">📋</div>今日任务加载中...</div>';
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
          '<div class="tc-task-icon">' + (t.taskIcon || '📋') + '</div>' +
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

  // --- Lucky Wheel ---
  function renderWheelSection() {
    var sec = $('tcWheelSection');
    var html =
      '<div class="tc-section-header"><span class="tc-section-title">幸运转盘</span></div>' +
      '<div class="tc-wheel-wrap">' +
        '<div class="tc-wheel-outer">' +
          '<div class="tc-wheel-inner">' +
            '<canvas class="tc-wheel-canvas" id="tcWheelCanvas" width="244" height="244"></canvas>' +
          '</div>' +
        '</div>' +
        '<div class="tc-wheel-pointer"></div>' +
        '<div class="tc-wheel-center' + (!state.canSpin ? ' disabled' : '') + '" id="tcSpinBtn">' +
          (state.canSpin ? '抽奖' : '完成任务') +
        '</div>' +
      '</div>' +
      '<div class="tc-wheel-info" id="tcWheelInfo">' +
        '已完成 <strong>' + state.completedCount + '</strong>/' + state.totalNeeded + ' 个任务' +
        (state.canSpin ? ' · 可以抽奖！' : '') +
      '</div>' +
      renderSpinHistory() +
      '</div>';

    sec.innerHTML = html;
    drawWheel();

    // Bind spin
    var spinBtn = $('tcSpinBtn');
    if (spinBtn && state.canSpin) {
      spinBtn.addEventListener('click', doSpin);
    }
  }

  function renderSpinHistory() {
    if (!state.spinHistory.length) return '';
    var html = '<div class="tc-spin-history"><div class="tc-spin-history-title">最近记录</div>';
    state.spinHistory.slice(0, 5).forEach(function (s) {
      html +=
        '<div class="tc-spin-item">' +
          '<span class="tc-spin-item-reward">' + (s.rewardType === 'spin_again' ? '再来一次' : '+' + s.reward + '积分') + '</span>' +
          '<span class="tc-spin-item-date">' + fmtDate(s.createdAt) + '</span>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  function drawWheel() {
    var canvas = $('tcWheelCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var cx = w / 2, cy = h / 2, r = w / 2 - 4;
    var startAngle = -Math.PI / 2; // Start from top

    ctx.clearRect(0, 0, w, h);

    SEGMENTS.forEach(function (seg, i) {
      var sliceAngle = (seg.weight / TOTAL_WEIGHT) * 2 * Math.PI;
      var endAngle = startAngle + sliceAngle;

      // Draw segment
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();

      // Draw separator line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw text
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px "Noto Sans SC", sans-serif';
      ctx.fillText(seg.label, r - 12, 4);
      ctx.restore();

      startAngle = endAngle;
    });
  }

  function doSpin() {
    if (state.isSpinning) return;
    state.isSpinning = true;
    var spinBtn = $('tcSpinBtn');
    if (spinBtn) {
      spinBtn.classList.add('disabled');
      spinBtn.textContent = '...';
    }

    authFetch('/api/user/lucky-wheel/spin', { method: 'POST' }).then(function (res) {
      state.isSpinning = false;
      if (!res.ok) {
        showToast(res.msg || '抽奖失败');
        if (spinBtn) { spinBtn.classList.remove('disabled'); spinBtn.textContent = '抽奖'; }
        return;
      }

      // Find winning segment index
      var winIdx = SEGMENTS.findIndex(function (s) { return s.label === res.segment.label.replace('积分', ''); });
      if (winIdx === -1) winIdx = 0;

      // Calculate target angle
      var sliceAngle = 360 / SEGMENTS.length;
      var targetAngle = 360 * 5 + (360 - winIdx * sliceAngle - sliceAngle / 2); // 5 full rotations + offset

      var canvas = $('tcWheelCanvas');
      if (canvas) {
        canvas.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
        canvas.style.transformOrigin = 'center center';
        canvas.style.transform = 'rotate(' + targetAngle + 'deg)';
      }

      setTimeout(function () {
        if (res.rewardType === 'spin_again') {
          showToast('🎉 再来一次！');
        } else {
          showToast('🎉 恭喜获得 ' + res.reward + ' 积分');
          spawnConfetti();
        }
        // Reset spin state after animation
        setTimeout(function () {
          loadAll();
        }, 800);
      }, 4200);
    }).catch(function () {
      state.isSpinning = false;
      if (spinBtn) { spinBtn.classList.remove('disabled'); spinBtn.textContent = '抽奖'; }
    });
  }

  // --- Achievements ---
  function renderAchieveSection() {
    var sec = $('tcAchieveSection');
    if (!state.achievements.length) {
      sec.innerHTML =
        '<div class="tc-section-header"><span class="tc-section-title">成就</span></div>' +
        '<div class="tc-empty"><div class="tc-empty-icon">🏆</div>暂无成就数据</div>';
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
          '<span class="tc-achievement-icon">' + a.icon + '</span>' +
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

  // --- Toast ---
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

  // --- Confetti ---
  function spawnConfetti() {
    var container = document.createElement('div');
    container.className = 'tc-confetti-container';
    document.body.appendChild(container);

    var colors = ['#f5c518', '#d4a029', '#34a853', '#e74c3c', '#7c4dff', '#ff9800'];
    for (var i = 0; i < 30; i++) {
      var piece = document.createElement('div');
      piece.className = 'tc-confetti-piece';
      piece.style.left = (Math.random() * 100) + '%';
      piece.style.top = (Math.random() * 30) + '%';
      piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      piece.style.animationDuration = (0.8 + Math.random() * 0.8) + 's';
      piece.style.width = (6 + Math.random() * 6) + 'px';
      piece.style.height = (6 + Math.random() * 6) + 'px';
      container.appendChild(piece);
    }

    setTimeout(function () { container.remove(); }, 2500);
  }

  // --- Coin Fly Animation ---
  function spawnCoinFly(fromEl) {
    var rect = fromEl.getBoundingClientRect();
    var coin = document.createElement('div');
    coin.className = 'tc-coin-fly';
    coin.textContent = '🪙';
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

  function loadWheelInfo() {
    return authFetch('/api/user/lucky-wheel/can-spin').then(function (res) {
      if (res.ok && res.data) {
        state.canSpin = res.data.canSpin;
        state.completedCount = res.data.completedCount;
        state.totalNeeded = res.data.totalNeeded;
      }
    });
  }

  function loadSpinHistory() {
    return authFetch('/api/user/lucky-wheel/history').then(function (res) {
      if (res.ok) {
        state.spinHistory = res.data || [];
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
      loadWheelInfo(),
      loadSpinHistory(),
      loadAchievements(),
    ]).then(function () {
      renderCheckinSection();
      renderTasksSection();
      renderWheelSection();
      renderAchieveSection();
    });
  }

  // --- Init ---
  renderShell();
  loadAll();
})();
