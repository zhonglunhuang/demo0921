/* f15.js — AI 工作中心（進系統後的首頁）
 * 契約：docs/DESIGN.md §3（外殼與共用元件）、§5（假資料與故事數字）、§6（文案）。
 * 票：tickets/DEMO-07 需求 #15。
 * 只讀 window.DB、只組合 window.App 的共用元件；本功能才需要的補充資料放在 EXTRA。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB;
  var root = document.getElementById('f15-root');
  if (!A || !D || !root) return;

  /* ====================================================================
     1. 本功能專屬補充（不改 data.js / common.js / main.css）
     ==================================================================== */
  /* DB.depositOf('D11') 會先回到現住租客那筆；故事要的是「逾期未結算」那筆 */
  function depositD11() {
    var list = D.deposits.filter(function (x) { return x.unitId === 'D11'; });
    for (var i = 0; i < list.length; i++) if (list[i].status === '逾期未結算') return list[i];
    return list[list.length - 1] || D.depositOf('D11');
  }

  var EXTRA = {
    kindLabel: { billing: '帳款', arrears: '欠租', repair: '修繕', lease: '租約', deposit: '押金', vacancy: '空房' },
    kindIcon: { billing: 'receipt', arrears: 'dollar', repair: 'wrench', lease: 'file', deposit: 'wallet', vacancy: 'door' },
    sevLabel: { danger: '要立刻處理', warn: '今天內處理' },

    /* 排序：最該先動的排前面（押金逾期最久 → 欠租 → 合約 → 修繕 → 帳款 → 空房） */
    order: { 'deposit-D11': 1, 'arrears-B11': 2, 'lease-A03': 3, 'repair-C03': 4, 'billing-A09': 5, 'arrears-E07': 6, 'vacancy-C08': 7 },

    /* 每一件的系統建議與處理後的結果（數字一律由 DB 算出來，不另外寫死） */
    detail: {
      'deposit-D11': {
        suggest: function () {
          var d = depositD11();
          var list = d.deductions.map(function (x) { return x.item + ' ' + A.fmt.money(x.amount); }).join('、');
          return '押金 ' + A.fmt.money(d.amount) + '，扣除' + list + '後退還 ' + A.fmt.money(d.amount - d.deductTotal) + '，並附上點交照片給前租客。';
        },
        done: '已開始結算，退款單與扣款明細一併產生'
      },
      'arrears-B11': {
        suggest: function () {
          var t = D.tenantOf('B11');
          return '已通知 2 次仍未繳。今天送出第 3 次催繳並電話聯繫，欠款 ' + A.fmt.money(t.arrearsAmount) + '，請對方在 3 天內補齊。';
        },
        done: '已送出催繳，通知與回覆全程留存'
      },
      'lease-A03': {
        suggest: function () {
          var r = D.riskUnits()[0];
          return '上游租約 ' + A.fmt.date(r.upEnd) + ' 到期，房客卻租到 ' + A.fmt.date(r.downEnd) + '。距離到期還有 ' + r.daysToUpEnd + ' 天，今天就聯繫屋主談續約。';
        },
        done: '已建立續租待辦，指派給租務管理員'
      },
      'repair-C03': {
        suggest: function () {
          return '租客兩次沒回覆細節，AI 不猜測派工類別。請直接派「熱水器檢修」給常用水電廠商，或先電話問清楚症狀。';
        },
        done: '已轉人工派工，升級通知同步停止'
      },
      'billing-A09': {
        suggest: function () {
          return '比對 9 月的匯款紀錄，確認 200 元差額是匯費還是短繳。核對結果會自動寫進操作紀錄。';
        },
        done: '已標記為完成核對，操作紀錄多一筆'
      },
      'arrears-E07': {
        suggest: function () {
          var t = D.tenantOf('E07');
          return '電話未接、LINE 未讀，已列為重大事件 INC-04 追蹤。今天改寄書面通知，欠款 ' + A.fmt.money(t.arrearsAmount) + '。';
        },
        done: '已改寄書面通知，事件 INC-04 同步更新'
      },
      'vacancy-C08': {
        suggest: function () {
          var s = D.rentSuggestion('C08');
          if (!s) return '詢問多、成交零，多半是租金偏高。調整刊登價並重拍照片。';
          return '詢問有、成交沒有，多半是租金偏高。同區同房型行情 ' + A.fmt.money(s.low) + '至 ' + A.fmt.money(s.high) +
            '，目前刊登 ' + A.fmt.money(s.current) + '，建議調到 ' + A.fmt.money(s.suggest) + ' 並重拍照片。';
        },
        done: '已建立招租調價待辦，刊登同步更新'
      }
    }
  };

  /* ====================================================================
     2. 狀態（重新整理即回到初始清單，不做持久化）
     ==================================================================== */
  var state = { done: {}, seg: 'all', kind: 'all', q: '', expanded: false, normalReady: false };
  var storyClock = 8 * 60 + 40;          /* 故事時鐘：早上 08:40 開始，處理一件走 6 分鐘 */
  var lastCount = null;
  var esc = A.esc;

  function reduced() {
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function nextStamp() { storyClock += 6; return pad2(Math.floor(storyClock / 60)) + ':' + pad2(storyClock % 60); }

  function itemKey(it, i) { return it.kind + '-' + (it.unitId || i); }
  function items() {
    return D.workCenterFor(A.role).map(function (it, i) {
      var key = itemKey(it, i);
      var o = { key: key };
      for (var k in it) if (Object.prototype.hasOwnProperty.call(it, k)) o[k] = it[k];
      o.rank = EXTRA.order[key] || 99;
      return o;
    }).sort(function (a, b) {
      var da = state.done[a.key] ? 1 : 0, db = state.done[b.key] ? 1 : 0;
      return da !== db ? da - db : a.rank - b.rank;
    });
  }
  function pending() { return items().filter(function (it) { return !state.done[it.key]; }); }
  function taskOf(it) {
    for (var i = 0; i < D.todos.length; i++) {
      var t = D.todos[i];
      if (t.unitId === it.unitId && t.kind === it.kind) return t;
    }
    return null;
  }
  function unitPlace(id) {
    var u = D.unit(id);
    return u ? u.region + ' ' + u.building + ' 棟' : '';
  }
  /* DB 描述裡的 2026-11-30 統一成全站的 2026/11/30 */
  function humanDate(s) { return String(s).replace(/(\d{4})-(\d{2})-(\d{2})/g, '$1/$2/$3'); }
  function featureName(id) { var f = A.feature(id); return f ? f.name : '功能頁'; }

  /* ====================================================================
     3. 骨架
     ==================================================================== */
  root.innerHTML =
    '<section class="card card--dark card--static f15-hero" id="f15-hero" aria-live="polite"></section>' +
    '<div id="f15-alert"></div>' +
    '<div class="toolbar f15-toolbar" id="f15-toolbar"></div>' +
    '<p class="f15-filter-note" id="f15-note"></p>' +
    '<div class="grid grid--3" id="f15-cards"></div>' +
    '<section class="card card--static card--flush f15-normal" id="f15-normal"></section>';

  var elHero = document.getElementById('f15-hero');
  var elAlert = document.getElementById('f15-alert');
  var elToolbar = document.getElementById('f15-toolbar');
  var elNote = document.getElementById('f15-note');
  var elCards = document.getElementById('f15-cards');
  var elNormal = document.getElementById('f15-normal');
  var elPrimary = document.getElementById('f15-primary');

  /* ====================================================================
     4. 首屏
     ==================================================================== */
  function animateNum(el, from, to) {
    if (!el) return;
    if (from === to || reduced()) { el.textContent = to; return; }
    var start = null, dur = 700;
    el.textContent = from;
    /* 保險：分頁在背景時 requestAnimationFrame 不跑，數字不能停在舊值 */
    setTimeout(function () { if (el.isConnected) el.textContent = to; }, dur + 120);
    requestAnimationFrame(function step(ts) {
      if (!el.isConnected) return;
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = to;
    });
  }

  function renderHero() {
    var all = items(), left = pending().length, total = all.length;
    var allRoles = D.workCenter().length;
    var normal = D.normalUnits().length;
    var s02 = null;
    D.performance.byStaff.forEach(function (r) { if (r.staffId === 'S02') s02 = r; });

    var stats = A.statRow([
      { label: '物件總數', value: A.fmt.num(D.units.length), unit: '間' },
      { label: '一切正常', value: A.fmt.num(normal), unit: '間' },
      { label: '陳○○ 的待辦', value: A.fmt.num(s02 ? s02.open : 0), unit: '件' },
      { label: '其中已逾期', value: A.fmt.num(s02 ? s02.overdue : 0), unit: '件' }
    ]);

    var head;
    if (left > 0) {
      head =
        '<p class="eyebrow">' + esc(A.fmt.date(A.today)) + ' · ' + esc(A.roleName()) + '視角</p>' +
        '<p class="f15-hero-line">今天需要人工處理 <span class="f15-hero-num" id="f15-count">' + left + '</span> 件</p>' +
        '<p class="f15-hero-sub">' + esc(subText(total, allRoles, normal)) + '</p>' +
        '<div class="f15-hero-progress">' +
          A.progress(total - left, { max: total, label: '今天的進度', valueLabel: '已處理 ' + (total - left) + '／' + total + ' 件', kind: 'ok' }) +
        '</div>';
    } else {
      head =
        '<p class="eyebrow">' + esc(A.fmt.date(A.today)) + ' · ' + esc(A.roleName()) + '視角</p>' +
        '<div class="f15-hero-clear">' + A.icon('check-circle') +
          '<div><p class="f15-hero-line">今天沒有需要你處理的事</p>' +
          '<p class="f15-hero-sub">' + esc(total + ' 件全部處理完。' + D.units.length + ' 間物件照常運作，有新狀況系統會立刻推上來。') + '</p></div>' +
        '</div>';
    }
    elHero.classList.toggle('is-clear', left === 0);
    elHero.innerHTML = head + stats;

    var num = document.getElementById('f15-count');
    if (num) animateNum(num, lastCount === null ? left : lastCount, left);
    lastCount = left;
  }

  function subText(total, allRoles, normal) {
    if (total === allRoles) return '其餘 ' + normal + ' 間一切正常，系統自己盯著，不用一間間看。';
    return '以' + A.roleName() + '視角，只看得到跟你有關的那幾件；另外 ' + (allRoles - total) + ' 件由其他同事處理。';
  }

  function renderPrimary() {
    if (!elPrimary) return;
    var left = pending().length;
    elPrimary.textContent = left > 0 ? '處理下一件' : '重看今天的清單';
  }

  /* ====================================================================
     5. 最該先處理的一件（警示）
     ==================================================================== */
  function renderAlert() {
    var next = pending()[0];
    if (!next) { elAlert.innerHTML = ''; return; }
    var task = taskOf(next);
    var overdue = task && task.overdue ? '，待辦已逾期 ' + task.overdueDays + ' 天' : '';
    elAlert.innerHTML = A.alert(humanDate(next.desc) + overdue + '。', next.severity, {
      title: '最該先處理：' + next.unitId + ' ' + next.title,
      action: '<button type="button" class="btn btn--secondary btn--sm" data-f15-open="' + esc(next.key) + '">開始處理</button>'
    });
  }

  /* ====================================================================
     6. 篩選工具列
     ==================================================================== */
  function counts() {
    var all = items(), c = { all: all.length, danger: 0, warn: 0, done: 0 };
    all.forEach(function (it) {
      if (state.done[it.key]) c.done++;
      else if (it.severity === 'danger') c.danger++;
      else c.warn++;
    });
    return c;
  }
  var SEGS = [
    { id: 'all', label: '全部', kind: 'neutral' },
    { id: 'danger', label: '要立刻處理', kind: 'danger' },
    { id: 'warn', label: '今天內處理', kind: 'warn' },
    { id: 'done', label: '已處理', kind: 'ok' }
  ];
  function renderToolbar() {
    var c = counts();
    var kinds = {};
    items().forEach(function (it) { kinds[it.kind] = (kinds[it.kind] || 0) + 1; });
    var opts = ['<option value="all">全部類型</option>'].concat(Object.keys(kinds).map(function (k) {
      return '<option value="' + esc(k) + '"' + (state.kind === k ? ' selected' : '') + '>' + esc(EXTRA.kindLabel[k] || k) + '（' + kinds[k] + '）</option>';
    }));
    elToolbar.innerHTML =
      '<div class="segmented" role="tablist" aria-label="依急迫程度篩選">' + SEGS.map(function (s) {
        var on = state.seg === s.id;
        return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-f15-seg="' + s.id + '">' +
          '<span>' + s.label + '</span><span class="badge badge--' + s.kind + '" data-f15-count="' + s.id + '">' + c[s.id] + '</span></button>';
      }).join('') + '</div>' +
      '<label class="sr-only" for="f15-kind">依類型篩選</label>' +
      '<select class="select" id="f15-kind">' + opts.join('') + '</select>' +
      '<div class="search">' + A.icon('search') +
        '<label class="sr-only" for="f15-q">搜尋物件或關鍵字</label>' +
        '<input class="input" id="f15-q" type="search" placeholder="搜尋物件編號或關鍵字" autocomplete="off" value="' + esc(state.q) + '">' +
      '</div>';
  }
  function syncToolbar() {
    var c = counts();
    SEGS.forEach(function (s) {
      var b = elToolbar.querySelector('[data-f15-count="' + s.id + '"]');
      if (b) b.textContent = c[s.id];
      var t = elToolbar.querySelector('[data-f15-seg="' + s.id + '"]');
      if (t) {
        var on = state.seg === s.id;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      }
    });
  }

  /* ====================================================================
     7. 卡片清單
     ==================================================================== */
  function filtered() {
    var q = state.q.trim().toLowerCase();
    return items().filter(function (it) {
      var done = !!state.done[it.key];
      if (state.seg === 'done' && !done) return false;
      if (state.seg === 'danger' && (done || it.severity !== 'danger')) return false;
      if (state.seg === 'warn' && (done || it.severity !== 'warn')) return false;
      if (state.kind !== 'all' && it.kind !== state.kind) return false;
      if (q) {
        var hay = (it.unitId + ' ' + it.title + ' ' + it.desc + ' ' + (EXTRA.kindLabel[it.kind] || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function cardHTML(it) {
    var done = state.done[it.key];
    var task = taskOf(it);
    var meta = '';
    if (task) {
      var staff = D.staffById(task.assigneeId);
      meta = '<p class="small muted-2">負責人 ' + esc(staff ? staff.name : '未指派') + '｜期限 ' + esc(A.fmt.date(task.due)) +
        (task.overdue ? ' ' + A.badge('逾期 ' + task.overdueDays + ' 天', 'danger') : '') + '</p>';
    }
    var foot = done
      ? '<span class="f15-card-done-at">' + A.icon('check-circle') + '已處理 · ' + esc(done) + '</span>' +
        '<span class="spacer"></span>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-f15-undo="' + esc(it.key) + '">還原</button>'
      : '<button type="button" class="btn btn--secondary btn--sm" data-f15-open="' + esc(it.key) + '">開始處理</button>' +
        '<a class="btn btn--ghost btn--sm" href="' + esc(A.link(it.featureId, 'app')) + '">查看' + esc(featureName(it.featureId)) + '</a>';

    return '<article class="card f15-card' + (done ? ' is-done' : '') + '" data-f15-card="' + esc(it.key) + '">' +
      '<div class="card-head">' +
        '<span class="icon-circle icon-circle--' + (done ? 'ok' : it.severity) + '">' + A.icon(done ? 'check' : (EXTRA.kindIcon[it.kind] || 'alert')) + '</span>' +
        '<div class="f15-card-tags">' +
          (done ? A.badge('已處理', 'ok') : A.badge(EXTRA.sevLabel[it.severity] || '待處理', it.severity)) +
          A.badge(EXTRA.kindLabel[it.kind] || it.kind, 'neutral') +
        '</div>' +
      '</div>' +
      '<div><p class="f15-card-unit">' + esc(it.unitId) + ' · ' + esc(unitPlace(it.unitId)) + '</p>' +
      '<h3 class="f15-card-title">' + esc(it.title) + '</h3></div>' +
      '<p class="f15-card-desc">' + esc(humanDate(it.desc)) + '</p>' + meta +
      '<div class="card-foot">' + foot + '</div>' +
      '</article>';
  }

  function renderCards() {
    var list = filtered(), total = items().length;
    if (!list.length) {
      elNote.textContent = '';
      elCards.classList.remove('grid--3');
      elCards.innerHTML = '<div class="card card--static">' + emptyHTML() + '</div>';
      return;
    }
    elCards.classList.add('grid--3');
    elNote.textContent = list.length === total
      ? '共 ' + total + ' 件，最該先處理的排在最前面。'
      : '顯示 ' + list.length + ' 件，共 ' + total + ' 件。';
    elCards.innerHTML = list.map(cardHTML).join('');
  }

  function emptyHTML() {
    var doneCount = counts().done;
    if (state.seg === 'done' && !doneCount) {
      return A.emptyState({
        icon: 'check-circle', title: '還沒有處理完的項目',
        text: '處理完一件，就會出現在這裡，方便回頭查。',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-f15-clear>看全部項目</button>'
      });
    }
    return A.emptyState({
      icon: 'search', title: '找不到符合的項目',
      text: '換個條件，或清除篩選看今天的全部 ' + items().length + ' 件。',
      action: '<button type="button" class="btn btn--secondary btn--sm" data-f15-clear>清除篩選</button>'
    });
  }

  /* ====================================================================
     8. 其餘 N 間一切正常（預設收合）
     ==================================================================== */
  function renderNormal() {
    var list = D.normalUnits();
    elNormal.innerHTML =
      '<button type="button" class="f15-normal-toggle" id="f15-normal-toggle" aria-expanded="' + (state.expanded ? 'true' : 'false') + '" aria-controls="f15-normal-body">' +
        '<span class="icon-circle icon-circle--ok">' + A.icon('check') + '</span>' +
        '<span class="f15-normal-text">' +
          '<span class="f15-normal-title">' + list.length + ' 間一切正常</span>' +
          '<span class="f15-normal-sub">沒有待處理事項，系統照常追蹤租金、租約與修繕。</span>' +
        '</span>' +
        '<span class="f15-normal-chev">' + A.icon('chevron-down') + '</span>' +
      '</button>' +
      '<div class="f15-normal-body" id="f15-normal-body"' + (state.expanded ? '' : ' hidden') + '></div>';
    if (state.expanded) fillNormal();
  }

  function fillNormal() {
    var body = document.getElementById('f15-normal-body');
    if (!body) return;
    var list = D.normalUnits();
    var rows = list.map(function (u) {
      var t = u.tenantId ? D.tenant(u.tenantId) : null;
      return {
        id: u.id, place: u.region + ' ' + u.building + ' 棟 ' + u.floor + ' 樓', type: u.type,
        status: u.status, tenant: t ? t.name : '', rent: A.mask(u.rent, 'rent')
      };
    });
    var statusKind = { rented: 'ok', leaving: 'warn', prep: 'neutral', listing: 'accent' };
    body.innerHTML =
      '<div class="f15-normal-scroll">' + A.table({
        columns: [
          { key: 'id', label: '物件', primary: true },
          { key: 'place', label: '位置' },
          { key: 'type', label: '房型' },
          { key: 'status', label: '狀態', render: function (r) { return A.badge(D.statusName(r.status), statusKind[r.status] || 'neutral'); } },
          { key: 'tenant', label: '租客', render: function (r) { return r.tenant ? esc(r.tenant) : '<span class="muted-2">尚未入住</span>'; } },
          { key: 'rent', label: '月租', align: 'num', render: function (r) { return esc(A.fmt.money(r.rent)); } }
        ],
        rows: rows,
        empty: { title: '這裡沒有物件', text: '目前所有物件都在待處理清單裡。' }
      }) + '</div>' +
      '<p class="f15-normal-foot">依物件編號排序，共 ' + list.length + ' 間。金額會依目前角色的權限決定看不看得到。</p>';
  }

  /* ====================================================================
     9. 處理流程：開啟對話框 → 標記為已處理 → 數字下降
     ==================================================================== */
  function itemOf(key) {
    var list = items();
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }

  function openItem(key) {
    var it = itemOf(key);
    if (!it) return;
    if (state.done[it.key]) { A.toast('這件已經處理完了', 'neutral'); return; }

    var task = taskOf(it);
    var staff = task ? D.staffById(task.assigneeId) : null;
    var detail = EXTRA.detail[it.key] || {};
    var suggest = typeof detail.suggest === 'function' ? detail.suggest() : (detail.suggest || '');

    var body =
      '<dl class="kv f15-modal-kv">' +
        '<dt>物件</dt><dd>' + esc(it.unitId + '（' + unitPlace(it.unitId) + '）') + '</dd>' +
        '<dt>狀況</dt><dd>' + esc(humanDate(it.desc)) + '</dd>' +
        (task ? '<dt>負責人</dt><dd>' + esc((staff ? staff.name : '未指派') + '（' + (staff ? staff.roleName : '待指派') + '）') + '</dd>' +
                '<dt>期限</dt><dd>' + esc(A.fmt.date(task.due)) + (task.overdue ? ' ' + A.badge('逾期 ' + task.overdueDays + ' 天', 'danger') : '') + '</dd>' : '') +
      '</dl>' +
      '<div class="f15-modal-suggest">' + A.icon('sparkles') +
        '<div><strong>系統建議</strong>' + esc(suggest) + '</div>' +
      '</div>' +
      '<p class="f15-modal-link"><a class="btn btn--ghost btn--sm" href="' + esc(A.link(it.featureId, 'app')) + '">查看' + esc(featureName(it.featureId)) + '</a></p>';

    A.modal({
      title: it.title,
      body: body,
      actions: [
        { label: '先跳過', kind: 'ghost' },
        { label: it.action || '標記為已處理', kind: 'primary', onClick: function () { complete(it); } }
      ]
    });
  }

  function complete(it) {
    if (state.done[it.key]) return;
    state.done[it.key] = nextStamp();
    var detail = EXTRA.detail[it.key] || {};
    var left = pending().length;
    refresh();
    A.toast(it.unitId + ' ' + it.title + '：' + (detail.done || '已標記為已處理'), 'ok', {
      sub: left > 0 ? '還剩 ' + left + ' 件' : '今天的清單全部清空'
    });
    if (left === 0) {
      setTimeout(function () { A.toast('今天沒有需要你處理的事', 'ok'); }, 900);
    }
  }

  function undo(key) {
    if (!state.done[key]) return;
    delete state.done[key];
    refresh();
    A.toast('已放回待處理清單', 'neutral');
  }

  function resetAll() {
    state.done = {};
    state.seg = 'all';
    state.kind = 'all';
    state.q = '';
    storyClock = 8 * 60 + 40;
    renderToolbar();
    refresh();
    A.toast('已回到今天的初始清單', 'neutral');
  }

  /* ====================================================================
     10. 事件
     ==================================================================== */
  root.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var open = t.closest('[data-f15-open]');
    if (open) { openItem(open.getAttribute('data-f15-open')); return; }

    var back = t.closest('[data-f15-undo]');
    if (back) { undo(back.getAttribute('data-f15-undo')); return; }

    var clear = t.closest('[data-f15-clear]');
    if (clear) {
      state.seg = 'all'; state.kind = 'all'; state.q = '';
      renderToolbar(); renderCards();
      return;
    }

    var seg = t.closest('[data-f15-seg]');
    if (seg) {
      state.seg = seg.getAttribute('data-f15-seg');
      syncToolbar(); renderCards();
      return;
    }

    var toggle = t.closest('#f15-normal-toggle');
    if (toggle) {
      state.expanded = !state.expanded;
      toggle.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
      var body = document.getElementById('f15-normal-body');
      if (body) {
        body.hidden = !state.expanded;
        if (state.expanded && !body.innerHTML) fillNormal();
      }
      return;
    }
  });

  root.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'f15-kind') {
      state.kind = e.target.value;
      renderCards();
    }
  });
  root.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'f15-q') {
      state.q = e.target.value;
      renderCards();
    }
  });

  if (elPrimary) {
    elPrimary.addEventListener('click', function () {
      var next = pending()[0];
      if (!next) { resetAll(); return; }
      if (state.seg === 'done') { state.seg = 'all'; syncToolbar(); renderCards(); }
      var card = elCards.querySelector('[data-f15-card="' + next.key + '"]');
      if (card) {
        card.classList.add('is-focus');
        card.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
        setTimeout(function () { card.classList.remove('is-focus'); }, 1600);
      }
      openItem(next.key);
    });
  }

  A.onRole(function () {
    renderToolbar();
    renderNormal();          /* 金額欄位要依新角色重新打碼 */
    refresh();
  });

  /* ====================================================================
     11. 啟動
     ==================================================================== */
  function refresh() {
    renderHero();
    renderAlert();
    syncToolbar();
    renderCards();
    renderPrimary();
  }

  renderToolbar();
  renderNormal();
  refresh();
  A.reveal();
})();
