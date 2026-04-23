/**
 * notifications.js — نظام Toast + Drawer للإشعارات
 * يعتمد على notifications.css
 * API عامة: NotifToast.show / NotifDrawer.open ...
 */

(function (global) {
  'use strict';

  // ─── أدوات مساعدة ─────────────────────────────────────
  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** وقت عرض قصير للتوست */
  function formatToastTime(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /** تجميع «اليوم / أمس / هذا الأسبوع» */
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }

  /** تجميع حسب اليوم / أمس / آخر 7 أيام / أقدم */
  function bucketFor(ts) {
    var t0 = startOfDay(new Date());
    var t1 = startOfDay(new Date(ts));
    var dayMs = 86400000;
    var diffDays = Math.round((t0 - t1) / dayMs);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays >= 2 && diffDays < 7) return 'week';
    return 'older';
  }

  function relMinutesAgo(ts) {
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m <= 0) return 'الآن';
    if (m === 1) return 'منذ دقيقة';
    if (m < 60) return 'منذ ' + m + ' دقائق';
    const h = Math.floor(m / 60);
    if (h === 1) return 'منذ ساعة';
    if (h < 24) return 'منذ ' + h + ' ساعات';
    const d = Math.floor(h / 24);
    return 'منذ ' + d + ' يوم';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureToastStack() {
    let el = document.getElementById('notif-toast-stack');
    if (!el) {
      el = document.createElement('div');
      el.id = 'notif-toast-stack';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  // ─── NotifToast ───────────────────────────────────────
  var _toastId = 0;
  var _toasts = new Map();

  var ICONS = {
    success: '✓',
    warning: '↩',
    danger: '⚠',
    info: 'ℹ',
  };

  function NotifToast() {}

  /**
   * إظهار Toast
   * @param {{ type: string, title: string, message?: string, duration?: number }} opts
   */
  NotifToast.show = function (opts) {
    opts = opts || {};
    var type = ['success', 'warning', 'danger', 'info'].indexOf(opts.type) >= 0 ? opts.type : 'info';
    var title = opts.title || '';
    var message = opts.message || '';
    var duration = typeof opts.duration === 'number' ? opts.duration : 5000;
    var id = ++_toastId;
    var stack = ensureToastStack();

    var el = document.createElement('article');
    el.className = 'notif-toast notif-toast--' + type;
    el.dataset.id = String(id);
    el.setAttribute('role', 'status');

    el.innerHTML =
      '<div class="notif-toast__accent"></div>' +
      '<button type="button" class="notif-toast__close" aria-label="إغلاق">✕</button>' +
      '<div class="notif-toast__inner">' +
      '<div class="notif-toast__icon">' +
      ICONS[type] +
      '</div>' +
      '<div class="notif-toast__text">' +
      '<p class="notif-toast__title"></p>' +
      (message ? '<p class="notif-toast__msg"></p>' : '') +
      '<div class="notif-toast__time"></div>' +
      '</div></div>' +
      '<div class="notif-toast__progress"><div class="notif-toast__progress-fill"></div></div>';

    el.querySelector('.notif-toast__title').textContent = title;
    if (message) el.querySelector('.notif-toast__msg').textContent = message;
    el.querySelector('.notif-toast__time').textContent = formatToastTime(new Date());

    var fill = el.querySelector('.notif-toast__progress-fill');
    var closeBtn = el.querySelector('.notif-toast__close');

    var state = {
      remain: duration,
      interval: null,
      closed: false,
    };

    function tick() {
      if (state.closed) return;
      state.remain -= 50;
      var p = Math.max(0, state.remain / duration) * 100;
      fill.style.width = p + '%';
      if (state.remain <= 0) {
        clearInterval(state.interval);
        state.interval = null;
        NotifToast.dismiss(id);
      }
    }

    function startTimer(resetFill) {
      clearInterval(state.interval);
      if (resetFill) fill.style.width = '100%';
      state.interval = setInterval(tick, 50);
    }

    function pauseTimer() {
      clearInterval(state.interval);
      state.interval = null;
    }

    el.addEventListener('mouseenter', function () {
      pauseTimer();
    });
    el.addEventListener('mouseleave', function () {
      if (!state.closed) startTimer(false);
    });

    closeBtn.addEventListener('click', function () {
      NotifToast.dismiss(id);
    });

    stack.appendChild(el);
    startTimer(true);
    _toasts.set(id, { el: el, state: state });

    return id;
  };

  NotifToast.dismiss = function (id) {
    var t = _toasts.get(id);
    if (!t) return;
    var el = t.el;
    var st = t.state;
    if (st.closed) return;
    st.closed = true;
    clearInterval(st.interval);
    st.interval = null;
    el.classList.add('notif-toast--out');
    setTimeout(function () {
      el.remove();
      _toasts.delete(id);
    }, 280);
  };

  NotifToast.dismissAll = function () {
    _toasts.forEach(function (_, id) {
      NotifToast.dismiss(id);
    });
  };

  // ─── NotifDrawer ──────────────────────────────────────
  function buildDrawerDOM() {
    if (document.getElementById('notif-drawer')) return;

    var overlay = document.createElement('div');
    overlay.id = 'notif-drawer-overlay';
    overlay.addEventListener('click', function () {
      NotifDrawer.close();
    });

    var drawer = document.createElement('aside');
    drawer.id = 'notif-drawer';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML =
      '<header class="notif-drawer__header">' +
      '<div class="notif-drawer__head-row">' +
      '<h2 class="notif-drawer__title">الإشعارات <span class="notif-drawer__badge" id="notif-drawer-badge">0</span></h2>' +
      '<button type="button" class="notif-drawer__close" id="notif-drawer-x" aria-label="إغلاق">✕</button>' +
      '</div>' +
      '<p class="notif-drawer__updated" id="notif-drawer-updated">آخر تحديث: —</p>' +
      '<div class="notif-drawer__filters">' +
      '<button type="button" class="notif-drawer__filter is-active" data-filter="all">الكل</button>' +
      '<button type="button" class="notif-drawer__filter" data-filter="money">مالية</button>' +
      '<button type="button" class="notif-drawer__filter" data-filter="system">نظام</button>' +
      '<button type="button" class="notif-drawer__filter" data-filter="students">طلاب</button>' +
      '</div></header>' +
      '<div class="notif-drawer__search"><input type="search" id="notif-drawer-q" placeholder="بحث في الإشعارات…" /></div>' +
      '<div class="notif-drawer__list" id="notif-drawer-list"></div>' +
      '<footer class="notif-drawer__footer">' +
      '<button type="button" class="notif-drawer__btn-read" id="notif-drawer-readall">تعليم الكل كمقروء</button>' +
      '<button type="button" class="notif-drawer__btn-clear" id="notif-drawer-clearall">مسح الكل</button>' +
      '</footer>';

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    document.getElementById('notif-drawer-x').addEventListener('click', function () {
      NotifDrawer.close();
    });
    document.getElementById('notif-drawer-readall').addEventListener('click', function () {
      NotifDrawer.markAllRead();
    });
    document.getElementById('notif-drawer-clearall').addEventListener('click', function () {
      NotifDrawer.clearAll();
    });

    document.querySelectorAll('.notif-drawer__filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        NotifDrawer._setFilter(btn.getAttribute('data-filter'));
      });
    });

    document.getElementById('notif-drawer-q').addEventListener('input', function () {
      NotifDrawer._renderList();
    });
  }

  var _drawerItems = [];
  var _drawerId = 0;
  var _drawerFilter = 'all';
  var _lastListRefresh = Date.now();

  function NotifDrawer() {}

  NotifDrawer._setFilter = function (f) {
    _drawerFilter = f || 'all';
    document.querySelectorAll('.notif-drawer__filter').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-filter') === _drawerFilter);
    });
    NotifDrawer._renderList();
  };

  NotifDrawer._categoryKey = function (cat) {
    var c = String(cat || '')
      .toLowerCase()
      .trim();
    if (c.indexOf('مال') >= 0 || c === 'finance' || c === 'money') return 'money';
    if (c.indexOf('طالب') >= 0 || c === 'students' || c === 'student') return 'students';
    return 'system';
  };

  NotifDrawer._chipClass = function (key) {
    if (key === 'money') return 'notif-drawer__chip notif-drawer__chip--finance';
    if (key === 'students') return 'notif-drawer__chip notif-drawer__chip--students';
    return 'notif-drawer__chip notif-drawer__chip--system';
  };

  NotifDrawer._chipLabel = function (key) {
    if (key === 'money') return 'مالية';
    if (key === 'students') return 'طلاب';
    return 'نظام';
  };

  NotifDrawer._renderList = function () {
    buildDrawerDOM();
    var listEl = document.getElementById('notif-drawer-list');
    var q = (document.getElementById('notif-drawer-q').value || '').trim().toLowerCase();

    var filtered = _drawerItems.filter(function (it) {
      var ck = NotifDrawer._categoryKey(it.category);
      if (_drawerFilter === 'money' && ck !== 'money') return false;
      if (_drawerFilter === 'system' && ck !== 'system') return false;
      if (_drawerFilter === 'students' && ck !== 'students') return false;
      if (!q) return true;
      var blob = (it.title + ' ' + (it.message || '') + ' ' + (it.category || '')).toLowerCase();
      return blob.indexOf(q) >= 0;
    });

    filtered.sort(function (a, b) {
      return b.createdAt - a.createdAt;
    });

    if (!filtered.length) {
      listEl.innerHTML = '<div class="notif-drawer__empty">لا توجد إشعارات</div>';
      NotifDrawer._updateBadge();
      return;
    }

    var groups = { today: [], yesterday: [], week: [], older: [] };
    filtered.forEach(function (it) {
      var b = bucketFor(it.createdAt);
      if (!groups[b]) b = 'older';
      groups[b].push(it);
    });

    var order = [
      { key: 'today', label: 'اليوم' },
      { key: 'yesterday', label: 'أمس' },
      { key: 'week', label: 'هذا الأسبوع' },
      { key: 'older', label: 'أقدم' },
    ];

    var html = '';
    order.forEach(function (g) {
      var arr = groups[g.key];
      if (!arr || !arr.length) return;
      html += '<div class="notif-drawer__group-title">' + escapeHtml(g.label) + '</div>';
      arr.forEach(function (it) {
        var ck = NotifDrawer._categoryKey(it.category);
        var timeStr = it.time || relMinutesAgo(it.createdAt);
        var unread = it.read ? '' : ' is-unread';
        html +=
          '<div class="notif-drawer__item notif-drawer__item--' +
          escapeHtml(it.type || 'info') +
          unread +
          '" data-nid="' +
          it.id +
          '">' +
          '<span class="notif-drawer__dot"></span>' +
          '<div class="notif-drawer__item-body">' +
          '<p class="notif-drawer__item-title">' +
          escapeHtml(it.title) +
          '</p>' +
          (it.message
            ? '<p class="notif-drawer__item-msg">' + escapeHtml(it.message) + '</p>'
            : '') +
          '<div class="notif-drawer__item-meta">' +
          '<span class="' +
          NotifDrawer._chipClass(ck) +
          '">' +
          escapeHtml(NotifDrawer._chipLabel(ck)) +
          '</span>' +
          '<span class="notif-drawer__item-time">' +
          escapeHtml(timeStr) +
          '</span>' +
          '</div></div></div>';
      });
    });

    listEl.innerHTML = html;
    listEl.querySelectorAll('.notif-drawer__item').forEach(function (row) {
      row.addEventListener('click', function () {
        var nid = parseInt(row.getAttribute('data-nid'), 10);
        NotifDrawer._markOneRead(nid);
      });
    });

    NotifDrawer._updateBadge();
  };

  NotifDrawer._markOneRead = function (id) {
    var it = _drawerItems.find(function (x) {
      return x.id === id;
    });
    if (it) it.read = true;
    NotifDrawer._renderList();
  };

  NotifDrawer._updateBadge = function () {
    buildDrawerDOM();
    var badge = document.getElementById('notif-drawer-badge');
    if (!badge) return;
    var n = NotifDrawer.getUnreadCount();
    badge.textContent = String(n);
    badge.classList.toggle('is-zero', n === 0);
  };

  NotifDrawer._touchUpdated = function () {
    _lastListRefresh = Date.now();
    var el = document.getElementById('notif-drawer-updated');
    if (el) el.textContent = 'آخر تحديث: ' + relMinutesAgo(_lastListRefresh);
  };

  NotifDrawer.open = function () {
    buildDrawerDOM();
    document.getElementById('notif-drawer-overlay').classList.add('is-open');
    document.getElementById('notif-drawer').classList.add('is-open');
    document.getElementById('notif-drawer').setAttribute('aria-hidden', 'false');
    NotifDrawer._touchUpdated();
    NotifDrawer._renderList();
  };

  NotifDrawer.close = function () {
    var o = document.getElementById('notif-drawer-overlay');
    var d = document.getElementById('notif-drawer');
    if (o) o.classList.remove('is-open');
    if (d) {
      d.classList.remove('is-open');
      d.setAttribute('aria-hidden', 'true');
    }
  };

  /**
   * إضافة إشعار للوحة
   * @param {{ type?: string, title: string, message?: string, category?: string, time?: string }} data
   */
  NotifDrawer.addNotif = function (data) {
    data = data || {};
    var id = ++_drawerId;
    var item = {
      id: id,
      type: ['success', 'warning', 'danger', 'info'].indexOf(data.type) >= 0 ? data.type : 'info',
      title: data.title || '',
      message: data.message || '',
      category: data.category || 'نظام',
      time: data.time || '',
      read: false,
      createdAt: Date.now(),
    };
    _drawerItems.unshift(item);
    NotifDrawer._touchUpdated();
    if (document.getElementById('notif-drawer') && document.getElementById('notif-drawer').classList.contains('is-open')) {
      NotifDrawer._renderList();
    }
    NotifDrawer._updateBadge();
    return id;
  };

  NotifDrawer.markAllRead = function () {
    _drawerItems.forEach(function (x) {
      x.read = true;
    });
    NotifDrawer._renderList();
  };

  NotifDrawer.clearAll = function () {
    _drawerItems = [];
    NotifDrawer._renderList();
  };

  NotifDrawer.getUnreadCount = function () {
    return _drawerItems.filter(function (x) {
      return !x.read;
    }).length;
  };

  /** ربط زر الجرس الموجود في الصفحة (اختياري) */
  NotifDrawer.bindBell = function (selector) {
    var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      if (document.getElementById('notif-drawer') && document.getElementById('notif-drawer').classList.contains('is-open')) {
        NotifDrawer.close();
      } else {
        NotifDrawer.open();
      }
    });
  };

  /** تهيئة تلقائية عند التحميل (للتجربة فقط) */
  NotifDrawer.init = function () {
    buildDrawerDOM();
    NotifDrawer._updateBadge();
  };

  global.NotifToast = NotifToast;
  global.NotifDrawer = NotifDrawer;
})(typeof window !== 'undefined' ? window : this);
