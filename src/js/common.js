/* common.js — window.App：外殼渲染、角色切換、toast/modal、格式化、共用元件工廠、純 SVG 圖表、滾動淡入、路徑
 * 契約：docs/DESIGN.md §3。依賴：icons.js（必要）、data.js（window.DB，選用；未載入時不拋錯）。
 *
 * 摘要：
 *   App.mountShell()                       依 body.app / body.tour / body.home 渲染頂欄、側欄（手機抽屜）、角色切換
 *   App.role / setRole(r) / onRole(cb)     角色 boss / manager / accountant / maintenance（localStorage，try/catch）
 *   App.can(role, dataType) / mask(v, t)   權限矩陣；看不到的值打碼成「••••」＋末 3 碼
 *   App.toast(msg, kind) / modal({...}) / confirm({...})
 *   App.fmt.money / date / dateTime / num / pct / days ； App.today / daysBetween(a, b) / addDays(iso, n)
 *   App.badge / kpi / table / timeline / checklist / phone / alert / emptyState / statRow / progress / tabs / skeleton
 *   App.charts.line(el, opts) / bar(el, opts) / donut(el, opts)   純 SVG，含圖例與 hover 提示
 *   App.reveal()                           .reveal → .is-visible（IntersectionObserver）
 *   App.link(featureId, kind) / linkFromRoot(featureId, kind) / feature(id) / featureGroups() / featureIcon(id)
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- 基本工具 */
  function db() { return (typeof DB !== 'undefined' && DB) ? DB : null; }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name, opts) { return (window.Icons && Icons.get) ? Icons.get(name, opts) : ''; }
  function el(html) { var t = document.createElement('template'); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
  function cls() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  var uid = 0;
  function nextId(prefix) { uid += 1; return (prefix || 'app') + '-' + uid; }

  /* ---------------------------------------------------------------- 日期 */
  var FALLBACK_TODAY = '2026-09-21';
  function todayISO() { var d = db(); return (d && d.today) ? String(d.today) : FALLBACK_TODAY; }
  function parseDate(v) {
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    if (!v) return null;
    var s = String(v).trim();
    var m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/);
    if (!m) { var d0 = new Date(s); return isNaN(d0) ? null : new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()); }
    return new Date(+m[1], +m[2] - 1, m[3] ? +m[3] : 1);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function daysBetween(a, b) {
    var da = parseDate(a), dbb = parseDate(b === undefined ? todayISO() : b);
    if (!da || !dbb) return NaN;
    return Math.round((dbb - da) / 86400000);
  }
  function addDays(iso, n) { var d = parseDate(iso); if (!d) return ''; d.setDate(d.getDate() + (n || 0)); return toISO(d); }

  /* ---------------------------------------------------------------- 格式化 */
  var nf = (function () { try { return new Intl.NumberFormat('zh-TW'); } catch (e) { return null; } })();
  function isMasked(v) { return typeof v === 'string' && v.indexOf('••••') === 0; }
  function num(n, digits) {
    if (isMasked(n)) return n;                        /* 已打碼的值原樣顯示 */
    if (!isNum(n)) return n === null || n === undefined || n === '' ? '—' : String(n);
    if (isNum(digits)) n = Number(n.toFixed(digits));
    return nf ? nf.format(n) : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  var fmt = {
    num: num,
    money: function (n, unit) {
      if (isMasked(n)) return n;
      if (!isNum(n)) return '—';
      var neg = n < 0, s = num(Math.abs(Math.round(n)));
      if (unit === 'NT$') return (neg ? '-' : '') + 'NT$ ' + s;
      return (neg ? '-' : '') + s + ' 元';
    },
    moneyShort: function (n) {
      if (!isNum(n)) return '—';
      var neg = n < 0, a = Math.abs(n);
      if (a >= 1e8) return (neg ? '-' : '') + trim1(a / 1e8) + ' 億';
      if (a >= 1e4) return (neg ? '-' : '') + trim1(a / 1e4) + ' 萬';
      return (neg ? '-' : '') + num(Math.round(a));
    },
    pct: function (x, digits) {
      if (!isNum(x)) return '—';
      var v = Math.abs(x) <= 1 ? x * 100 : x;            /* 0.923 → 92.3%；92.3 → 92.3% */
      var d = isNum(digits) ? digits : 1;
      return trimDigits(v, d) + '%';
    },
    date: function (iso) { var d = parseDate(iso); return d ? d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) : (iso ? String(iso) : '—'); },
    dateTime: function (iso) {
      if (!iso) return '—';
      var s = String(iso), m = s.match(/[T ](\d{1,2}):(\d{2})/);
      return fmt.date(s) + (m ? ' ' + pad2(+m[1]) + ':' + m[2] : '');
    },
    time: function (iso) { var m = String(iso || '').match(/(\d{1,2}):(\d{2})/); return m ? pad2(+m[1]) + ':' + m[2] : '—'; },
    month: function (ym) { var d = parseDate(ym); return d ? d.getFullYear() + '/' + pad2(d.getMonth() + 1) : (ym ? String(ym) : '—'); },
    days: function (n) { return isNum(n) ? num(n) + ' 天' : '—'; },
    ping: function (n) { return isNum(n) ? trim1(n) + ' 坪' : '—'; },
    signed: function (n, digits) { if (!isNum(n)) return '—'; return (n > 0 ? '+' : '') + num(n, digits); }
  };
  function trim1(v) { return String(Math.round(v * 10) / 10); }
  function trimDigits(v, d) { var s = v.toFixed(d); return d > 0 ? s.replace(/\.?0+$/, '') : s; }

  /* ---------------------------------------------------------------- 角色與權限 */
  var ROLES = { boss: '老闆', manager: '租務管理員', accountant: '會計', maintenance: '修繕人員' };
  var ROLE_ORDER = ['boss', 'manager', 'accountant', 'maintenance'];
  var ROLE_ICON = { boss: 'star', manager: 'user-check', accountant: 'wallet', maintenance: 'wrench' };
  var PERMS = {
    boss:        { idNo: true,  bank: true,  rent: true,  deposit: true,  phone: true,  repairCost: true,  ownerRent: true,  salary: true,  audit: true,  pnl: true },
    manager:     { idNo: true,  bank: false, rent: true,  deposit: true,  phone: true,  repairCost: true,  ownerRent: true,  salary: false, audit: true,  pnl: false },
    accountant:  { idNo: false, bank: true,  rent: true,  deposit: true,  phone: false, repairCost: true,  ownerRent: true,  salary: true,  audit: true,  pnl: false },
    maintenance: { idNo: false, bank: false, rent: false, deposit: false, phone: true,  repairCost: true,  ownerRent: false, salary: false, audit: false, pnl: false }
  };
  var STORE_KEY = 'zwzs.role';
  var currentRole = 'boss';
  var roleCbs = [];
  function loadRole() {
    try { var v = window.localStorage.getItem(STORE_KEY); if (v && ROLES[v]) currentRole = v; } catch (e) { /* 私密模式等：沿用預設 */ }
  }
  function saveRole(r) { try { window.localStorage.setItem(STORE_KEY, r); } catch (e) { /* 忽略 */ } }
  function setRole(r, opts) {
    if (!ROLES[r]) return currentRole;
    var changed = r !== currentRole;
    currentRole = r;
    saveRole(r);
    document.documentElement.setAttribute('data-role', r);
    syncRoleSwitches();
    if (changed || (opts && opts.force)) {
      roleCbs.forEach(function (cb) { try { cb(r, ROLES[r]); } catch (e) { console.error(e); } });
    }
    return r;
  }
  function onRole(cb) {
    if (typeof cb !== 'function') return function () {};
    roleCbs.push(cb);
    return function () { var i = roleCbs.indexOf(cb); if (i > -1) roleCbs.splice(i, 1); };
  }
  function can(role, dataType) {
    if (dataType === undefined) { dataType = role; role = currentRole; }
    var p = PERMS[role] || PERMS.boss;
    return Object.prototype.hasOwnProperty.call(p, dataType) ? !!p[dataType] : true;   /* 未列入矩陣的資料不敏感 */
  }
  function mask(value, dataType, role) {
    if (can(role || currentRole, dataType)) return value;
    if (value === null || value === undefined || value === '') return '••••';
    var s = String(isNum(value) ? Math.round(value) : value).replace(/[\s,]/g, '');
    var tail = s.length > 3 ? s.slice(-3) : s;
    return '••••' + tail;
  }
  function roleSwitchHTML() {
    return '<div class="role-switch" role="group" aria-label="切換角色">' + ROLE_ORDER.map(function (r) {
      return '<button type="button" data-role="' + r + '" aria-pressed="' + (r === currentRole) + '"' + (r === currentRole ? ' class="is-active"' : '') + '>' +
        icon(ROLE_ICON[r]) + '<span>' + ROLES[r] + '</span></button>';
    }).join('') + '</div>';
  }
  function syncRoleSwitches() {
    var btns = document.querySelectorAll('.role-switch button[data-role]');
    Array.prototype.forEach.call(btns, function (b) {
      var on = b.getAttribute('data-role') === currentRole;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('is-active', on);
    });
  }

  /* ---------------------------------------------------------------- 功能註冊表與路徑 */
  var FEATURE_ICONS = {
    f01: 'building', f02: 'trend', f03: 'door', f04: 'wallet', f05: 'refresh', f06: 'wind', f07: 'wrench',
    f08: 'droplet', f09: 'key', f10: 'smartphone', f11: 'bot', f12: 'alert', f13: 'shield', f14: 'lock',
    f15: 'sparkles', f16: 'chart', f17: 'doc', f18: 'clipboard', f19: 'bell', f20: 'database'
  };
  var GROUP_ICONS = { 1: 'file', 2: 'chart', 3: 'door', 4: 'wrench', 5: 'message', 6: 'shield', 7: 'database' };
  function features() { var d = db(); return (d && Array.isArray(d.features)) ? d.features : []; }
  function feature(id) {
    var list = features();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function featureIcon(id) { var f = feature(id); return (f && f.icon) || FEATURE_ICONS[id] || 'grid'; }
  function groupParts(g) {
    if (g && typeof g === 'object') return { order: +g.order || +g.id || 0, label: g.name || g.label || '' };
    var s = String(g === undefined || g === null ? '' : g).trim();
    var m = s.match(/^(\d+)\s*[.、:：-]?\s*(.*)$/);
    if (m) return { order: +m[1], label: m[2] || s };
    return { order: 0, label: s };
  }
  function featureGroups() {
    var d = db(), list = features(), map = {}, out = [];
    var labels = {};
    if (d && d.groups) {
      (Array.isArray(d.groups) ? d.groups : Object.keys(d.groups).map(function (k) { var v = d.groups[k]; return typeof v === 'string' ? { id: k, name: v } : Object.assign({ id: k }, v); }))
        .forEach(function (g) { labels[String(g.id !== undefined ? g.id : g.order)] = g.name || g.label; });
    }
    list.forEach(function (f, i) {
      var p = groupParts(f.group);
      var key = p.order ? String(p.order) : (p.label || 'other');
      if (!map[key]) {
        map[key] = { key: key, order: p.order || (100 + i), label: labels[key] || p.label || ('群組 ' + key), icon: GROUP_ICONS[p.order] || 'grid', features: [] };
        out.push(map[key]);
      }
      if (labels[key] && !map[key].label) map[key].label = labels[key];
      map[key].features.push(f);
    });
    out.sort(function (a, b) { return a.order - b.order; });
    return out;
  }
  function pathTo(featureId, kind, base) {
    var f = feature(featureId);
    if (!f) { if (features().length) console.warn('[App.link] 找不到功能：' + featureId); return '#'; }
    var k = kind === 'tour' ? 'tour' : 'app';
    var file = (k === 'app' && f.id === 'f15') ? 'index.html' : f.id + '-' + f.slug + '.html';
    return base + k + '/' + file;
  }
  function currentBase() {
    var b = document.body;
    if (b && b.dataset && b.dataset.base !== undefined) return b.dataset.base;
    return (b && (b.classList.contains('app') || b.classList.contains('tour'))) ? '../' : '';
  }
  function link(featureId, kind) { return pathTo(featureId, kind, currentBase()); }
  function linkFromRoot(featureId, kind) { return pathTo(featureId, kind, ''); }
  function currentFeature() { var id = document.body && document.body.getAttribute('data-feature'); return id ? feature(id) : null; }
  function workCenterCount() {
    var d = db();
    try {
      if (d && typeof d.workCenter === 'function') { var r = d.workCenter(); return Array.isArray(r) ? r.length : (r && Array.isArray(r.items) ? r.items.length : 0); }
    } catch (e) { /* 資料未備妥 */ }
    return 0;
  }

  /* ---------------------------------------------------------------- 外殼 */
  function brandHTML(base) {
    var d = db();
    var sys = (d && d.company && d.company.system) || '租務中樞';
    var co = (d && d.company && d.company.name) || '';
    return '<a class="brand" href="' + base + 'index.html">' + icon('layers') + '<span>' + esc(sys) + '</span>' +
      (co ? '<span class="brand-sub hide-mobile">' + esc(co) + '</span>' : '') + '</a>';
  }
  function sidebarHTML(base, activeId) {
    var groups = featureGroups();
    var count = workCenterCount();
    var pinned = feature('f15');
    var html = '<nav class="sidebar" id="sidebar" aria-label="系統功能" tabindex="-1">';
    if (pinned) {
      html += '<a class="sidebar-link sidebar-link--pinned' + (activeId === 'f15' ? ' is-active' : '') + '" href="' + pathTo('f15', 'app', base) + '" data-feature="f15"' + (activeId === 'f15' ? ' aria-current="page"' : '') + '>' +
        icon('sparkles') + '<span>工作中心</span>' + (count ? '<span class="badge badge--danger">' + count + '</span>' : '') + '</a>';
    }
    if (!groups.length) {
      html += '<div class="sidebar-group"><span class="sidebar-group-label">功能清單</span><p class="muted-2 small" style="padding:6px 12px">尚未載入功能資料</p></div>';
    }
    groups.forEach(function (g) {
      var items = g.features.filter(function (f) { return f.id !== 'f15'; });
      if (!items.length) return;
      html += '<div class="sidebar-group"><span class="sidebar-group-label">' + esc(g.label) + '</span>';
      items.forEach(function (f) {
        var on = f.id === activeId;
        html += '<a class="sidebar-link' + (on ? ' is-active' : '') + '" href="' + pathTo(f.id, 'app', base) + '" data-feature="' + esc(f.id) + '"' + (on ? ' aria-current="page"' : '') + '>' +
          icon(featureIcon(f.id)) + '<span>' + esc(f.name) + '</span></a>';
      });
      html += '</div>';
    });
    html += '<div class="sidebar-foot"><span class="sidebar-foot-label">目前角色</span>' + roleSwitchHTML() + '</div>';
    html += '</nav><div class="drawer-backdrop" data-drawer-close aria-hidden="true"></div>';
    return html;
  }
  function appShellHTML(base, activeId) {
    var f = activeId ? feature(activeId) : null;
    var tourHref = f ? pathTo(f.id, 'tour', base) : base + 'tour/index.html';
    return '<header class="topbar"><div class="topbar-inner">' +
      '<button type="button" class="drawer-toggle" aria-label="開啟功能選單" aria-controls="sidebar" aria-expanded="false" data-drawer-toggle>' + icon('menu') + '</button>' +
      brandHTML(base) +
      '<div class="topbar-nav">' +
        '<span class="topbar-date">今天 ' + fmt.date(todayISO()) + '</span>' +
        roleSwitchHTML() +
        '<a class="topbar-link" href="' + tourHref + '" title="看這個功能的導覽">' + icon('play') + '<span class="hide-mobile">功能導覽</span></a>' +
      '</div></div></header>' + sidebarHTML(base, activeId);
  }
  function tourShellHTML(base, activeId) {
    var f = activeId ? feature(activeId) : null;
    var right = f
      ? '<a class="btn btn--ghost btn--sm" href="' + base + 'tour/index.html">' + icon('chevron-left') + '<span>回導覽清單</span></a>' +
        '<a class="btn btn--primary btn--sm" href="' + pathTo(f.id, 'app', base) + '">' + '<span>到操作頁</span>' + icon('arrow-right') + '</a>'
      : '<a class="btn btn--ghost btn--sm" href="' + base + 'index.html">' + icon('chevron-left') + '<span>回總覽</span></a>' +
        '<a class="btn btn--primary btn--sm" href="' + base + 'app/index.html">' + '<span>進系統操作</span>' + icon('arrow-right') + '</a>';
    return '<header class="topbar"><div class="topbar-inner">' + brandHTML(base) +
      '<span class="topbar-title hide-mobile">功能導覽' + (f ? ' · ' + esc(f.name) : '') + '</span>' +
      '<div class="topbar-nav">' + right + '</div></div></header>';
  }
  function homeShellHTML(base) {
    return '<header class="topbar"><div class="topbar-inner">' + brandHTML(base) +
      '<div class="topbar-nav">' +
        '<a class="topbar-link" href="' + base + 'app/index.html">' + icon('grid') + '<span>進系統操作</span></a>' +
        '<a class="topbar-link" href="' + base + 'tour/index.html">' + icon('play') + '<span>功能導覽</span></a>' +
      '</div></div></header>';
  }
  var shellMounted = false;
  function shellHost() { return document.getElementById('app-shell') || document.getElementById('tour-shell') || document.getElementById('site-shell'); }
  function mountShell() {
    var body = document.body;
    if (!body) return;
    shellMounted = true;
    var base = currentBase();
    var activeId = body.getAttribute('data-feature') || '';
    var host;
    if (body.classList.contains('app')) {
      host = document.getElementById('app-shell') || body.insertBefore(el('<div id="app-shell"></div>'), body.firstChild);
      host.innerHTML = appShellHTML(base, activeId);
    } else if (body.classList.contains('tour')) {
      host = document.getElementById('tour-shell') || body.insertBefore(el('<div id="tour-shell"></div>'), body.firstChild);
      host.innerHTML = tourShellHTML(base, activeId);
    } else if (body.classList.contains('home')) {
      host = document.getElementById('site-shell');
      if (host) host.innerHTML = homeShellHTML(base);
    }
    document.documentElement.setAttribute('data-role', currentRole);
    syncRoleSwitches();
  }

  /* 抽屜 */
  function setDrawer(open) {
    var body = document.body;
    body.classList.toggle('drawer-open', !!open);
    var t = document.querySelector('[data-drawer-toggle]');
    if (t) { t.setAttribute('aria-expanded', open ? 'true' : 'false'); t.setAttribute('aria-label', open ? '關閉功能選單' : '開啟功能選單'); }
    if (open) { var nav = document.getElementById('sidebar'); if (nav) nav.focus({ preventScroll: true }); }
  }
  function toggleDrawer() { setDrawer(!document.body.classList.contains('drawer-open')); }

  /* ---------------------------------------------------------------- Toast / Modal */
  var TOAST_ICON = { ok: 'check-circle', warn: 'alert', danger: 'x-circle', neutral: 'info' };
  function toast(msg, kind, opts) {
    opts = opts || {};
    kind = TOAST_ICON[kind] ? kind : 'neutral';
    var stack = document.querySelector('.toast-stack');
    if (!stack) { stack = el('<div class="toast-stack" role="status" aria-live="polite"></div>'); document.body.appendChild(stack); }
    while (stack.children.length >= 3) stack.removeChild(stack.firstChild);
    var t = el('<div class="toast toast--' + kind + '">' + icon(TOAST_ICON[kind]) + '<div class="toast-msg">' + esc(msg) + (opts.sub ? '<small>' + esc(opts.sub) + '</small>' : '') + '</div></div>');
    stack.appendChild(t);
    var done = false;
    function remove() {
      if (done) return; done = true;
      t.classList.add('is-leaving');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 160);
    }
    t.addEventListener('click', remove);
    setTimeout(remove, isNum(opts.ms) ? opts.ms : 3200);
    return remove;
  }

  var modalStack = [];
  function modal(opts) {
    opts = opts || {};
    var id = nextId('modal');
    var closable = opts.closable !== false;
    var wrap = el('<div class="modal" role="dialog" aria-modal="true" aria-labelledby="' + id + '-title">' +
      '<div class="modal-card' + (opts.size ? ' modal-card--' + esc(opts.size) : '') + '">' +
        '<div class="modal-head"><h2 class="modal-title" id="' + id + '-title">' + esc(opts.title || '') + '</h2>' +
          (closable ? '<button type="button" class="modal-close" aria-label="關閉">' + icon('x') + '</button>' : '') + '</div>' +
        '<div class="modal-body"></div><div class="modal-actions"></div></div></div>');
    var bodyEl = wrap.querySelector('.modal-body');
    if (opts.body && typeof opts.body !== 'string' && opts.body.nodeType) bodyEl.appendChild(opts.body);
    else bodyEl.innerHTML = opts.body || '';
    var actionsEl = wrap.querySelector('.modal-actions');
    var actions = Array.isArray(opts.actions) ? opts.actions : [];
    if (!actions.length) actionsEl.hidden = true;
    var prevFocus = document.activeElement;
    var closed = false;
    function close(result) {
      if (closed) return; closed = true;
      wrap.classList.add('is-closing');
      document.removeEventListener('keydown', onKey);
      var i = modalStack.indexOf(wrap); if (i > -1) modalStack.splice(i, 1);
      setTimeout(function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        if (!modalStack.length) document.body.style.overflow = '';
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ } }
        if (typeof opts.onClose === 'function') opts.onClose(result);
      }, 150);
    }
    actions.forEach(function (a) {
      var b = el('<button type="button" class="btn btn--' + esc(a.kind || 'secondary') + '">' + (a.icon ? icon(a.icon) : '') + '<span>' + esc(a.label || '確認') + '</span></button>');
      b.addEventListener('click', function () {
        var r;
        if (typeof a.onClick === 'function') r = a.onClick(close, b);
        if (r !== false && a.close !== false) close(a.value !== undefined ? a.value : a.label);
      });
      actionsEl.appendChild(b);
    });
    function onKey(e) { if (e.key === 'Escape' && closable && modalStack[modalStack.length - 1] === wrap) { e.preventDefault(); close(); } }
    if (closable) {
      wrap.querySelector('.modal-close').addEventListener('click', function () { close(); });
      wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    }
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    modalStack.push(wrap);
    var focusTarget = actionsEl.querySelector('.btn--primary, .btn--danger') || actionsEl.querySelector('.btn') || wrap.querySelector('.modal-close');
    if (focusTarget) setTimeout(function () { focusTarget.focus({ preventScroll: true }); }, 30);
    close.element = wrap;
    return close;
  }
  function confirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      modal({
        title: opts.title || '確認這個動作',
        body: opts.body || (opts.text ? '<p>' + esc(opts.text) + '</p>' : ''),
        size: opts.size || 'sm',
        actions: [
          { label: opts.cancelLabel || '取消', kind: 'ghost', onClick: function () { settled = true; resolve(false); } },
          { label: opts.confirmLabel || '確認', kind: opts.kind || 'primary', onClick: function () { settled = true; resolve(true); } }
        ],
        onClose: function () { if (!settled) resolve(false); }
      });
    });
  }

  /* ---------------------------------------------------------------- 元件工廠（回傳 HTML 字串） */
  function badge(text, kind, opts) {
    opts = opts || {};
    kind = kind || 'neutral';
    return '<span class="' + cls('badge', 'badge--' + kind, opts.dot && 'badge--dot', opts.lg && 'badge--lg', opts.className) + '">' +
      (opts.icon ? icon(opts.icon) : '') + esc(text) + '</span>';
  }
  function kpi(o) {
    o = o || {};
    var deltaKind = o.deltaKind;
    var deltaText = o.delta;
    if (isNum(o.delta)) { deltaText = fmt.signed(o.delta, o.deltaDigits); }
    if (!deltaKind && deltaText !== undefined && deltaText !== null && deltaText !== '') {
      var s = String(deltaText).trim();
      deltaKind = s[0] === '+' ? 'up' : (s[0] === '-' ? 'down' : 'flat');
      if (o.invert && deltaKind !== 'flat') deltaKind = deltaKind === 'up' ? 'down' : 'up';
    }
    var deltaIcon = deltaKind === 'up' ? 'arrow-up-right' : (deltaKind === 'down' ? 'arrow-down-right' : 'minus');
    var value = o.valueHtml !== undefined ? o.valueHtml : esc(o.value);
    if (o.valueHtml === undefined && /^-?NT\$ /.test(String(o.value))) {   /* 「NT$ 300,000」→ 幣別縮小，數字不換行 */
      var mm = String(o.value).match(/^(-?)NT\$ (.*)$/);
      value = '<span class="kpi-prefix">' + mm[1] + 'NT$</span>' + esc(mm[2]);
    }
    if (o.unit) value += '<small>' + esc(o.unit) + '</small>';
    return '<div class="' + cls('kpi', o.kind && 'kpi--' + o.kind, o.className) + '">' +
      '<div class="kpi-label">' + (o.icon ? icon(o.icon) : '') + esc(o.label) + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      (deltaText !== undefined && deltaText !== null && deltaText !== '' ? '<div class="kpi-delta kpi-delta--' + deltaKind + '">' + icon(deltaIcon) + esc(deltaText) + (o.deltaLabel ? ' <span class="muted-2">' + esc(o.deltaLabel) + '</span>' : '') + '</div>' : '') +
      (o.hint ? '<div class="kpi-hint">' + esc(o.hint) + '</div>' : '') +
      '</div>';
  }
  function statRow(items, opts) {
    opts = opts || {};
    return '<div class="' + cls('stat-row', opts.divided && 'stat-row--divided', opts.sm && 'stat-row--sm', opts.className) + '">' + (items || []).map(function (it) {
      return '<div class="stat"><span class="stat-label">' + esc(it.label) + '</span><span class="stat-value' + (it.kind ? ' ' + (it.kind === 'danger' ? 'neg' : it.kind === 'ok' ? 'pos' : '') : '') + '">' +
        (it.html !== undefined ? it.html : esc(it.value)) + (it.unit ? ' <small>' + esc(it.unit) + '</small>' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  function progress(value, opts) {
    opts = opts || {};
    var max = isNum(opts.max) ? opts.max : 100;
    var pct = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
    var label = opts.label ? '<div class="progress-label"><span>' + esc(opts.label) + '</span><span>' + esc(opts.valueLabel !== undefined ? opts.valueLabel : trimDigits(pct, 0) + '%') + '</span></div>' : '';
    return label + '<div class="' + cls('progress', opts.kind && 'progress--' + opts.kind, opts.lg && 'progress--lg', opts.className) + '" role="progressbar" aria-valuenow="' + Math.round(pct) + '" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:' + pct.toFixed(1) + '%"></div></div>';
  }
  function alert(text, kind, opts) {
    opts = opts || {};
    kind = kind || 'warn';
    var ic = opts.icon || { danger: 'alert', warn: 'alert-circle', ok: 'check-circle', accent: 'info' }[kind] || 'info';
    return '<div class="' + cls('alert', 'alert--' + kind, opts.className) + '" role="' + (kind === 'danger' ? 'alert' : 'status') + '">' + icon(ic) +
      '<div class="alert-body">' + (opts.title ? '<span class="alert-title">' + esc(opts.title) + '</span>' : '') + (opts.html !== undefined ? opts.html : '<p>' + esc(text) + '</p>') + '</div>' +
      (opts.action ? opts.action : '') + '</div>';
  }
  function emptyState(o) {
    o = o || {};
    return '<div class="' + cls('empty-state', o.sm && 'empty-state--sm', o.error && 'empty-state--error', o.className) + '">' + icon(o.icon || (o.error ? 'alert-circle' : 'inbox')) +
      '<div class="empty-state-title">' + esc(o.title || '目前沒有資料') + '</div>' +
      (o.text ? '<p>' + esc(o.text) + '</p>' : '') + (o.action || '') + '</div>';
  }
  function skeleton(lines, opts) {
    opts = opts || {};
    var n = isNum(lines) ? lines : 3, out = '<div class="skeleton-block" aria-busy="true" aria-label="載入中">';
    if (opts.title !== false) out += '<span class="skeleton skeleton--lg"></span>';
    for (var i = 0; i < n; i++) out += '<span class="skeleton' + (i % 3 === 1 ? ' skeleton--w80' : i % 3 === 2 ? ' skeleton--w60' : '') + '"></span>';
    return out + '</div>';
  }
  function simulateLoad(target, html, ms) {
    var node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) return Promise.resolve();
    node.innerHTML = skeleton(3);
    return new Promise(function (resolve) {
      setTimeout(function () { node.innerHTML = typeof html === 'function' ? html() : html; resolve(node); }, isNum(ms) ? ms : 600);
    });
  }

  function timeline(items, opts) {
    opts = opts || {};
    if (!items || !items.length) return emptyState({ sm: true, icon: 'history', title: opts.emptyTitle || '還沒有紀錄', text: opts.emptyText });
    return '<ol class="' + cls('timeline', opts.className) + '">' + items.map(function (it, i) {
      var k = it.kind ? ' timeline-item--' + it.kind : '';
      return '<li class="timeline-item' + k + (it.current ? ' is-current' : '') + '">' +
        (it.at ? '<span class="timeline-time">' + esc(opts.rawTime ? it.at : fmt.dateTime(it.at)) + '</span>' : '') +
        '<div class="timeline-title">' + (it.html !== undefined ? it.html : esc(it.title || it.text)) + '</div>' +
        (it.title && it.text ? '<div class="timeline-text">' + esc(it.text) + '</div>' : '') +
        (it.by ? '<div class="timeline-by">' + esc(it.by) + '</div>' : '') +
        '</li>';
    }).join('') + '</ol>';
  }

  var checklists = {};
  function checklist(items, onChange, opts) {
    opts = opts || {};
    var id = opts.id || nextId('cl');
    checklists[id] = { items: (items || []).map(function (it, i) { return Object.assign({ id: it.id !== undefined ? it.id : String(i) }, it); }), onChange: onChange };
    return '<ul class="' + cls('checklist', opts.className) + '" data-checklist="' + id + '">' + checklists[id].items.map(function (it, i) {
      var iid = id + '-' + i;
      return '<li class="checklist-item' + (it.done ? ' is-done' : '') + (it.static ? ' is-static' : '') + '" data-item="' + esc(it.id) + '">' +
        '<input type="checkbox" id="' + iid + '" data-checklist="' + id + '" data-item="' + esc(it.id) + '"' + (it.done ? ' checked' : '') + (it.static ? ' disabled' : '') + '>' +
        '<label class="checklist-box" for="' + iid + '" aria-hidden="true">' + icon('check') + '</label>' +
        '<label class="checklist-label" for="' + iid + '">' + esc(it.label) + (it.hint ? '<span class="checklist-hint">' + esc(it.hint) + '</span>' : '') + '</label>' +
        (it.meta ? '<span class="checklist-meta">' + esc(it.meta) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  function onChecklistChange(input) {
    var id = input.getAttribute('data-checklist'), reg = checklists[id];
    var li = input.closest('.checklist-item');
    if (li) li.classList.toggle('is-done', input.checked);
    if (!reg) return;
    var itemId = input.getAttribute('data-item');
    var item = null;
    reg.items.forEach(function (it) { if (String(it.id) === itemId) { it.done = input.checked; item = it; } });
    var allDone = reg.items.every(function (it) { return !!it.done; });
    if (typeof reg.onChange === 'function') reg.onChange(item, input.checked, { allDone: allDone, items: reg.items, done: reg.items.filter(function (it) { return it.done; }).length });
  }

  /* 表格 */
  var tables = {};
  function cellValue(row, col, i) { return Array.isArray(row) ? row[i] : (col.key ? row[col.key] : undefined); }
  function tableHead(reg) {
    return '<thead><tr>' + reg.columns.map(function (c) {
      var sortable = c.sortable !== undefined ? c.sortable : reg.sortable;
      var sorted = reg.sortKey && reg.sortKey === (c.key || c.label);
      var thCls = cls(c.align === 'num' && 'num', c.align === 'center' && 'center', sortable && 'is-sortable', sorted && (reg.sortDir === 'asc' ? 'is-sorted-asc' : 'is-sorted-desc'), c.headClassName);
      var inner = esc(c.label);
      if (sortable) inner = '<span class="th-inner">' + inner + icon('chevron-down') + '</span>';
      return '<th scope="col"' + (thCls ? ' class="' + thCls + '"' : '') + (c.width ? ' style="width:' + esc(c.width) + '"' : '') +
        (sortable ? ' data-sort="' + esc(c.key || c.label) + '" tabindex="0" role="button" aria-sort="' + (sorted ? (reg.sortDir === 'asc' ? 'ascending' : 'descending') : 'none') + '"' : '') + '>' + inner + '</th>';
    }).join('') + '</tr></thead>';
  }
  function tableBody(reg) {
    var cols = reg.columns;
    if (!reg.rows.length) {
      var e = reg.empty;
      var inner = typeof e === 'string' ? emptyState({ sm: true, title: e }) : emptyState(Object.assign({ sm: true }, e || {}));
      return '<tbody><tr class="table-empty"><td colspan="' + cols.length + '">' + inner + '</td></tr></tbody>';
    }
    return '<tbody>' + reg.rows.map(function (row, ri) {
      var trCls = typeof reg.rowClass === 'function' ? reg.rowClass(row, ri) : (reg.rowClass || '');
      var attrs = typeof reg.rowAttrs === 'function' ? (reg.rowAttrs(row, ri) || '') : '';
      return '<tr' + (trCls ? ' class="' + esc(trCls) + '"' : '') + (attrs ? ' ' + attrs : '') + '>' + cols.map(function (c, ci) {
        var v = cellValue(row, c, ci);
        var html = typeof c.render === 'function' ? c.render(row, ri, v) : (v === null || v === undefined || v === '' ? '<span class="muted-2">—</span>' : esc(v));
        var tdCls = cls(c.align === 'num' && 'num', c.align === 'center' && 'center', c.primary && 'cell-primary', c.className);
        return '<td' + (tdCls ? ' class="' + tdCls + '"' : '') + (c.noLabel ? '' : ' data-label="' + esc(c.label) + '"') + '>' + html + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody>';
  }
  function sortRows(reg) {
    if (!reg.sortKey) return;
    var col = null;
    reg.columns.forEach(function (c) { if ((c.key || c.label) === reg.sortKey) col = c; });
    if (!col) return;
    var ci = reg.columns.indexOf(col), dir = reg.sortDir === 'desc' ? -1 : 1;
    var keyed = reg.rows.map(function (r, i) { return { r: r, i: i, v: typeof col.sortValue === 'function' ? col.sortValue(r) : cellValue(r, col, ci) }; });
    keyed.sort(function (a, b) {
      var x = a.v, y = b.v;
      var xn = x === null || x === undefined || x === '', yn = y === null || y === undefined || y === '';
      if (xn && yn) return a.i - b.i; if (xn) return 1; if (yn) return -1;
      var nx = typeof x === 'number' ? x : parseFloat(String(x).replace(/[^\d.-]/g, ''));
      var ny = typeof y === 'number' ? y : parseFloat(String(y).replace(/[^\d.-]/g, ''));
      var bothNum = isFinite(nx) && isFinite(ny) && (typeof x === 'number' || /^[\s\d.,+-]+/.test(String(x))) && (typeof y === 'number' || /^[\s\d.,+-]+/.test(String(y)));
      var c = bothNum ? nx - ny : String(x).localeCompare(String(y), 'zh-Hant');
      return c === 0 ? a.i - b.i : c * dir;
    });
    reg.rows = keyed.map(function (k) { return k.r; });
  }
  function table(o) {
    o = o || {};
    var id = o.id || nextId('tbl');
    var reg = tables[id] = {
      columns: o.columns || [], rows: (o.rows || []).slice(), sortable: !!o.sortable, empty: o.empty,
      sortKey: o.sortKey || null, sortDir: o.sortDir || 'asc', rowClass: o.rowClass, rowAttrs: o.rowAttrs,
      cards: o.cards !== false, className: o.className || '', compact: !!o.compact, onSort: o.onSort
    };
    if (reg.sortKey) sortRows(reg);
    return '<div class="table-wrap" data-table="' + id + '">' + tableInner(reg) + '</div>';
  }
  function tableInner(reg) {
    return '<table class="' + cls('table', reg.cards && 'table--cards', reg.compact && 'table--compact', reg.className) + '">' + tableHead(reg) + tableBody(reg) + '</table>';
  }
  function tableRerender(id) {
    var reg = tables[id], wrap = document.querySelector('.table-wrap[data-table="' + id + '"]');
    if (reg && wrap) wrap.innerHTML = tableInner(reg);
  }
  function tableSort(id, key, dir) {
    var reg = tables[id]; if (!reg) return;
    if (!dir) dir = (reg.sortKey === key && reg.sortDir === 'asc') ? 'desc' : 'asc';
    reg.sortKey = key; reg.sortDir = dir;
    sortRows(reg); tableRerender(id);
    if (typeof reg.onSort === 'function') reg.onSort(key, dir);
  }
  function tableUpdate(id, rows) {
    var reg = tables[id]; if (!reg) return;
    reg.rows = (rows || []).slice(); sortRows(reg); tableRerender(id);
  }
  function tabs(items, opts) {
    opts = opts || {};
    var active = opts.active !== undefined ? opts.active : 0;
    return '<div class="' + cls(opts.segmented ? 'segmented' : 'tabs', opts.segmented && opts.block && 'segmented--block', opts.className) + '" role="tablist">' + (items || []).map(function (it, i) {
      var id = typeof it === 'string' ? it : (it.id !== undefined ? it.id : i);
      var label = typeof it === 'string' ? it : it.label;
      var on = active === id || active === i;
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-tab="' + esc(id) + '"' + (opts.group ? ' data-tab-group="' + esc(opts.group) + '"' : '') + '>' +
        (it.icon ? icon(it.icon) : '') + '<span>' + esc(label) + '</span>' + (it.count !== undefined ? badge(it.count, it.countKind || 'neutral') : '') + '</button>';
    }).join('') + '</div>';
  }
  function activateTab(btn) {
    var list = btn.parentNode;
    Array.prototype.forEach.call(list.querySelectorAll('.tab'), function (b) { var on = b === btn; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    var group = btn.getAttribute('data-tab-group'), id = btn.getAttribute('data-tab');
    var panels = document.querySelectorAll('[data-tab-panel]' + (group ? '[data-tab-group="' + group + '"]' : ''));
    if (panels.length) Array.prototype.forEach.call(panels, function (p) { p.classList.toggle('is-active', p.getAttribute('data-tab-panel') === id); });
  }

  /* 手機外框（LINE 模擬） */
  function bubbleHTML(m) {
    if (!m) return '';
    if (m.typing) return '<div class="bubble-row bubble-row--them">' + (m.avatar !== false ? '<span class="phone-avatar">' + esc(m.avatar || '中') + '</span>' : '') + '<div class="bubble bubble--them"><span class="typing"><i></i><i></i><i></i></span></div></div>';
    if (m.from === 'day') return '<div class="phone-day">' + esc(m.text) + '</div>';
    if (m.from === 'system') return '<div class="bubble bubble--system">' + esc(m.text) + '</div>';
    var me = m.from === 'me';
    var body = m.html !== undefined ? m.html : esc(m.text).replace(/\n/g, '<br>');
    if (m.card) body += '<div class="bubble-card">' + (m.card.title ? '<strong>' + esc(m.card.title) + '</strong>' : '') + (m.card.lines || []).map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</div>';
    if (m.buttons) body += '<div class="row" style="gap:6px">' + m.buttons.map(function (b) { return '<button type="button" class="btn btn--secondary btn--sm" data-bubble-action="' + esc(b.action || b.label || b) + '">' + esc(b.label || b) + '</button>'; }).join('') + '</div>';
    return '<div class="bubble-row bubble-row--' + (me ? 'me' : 'them') + '">' +
      (!me && m.avatar !== false ? '<span class="phone-avatar">' + esc(m.avatar || '中') + '</span>' : '') +
      '<div class="bubble bubble--' + (me ? 'me' : 'them') + '">' + body + '</div>' +
      (m.at || m.read ? '<span class="bubble-meta">' + (m.read ? '已讀<br>' : '') + esc(m.at || '') + '</span>' : '') + '</div>';
  }
  function phone(o) {
    o = o || {};
    var msgs = (o.messages || []).slice();
    if (o.typing) msgs.push({ typing: true });
    var menu = o.menu ? '<div class="phone-menu">' + o.menu.map(function (m) { return '<button type="button" data-phone-menu="' + esc(m.action || m.label) + '">' + icon(m.icon || 'grid') + '<span>' + esc(m.label) + '</span></button>'; }).join('') + '</div>' : '';
    var input = o.input === false ? '' : '<div class="phone-input">' + icon('plus') + '<div class="phone-input-box">' + esc(o.placeholder || '輸入訊息') + '</div>' + icon('send') + '</div>';
    return '<div class="' + cls('phone', o.sm && 'phone--sm', o.className) + '" role="figure" aria-label="' + esc(o.title || 'LINE 對話') + '">' +
      '<div class="phone-screen">' +
        '<div class="phone-status"><span>' + esc(o.time || '9:41') + '</span><span class="phone-status-right">' + icon('wifi') + '<span class="phone-battery"></span></span></div>' +
        '<div class="phone-appbar">' + icon('chevron-left') + '<span class="phone-avatar">' + esc(o.avatar || '中') + '</span>' +
          '<span class="phone-appbar-title">' + esc(o.title || '租務中樞') + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span>' + icon('more') + '</div>' +
        '<div class="phone-chat">' + msgs.map(bubbleHTML).join('') + '</div>' + menu + input +
      '</div></div>';
  }
  function phoneAppend(phoneEl, msg, opts) {
    var node = typeof phoneEl === 'string' ? document.querySelector(phoneEl) : phoneEl;
    var chat = node && (node.classList.contains('phone-chat') ? node : node.querySelector('.phone-chat'));
    if (!chat) return null;
    if (!(opts && opts.keepTyping)) Array.prototype.forEach.call(chat.querySelectorAll('.typing'), function (t) { var row = t.closest('.bubble-row'); if (row) row.remove(); });
    var b = el(bubbleHTML(msg));
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight;
    return b;
  }
  function phoneTyping(phoneEl, on) {
    var node = typeof phoneEl === 'string' ? document.querySelector(phoneEl) : phoneEl;
    var chat = node && (node.classList.contains('phone-chat') ? node : node.querySelector('.phone-chat'));
    if (!chat) return;
    Array.prototype.forEach.call(chat.querySelectorAll('.typing'), function (t) { var row = t.closest('.bubble-row'); if (row) row.remove(); });
    if (on !== false) { chat.appendChild(el(bubbleHTML({ typing: true }))); chat.scrollTop = chat.scrollHeight; }
  }

  /* ---------------------------------------------------------------- 圖表（純 SVG） */
  var CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
  function niceNum(range, round) {
    if (!range) return 1;
    var exp = Math.floor(Math.log10(range)), f = range / Math.pow(10, exp), nf2;
    if (round) nf2 = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
    else nf2 = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return nf2 * Math.pow(10, exp);
  }
  function niceScale(min, max, ticks) {
    if (min === max) { max = min + (min === 0 ? 1 : Math.abs(min) * 0.2); }
    var range = niceNum(max - min, false), step = niceNum(range / (ticks || 4), true);
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    var arr = []; for (var v = lo; v <= hi + step / 2; v += step) arr.push(Math.round(v * 1e6) / 1e6);
    return { min: lo, max: hi, step: step, ticks: arr };
  }
  function defaultY(v) { return Math.abs(v) >= 10000 ? fmt.moneyShort(v) : num(v); }
  function chartHost(target) {
    var node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) return null;
    node.classList.add('chart');
    node.innerHTML = '';
    return node;
  }
  function tooltipEl(host) {
    var t = host.querySelector('.chart-tooltip');
    if (!t) { t = el('<div class="chart-tooltip" aria-hidden="true"></div>'); host.appendChild(t); }
    return t;
  }
  function showTip(host, tip, x, y, html) {
    tip.innerHTML = html;
    tip.classList.add('is-visible');
    var w = tip.offsetWidth, W = host.clientWidth;
    var left = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, x));
    tip.style.left = left + 'px';
    tip.style.top = Math.max(y, tip.offsetHeight + 12) + 'px';
  }
  function hideTip(tip) { tip.classList.remove('is-visible'); }
  function legendHTML(series, values) {
    if (!series.length || (series.length === 1 && !series[0].name)) return '';
    return '<div class="chart-legend">' + series.map(function (s, i) {
      return '<span class="chart-legend-item"><span class="chart-swatch" style="background:' + (s.color || CHART_COLORS[i % CHART_COLORS.length]) + '"></span>' + esc(s.name || ('系列 ' + (i + 1))) +
        (values && values[i] !== undefined ? ' <span class="chart-legend-value">' + values[i] + '</span>' : '') + '</span>';
    }).join('') + '</div>';
  }
  function observe(host, render) {
    if (host.__chartRO) { host.__chartRO.disconnect(); }
    if (typeof ResizeObserver === 'undefined') return;
    var last = host.clientWidth, raf = 0;
    var ro = new ResizeObserver(function () {
      var w = host.clientWidth;
      if (Math.abs(w - last) < 8) return;
      last = w; cancelAnimationFrame(raf); raf = requestAnimationFrame(render);
    });
    ro.observe(host);
    host.__chartRO = ro;
  }
  function normSeries(o) {
    var s = o.series || [];
    if (Array.isArray(s) && s.length && typeof s[0] === 'number') s = [{ name: o.name || '', data: s }];
    return s.map(function (x, i) { return { name: x.name || '', data: (x.data || []).map(function (v) { return isNum(v) ? v : (v === null ? null : +v); }), color: x.color || CHART_COLORS[i % CHART_COLORS.length], area: x.area, dashed: x.dashed }; });
  }
  function baselineOf(o) {
    if (o.baseline === undefined || o.baseline === null) return null;
    return isNum(o.baseline) ? { value: o.baseline, label: '' } : o.baseline;
  }

  function lineChart(target, o) {
    o = o || {};
    var host = chartHost(target); if (!host) return null;
    function render() {
      var series = normSeries(o), labels = o.labels || [];
      var n = Math.max(labels.length, series.reduce(function (m, s) { return Math.max(m, s.data.length); }, 0));
      if (!n || !series.length) { host.innerHTML = '<div class="chart-empty">' + esc(o.empty || '沒有可顯示的資料') + '</div>'; return; }
      var yf = o.yFormat || defaultY, vf = o.valueFormat || yf;
      var bl = baselineOf(o);
      var all = []; series.forEach(function (s) { s.data.forEach(function (v) { if (isNum(v)) all.push(v); }); });
      if (bl) all.push(bl.value);
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
      if (o.yMin !== undefined) lo = Math.min(lo, o.yMin); else if (lo > 0) lo = 0;
      if (o.yMax !== undefined) hi = Math.max(hi, o.yMax);
      var sc = niceScale(lo, hi, o.ticks || 4);
      var W = Math.max(280, host.clientWidth || 600), H = o.height || 240;
      var labW = Math.max.apply(null, sc.ticks.map(function (t) { return String(yf(t)).length; })) * 7 + 12;
      var P = { l: Math.max(36, labW), r: bl && bl.label ? 16 : 14, t: 16, b: labels.length ? 28 : 12 };
      var iw = W - P.l - P.r, ih = H - P.t - P.b;
      var X = function (i) { return P.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw); };
      var Y = function (v) { return P.t + ih - ((v - sc.min) / (sc.max - sc.min)) * ih; };
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.title || '折線圖') + '">';
      sc.ticks.forEach(function (t) { svg += '<line class="chart-grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="chart-axis-label" x="' + (P.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + esc(yf(t)) + '</text>'; });
      var every = Math.max(1, Math.ceil(n / Math.floor(iw / 56)));
      labels.forEach(function (l, i) { if (i % every === 0 || i === n - 1) svg += '<text class="chart-axis-label" x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>'; });
      if (bl) svg += '<line class="chart-baseline" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(bl.value) + '" y2="' + Y(bl.value) + '"/>' + (bl.label ? '<text class="chart-baseline-label" x="' + (W - P.r) + '" y="' + (Y(bl.value) - 6) + '" text-anchor="end">' + esc(bl.label) + '</text>' : '');
      series.forEach(function (s) {
        var pts = [], d = '';
        s.data.forEach(function (v, i) { if (!isNum(v)) { d += ''; return; } var p = [X(i), Y(v)]; pts.push(p); d += (d && s.data[i - 1] !== null && s.data[i - 1] !== undefined ? ' L' : (d ? ' M' : 'M')) + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
        if ((o.area || s.area) && pts.length > 1) svg += '<path class="chart-area" d="' + d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + Y(Math.max(sc.min, 0)) + ' L' + pts[0][0].toFixed(1) + ' ' + Y(Math.max(sc.min, 0)) + ' Z" style="fill:' + s.color + '"/>';
        svg += '<path class="chart-line" d="' + d + '" style="stroke:' + s.color + (s.dashed ? ';stroke-dasharray:6 4' : '') + '"/>';
        if (o.dots !== false) s.data.forEach(function (v, i) { if (isNum(v)) svg += '<circle class="chart-dot" data-i="' + i + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3.5" style="fill:' + s.color + '"><title>' + esc((labels[i] || '') + (s.name ? ' ' + s.name : '') + '：' + vf(v)) + '</title></circle>'; });
      });
      svg += '<line class="chart-guide" x1="0" x2="0" y1="' + P.t + '" y2="' + (P.t + ih) + '"/>';
      var step = n > 1 ? iw / (n - 1) : iw;
      for (var i = 0; i < n; i++) svg += '<rect class="chart-hit" data-i="' + i + '" x="' + (X(i) - step / 2).toFixed(1) + '" y="' + P.t + '" width="' + step.toFixed(1) + '" height="' + ih + '"/>';
      svg += '</svg>';
      host.innerHTML = svg + legendHTML(series);
      var tip = tooltipEl(host), guide = host.querySelector('.chart-guide');
      function over(e) {
        var r = e.target.closest('.chart-hit'); if (!r) return;
        var i = +r.getAttribute('data-i');
        var html = '<div class="chart-tooltip-title">' + esc(labels[i] || ('#' + (i + 1))) + '</div>' + series.map(function (s) { return '<div class="chart-tooltip-row"><span class="chart-swatch" style="background:' + s.color + '"></span>' + esc(s.name || '數值') + '<b>' + esc(isNum(s.data[i]) ? vf(s.data[i]) : '—') + '</b></div>'; }).join('');
        var hostRect = host.getBoundingClientRect(), svgEl = host.querySelector('svg'), sr = svgEl.getBoundingClientRect();
        var scale = sr.width / W, px = sr.left - hostRect.left + X(i) * scale;
        var topVal = Math.min.apply(null, series.map(function (s) { return isNum(s.data[i]) ? Y(s.data[i]) : ih + P.t; }));
        guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i)); guide.classList.add('is-visible');
        showTip(host, tip, px, sr.top - hostRect.top + topVal * scale, html);
      }
      host.onmousemove = over; host.ontouchstart = function (e) { var t = e.touches[0]; var target = document.elementFromPoint(t.clientX, t.clientY); if (target) over({ target: target }); };
      host.onmouseleave = function () { hideTip(tip); guide.classList.remove('is-visible'); };
    }
    render(); observe(host, render);
    return { update: function (next) { Object.assign(o, next || {}); render(); }, render: render, el: host };
  }

  function barChart(target, o) {
    o = o || {};
    var host = chartHost(target); if (!host) return null;
    function render() {
      var series = normSeries(o), labels = o.labels || [];
      var n = Math.max(labels.length, series.reduce(function (m, s) { return Math.max(m, s.data.length); }, 0));
      if (!n || !series.length) { host.innerHTML = '<div class="chart-empty">' + esc(o.empty || '沒有可顯示的資料') + '</div>'; return; }
      var yf = o.yFormat || defaultY, vf = o.valueFormat || yf, bl = baselineOf(o);
      var stacked = !!o.stacked && series.length > 1, horizontal = !!o.horizontal;
      var all = [];
      for (var i = 0; i < n; i++) {
        if (stacked) { var pos = 0, neg = 0; series.forEach(function (s) { var v = s.data[i]; if (isNum(v)) { if (v >= 0) pos += v; else neg += v; } }); all.push(pos, neg); }
        else series.forEach(function (s) { if (isNum(s.data[i])) all.push(s.data[i]); });
      }
      if (bl) all.push(bl.value);
      all.push(0);
      var sc = niceScale(Math.min.apply(null, all), Math.max.apply(null, all), o.ticks || 4);
      var W = Math.max(280, host.clientWidth || 600);
      var H = o.height || (horizontal ? Math.max(120, n * (o.rowHeight || 34) + 24) : 240);
      var labW = Math.max.apply(null, sc.ticks.map(function (t) { return String(yf(t)).length; })) * 7 + 12;
      var catW = horizontal ? Math.min(120, Math.max.apply(null, labels.map(function (l) { return String(l).length; })) * 13 + 12) : 0;
      var P = horizontal ? { l: Math.max(36, catW), r: 44, t: 8, b: 24 } : { l: Math.max(36, labW), r: 12, t: 16, b: labels.length ? 28 : 12 };
      var iw = W - P.l - P.r, ih = H - P.t - P.b;
      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.title || '長條圖') + '">';
      var colorOf = function (s, si, v, i) { if (typeof o.colorOf === 'function') return o.colorOf(v, i, si); if (s.colors && s.colors[i]) return s.colors[i]; if (v < 0 && series.length === 1 && o.negativeColor !== false) return o.negativeColor || 'var(--danger)'; return s.color; };
      var groups = [];
      if (!horizontal) {
        var Y = function (v) { return P.t + ih - ((v - sc.min) / (sc.max - sc.min)) * ih; };
        sc.ticks.forEach(function (t) { svg += '<line class="chart-grid" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/><text class="chart-axis-label" x="' + (P.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + esc(yf(t)) + '</text>'; });
        var slot = iw / n, gap = Math.min(slot * 0.3, 24), gw = slot - gap, bars = stacked ? 1 : series.length, bw = Math.max(4, Math.min(o.maxBarWidth || 48, (gw - (bars - 1) * 4) / bars));
        var every = Math.max(1, Math.ceil(n / Math.floor(iw / 48)));
        for (var gi = 0; gi < n; gi++) {
          var gx = P.l + gi * slot + (slot - (bw * bars + (bars - 1) * 4)) / 2;
          svg += '<g class="chart-bar-group" data-i="' + gi + '">';
          var posAcc = 0, negAcc = 0;
          series.forEach(function (s, si) {
            var v = s.data[gi]; if (!isNum(v)) return;
            var y0, y1;
            if (stacked) { if (v >= 0) { y0 = Y(posAcc + v); y1 = Y(posAcc); posAcc += v; } else { y0 = Y(negAcc); y1 = Y(negAcc + v); negAcc += v; } }
            else { y0 = Math.min(Y(v), Y(0)); y1 = Math.max(Y(v), Y(0)); }
            var x = stacked ? gx : gx + si * (bw + 4);
            svg += '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, y1 - y0).toFixed(1) + '" rx="3" style="fill:' + colorOf(s, si, v, gi) + '"><title>' + esc((labels[gi] || '') + (s.name ? ' ' + s.name : '') + '：' + vf(v)) + '</title></rect>';
            if (o.showValues && !stacked) svg += '<text class="chart-bar-label" x="' + (x + bw / 2).toFixed(1) + '" y="' + (v >= 0 ? y0 - 5 : y1 + 13).toFixed(1) + '">' + esc(vf(v)) + '</text>';
          });
          svg += '</g>';
          if (labels[gi] !== undefined && (gi % every === 0 || gi === n - 1)) svg += '<text class="chart-axis-label" x="' + (P.l + gi * slot + slot / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(labels[gi]) + '</text>';
          groups.push({ x: P.l + gi * slot, w: slot, top: P.t });
        }
        if (sc.min < 0) svg += '<line class="chart-axis" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
        if (bl) svg += '<line class="chart-baseline" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(bl.value) + '" y2="' + Y(bl.value) + '"/>' + (bl.label ? '<text class="chart-baseline-label" x="' + (W - P.r) + '" y="' + (Y(bl.value) - 6) + '" text-anchor="end">' + esc(bl.label) + '</text>' : '');
        groups.forEach(function (g, gi) { svg += '<rect class="chart-hit" data-i="' + gi + '" x="' + g.x.toFixed(1) + '" y="' + P.t + '" width="' + g.w.toFixed(1) + '" height="' + ih + '"/>'; });
      } else {
        var Xh = function (v) { return P.l + ((v - sc.min) / (sc.max - sc.min)) * iw; };
        sc.ticks.forEach(function (t) { svg += '<line class="chart-grid" y1="' + P.t + '" y2="' + (P.t + ih) + '" x1="' + Xh(t) + '" x2="' + Xh(t) + '"/><text class="chart-axis-label" y="' + (H - 6) + '" x="' + Xh(t) + '" text-anchor="middle">' + esc(yf(t)) + '</text>'; });
        var rowH = ih / n, bars2 = stacked ? 1 : series.length, bh = Math.max(4, Math.min(o.maxBarWidth || 22, (rowH * 0.7 - (bars2 - 1) * 3) / bars2));
        for (var ri = 0; ri < n; ri++) {
          var cy = P.t + ri * rowH + rowH / 2, startY = cy - (bh * bars2 + (bars2 - 1) * 3) / 2;
          svg += '<text class="chart-axis-label" x="' + (P.l - 8) + '" y="' + (cy + 4).toFixed(1) + '" text-anchor="end" style="fill:var(--ink)">' + esc(labels[ri] || '') + '</text>';
          svg += '<g class="chart-bar-group" data-i="' + ri + '">';
          var pAcc = 0, nAcc = 0;
          series.forEach(function (s, si) {
            var v = s.data[ri]; if (!isNum(v)) return;
            var x0, x1;
            if (stacked) { if (v >= 0) { x0 = Xh(pAcc); x1 = Xh(pAcc + v); pAcc += v; } else { x0 = Xh(nAcc + v); x1 = Xh(nAcc); nAcc += v; } }
            else { x0 = Math.min(Xh(v), Xh(0)); x1 = Math.max(Xh(v), Xh(0)); }
            var y = stacked ? startY : startY + si * (bh + 3);
            svg += '<rect class="chart-bar" x="' + x0.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(1, x1 - x0).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="3" style="fill:' + colorOf(s, si, v, ri) + '"><title>' + esc((labels[ri] || '') + (s.name ? ' ' + s.name : '') + '：' + vf(v)) + '</title></rect>';
            if (o.showValues !== false && !stacked && series.length === 1) svg += '<text class="chart-axis-label" x="' + (v >= 0 ? x1 + 6 : x0 - 6).toFixed(1) + '" y="' + (y + bh / 2 + 4).toFixed(1) + '" text-anchor="' + (v >= 0 ? 'start' : 'end') + '" style="fill:var(--ink)">' + esc(vf(v)) + '</text>';
          });
          svg += '</g>';
          groups.push({ y: P.t + ri * rowH, h: rowH });
        }
        if (sc.min < 0) svg += '<line class="chart-axis" y1="' + P.t + '" y2="' + (P.t + ih) + '" x1="' + Xh(0) + '" x2="' + Xh(0) + '"/>';
        if (bl) svg += '<line class="chart-baseline" y1="' + P.t + '" y2="' + (P.t + ih) + '" x1="' + Xh(bl.value) + '" x2="' + Xh(bl.value) + '"/>' + (bl.label ? '<text class="chart-baseline-label" x="' + (Xh(bl.value) + 4) + '" y="' + (P.t + 10) + '">' + esc(bl.label) + '</text>' : '');
        groups.forEach(function (g, gi) { svg += '<rect class="chart-hit" data-i="' + gi + '" x="' + P.l + '" y="' + g.y.toFixed(1) + '" width="' + iw + '" height="' + g.h.toFixed(1) + '"/>'; });
      }
      svg += '</svg>';
      host.innerHTML = svg + (o.legend === false ? '' : legendHTML(series));
      var tip = tooltipEl(host);
      function over(e) {
        var r = e.target.closest('.chart-hit'); if (!r) return;
        var i = +r.getAttribute('data-i');
        var html = '<div class="chart-tooltip-title">' + esc(labels[i] || ('#' + (i + 1))) + '</div>' + series.map(function (s) { return '<div class="chart-tooltip-row"><span class="chart-swatch" style="background:' + s.color + '"></span>' + esc(s.name || '數值') + '<b>' + esc(isNum(s.data[i]) ? vf(s.data[i]) : '—') + '</b></div>'; }).join('');
        var hostRect = host.getBoundingClientRect(), sr = host.querySelector('svg').getBoundingClientRect(), scale = sr.width / W;
        var g = groups[i];
        var px = horizontal ? (sr.left - hostRect.left + (P.l + iw / 2) * scale) : (sr.left - hostRect.left + (g.x + g.w / 2) * scale);
        var py = horizontal ? (sr.top - hostRect.top + g.y * scale) : (sr.top - hostRect.top + P.t * scale);
        showTip(host, tip, px, py, html);
      }
      host.onmousemove = over; host.ontouchstart = function (e) { var t = e.touches[0]; var target = document.elementFromPoint(t.clientX, t.clientY); if (target) over({ target: target }); };
      host.onmouseleave = function () { hideTip(tip); };
    }
    render(); observe(host, render);
    return { update: function (next) { Object.assign(o, next || {}); render(); }, render: render, el: host };
  }

  function donutChart(target, o) {
    o = o || {};
    var host = chartHost(target); if (!host) return null;
    host.classList.add('chart--donut');
    function render() {
      var data = (o.data || []).map(function (d, i) { return { label: d.label, value: isNum(d.value) ? d.value : +d.value || 0, color: d.color || CHART_COLORS[i % CHART_COLORS.length] }; });
      var total = isNum(o.total) ? o.total : data.reduce(function (s, d) { return s + d.value; }, 0);
      if (!data.length || total <= 0) { host.innerHTML = '<div class="chart-empty">' + esc(o.empty || '沒有可顯示的資料') + '</div>'; return; }
      var size = o.size || 200, th = o.thickness || 22, r = (size - th) / 2 - 2, C = 2 * Math.PI * r, cx = size / 2;
      var vf = o.valueFormat || num;
      var svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(o.title || '環圈圖') + '" style="width:' + size + 'px;flex:none">';
      svg += '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="var(--line-soft)" stroke-width="' + th + '"/>';
      var off = 0;
      data.forEach(function (d, i) {
        var len = (d.value / total) * C;
        svg += '<circle class="chart-donut-seg" data-i="' + i + '" cx="' + cx + '" cy="' + cx + '" r="' + r + '" stroke="' + d.color + '" stroke-width="' + th + '" stroke-dasharray="' + Math.max(0, len - (data.length > 1 ? 2 : 0)).toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + cx + ' ' + cx + ')"><title>' + esc(d.label + '：' + vf(d.value) + '（' + fmt.pct(d.value / total) + '）') + '</title></circle>';
        off += len;
      });
      var cv = o.centerValue !== undefined ? o.centerValue : (o.centerPct !== undefined ? fmt.pct(o.centerPct) : vf(total));
      svg += '<text class="chart-donut-center chart-donut-value" x="' + cx + '" y="' + (cx + (o.centerLabel ? 4 : 10)) + '">' + esc(cv) + '</text>';
      if (o.centerLabel) svg += '<text class="chart-donut-center chart-donut-label" x="' + cx + '" y="' + (cx + 24) + '">' + esc(o.centerLabel) + '</text>';
      svg += '</svg>';
      var legend = o.legend === false ? '' : '<div class="chart-legend chart-legend--stack">' + data.map(function (d, i) {
        return '<span class="chart-legend-item" data-i="' + i + '"><span class="chart-swatch" style="background:' + d.color + '"></span>' + esc(d.label) + ' <span class="chart-legend-value">' + esc(vf(d.value)) + '</span><span class="muted-2">' + esc(fmt.pct(d.value / total)) + '</span></span>';
      }).join('') + '</div>';
      host.innerHTML = svg + legend;
      var tip = tooltipEl(host);
      function over(e) {
        var seg = e.target.closest('.chart-donut-seg'); if (!seg) return;
        var i = +seg.getAttribute('data-i'), d = data[i];
        Array.prototype.forEach.call(host.querySelectorAll('.chart-donut-seg'), function (s) { s.style.strokeWidth = s === seg ? (th + 4) : th; s.style.opacity = s === seg ? 1 : 0.55; });
        var hostRect = host.getBoundingClientRect();
        showTip(host, tip, e.clientX - hostRect.left, e.clientY - hostRect.top, '<div class="chart-tooltip-row"><span class="chart-swatch" style="background:' + d.color + '"></span>' + esc(d.label) + '<b>' + esc(vf(d.value)) + '｜' + esc(fmt.pct(d.value / total)) + '</b></div>');
      }
      host.onmousemove = over;
      host.onmouseleave = function () { hideTip(tip); Array.prototype.forEach.call(host.querySelectorAll('.chart-donut-seg'), function (s) { s.style.strokeWidth = th; s.style.opacity = 1; }); };
    }
    render();
    return { update: function (next) { Object.assign(o, next || {}); render(); }, render: render, el: host };
  }

  /* ---------------------------------------------------------------- 滾動淡入 */
  var revealIO = null, revealMO = null, revealPending = false;
  function reveal(root) {
    var scope = root || document;
    if (!revealMO && typeof MutationObserver !== 'undefined' && document.body) {   /* 之後才插入的 .reveal 也自動掛上，不會停在透明 */
      revealMO = new MutationObserver(function () {
        if (revealPending) return;
        revealPending = true;
        Promise.resolve().then(function () { revealPending = false; reveal(); });
      });
      revealMO.observe(document.body, { childList: true, subtree: true });
    }
    var nodes = scope.querySelectorAll('.reveal:not(.is-visible)');
    if (!nodes.length) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') { Array.prototype.forEach.call(nodes, function (n) { n.classList.add('is-visible'); }); return; }
    if (!revealIO) {
      revealIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); revealIO.unobserve(en.target); } });
      }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    }
    Array.prototype.forEach.call(nodes, function (n) { revealIO.observe(n); });
  }

  /* ---------------------------------------------------------------- 事件委派 */
  function bindGlobal() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;
      var toggle = t.closest('[data-drawer-toggle]');
      if (toggle) { toggleDrawer(); return; }
      if (t.closest('[data-drawer-close]')) { setDrawer(false); return; }
      var roleBtn = t.closest('.role-switch button[data-role]');
      if (roleBtn) {
        var r = roleBtn.getAttribute('data-role');
        if (r !== currentRole) { setRole(r); toast('已切換為「' + ROLES[r] + '」視角', 'neutral', { ms: 2000 }); }
        if (roleBtn.closest('.sidebar')) setDrawer(false);
        return;
      }
      var th = t.closest('.table th[data-sort]');
      if (th) { var wrap = th.closest('.table-wrap[data-table]'); if (wrap) tableSort(wrap.getAttribute('data-table'), th.getAttribute('data-sort')); return; }
      var tab = t.closest('[role="tablist"] .tab[data-tab]');
      if (tab) { activateTab(tab); return; }
      if (t.closest('.sidebar .sidebar-link') && document.body.classList.contains('drawer-open')) setDrawer(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) { setDrawer(false); var tg = document.querySelector('[data-drawer-toggle]'); if (tg) tg.focus(); }
      if (e.key === 'Enter' || e.key === ' ') {
        var th = e.target instanceof Element && e.target.closest('.table th[data-sort]');
        if (th) { e.preventDefault(); var wrap = th.closest('.table-wrap[data-table]'); if (wrap) tableSort(wrap.getAttribute('data-table'), th.getAttribute('data-sort')); }
      }
    });
    document.addEventListener('change', function (e) {
      var input = e.target;
      if (input instanceof Element && input.matches('input[type="checkbox"][data-checklist]')) onChecklistChange(input);
    });
    var mq = window.matchMedia ? window.matchMedia('(min-width: 1025px)') : null;
    if (mq) { var onMq = function (m) { if (m.matches) setDrawer(false); }; if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
  }

  /* ---------------------------------------------------------------- 公開 API */
  var App = {
    ROLES: ROLES, ROLE_ORDER: ROLE_ORDER, PERMS: PERMS,
    setRole: setRole, onRole: onRole, can: can, mask: mask, roleName: function (r) { return ROLES[r || currentRole] || ''; },
    mountShell: mountShell, openDrawer: function () { setDrawer(true); }, closeDrawer: function () { setDrawer(false); },
    toast: toast, modal: modal, confirm: confirm,
    fmt: fmt, daysBetween: daysBetween, addDays: addDays, parseDate: parseDate,
    badge: badge, kpi: kpi, table: table, tableSort: tableSort, tableUpdate: tableUpdate, timeline: timeline, checklist: checklist,
    phone: phone, phoneAppend: phoneAppend, phoneTyping: phoneTyping, bubble: bubbleHTML,
    alert: alert, emptyState: emptyState, statRow: statRow, progress: progress, tabs: tabs, skeleton: skeleton, simulateLoad: simulateLoad,
    charts: { line: lineChart, bar: barChart, donut: donutChart, colors: CHART_COLORS },
    reveal: reveal,
    link: link, linkFromRoot: linkFromRoot, feature: feature, features: features, featureGroups: featureGroups, featureIcon: featureIcon, currentFeature: currentFeature,
    icon: icon, esc: esc, el: el, db: db
  };
  Object.defineProperty(App, 'role', { get: function () { return currentRole; }, set: function (r) { setRole(r); }, enumerable: true });
  Object.defineProperty(App, 'today', { get: todayISO, enumerable: true });
  window.App = App;

  loadRole();
  document.documentElement.setAttribute('data-role', currentRole);
  bindGlobal();
  /* 外殼容器已在 DOM（script 放在 body 末端）就立刻掛，讓後面的 js/app/fNN.js 能直接用；否則等 DOMContentLoaded。 */
  if (document.body && shellHost()) mountShell();
  function boot() { if (!shellMounted) mountShell(); reveal(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
