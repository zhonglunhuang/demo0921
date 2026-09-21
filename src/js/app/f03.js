/* f03.js — 空房招租漏斗（進系統操作）
 * 契約：docs/DESIGN.md §3（外殼與元件）§5（假資料）§6（文案）；票：tickets/DEMO-04 需求 #3。
 *
 * 畫面：概況 KPI → 空置警示 → 各區平均空置天數＋自動待辦 → 七欄招租看板 → 單間招租頁。
 * 可從頭點到尾：接收不續租通知 → 開始整備 → 開始招租 → 安排帶看 → 登記訂金 → 完成簽約 → 確認入住。
 *
 * 資料：一律讀 window.DB，不修改它。基礎層沒有的資料寫在本檔 EXTRA（DESIGN.md §6.1）。
 * 狀態只存在記憶體，重新整理回到初始狀態（提案 demo 不做持久化）。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB;
  if (!A || !D) return;

  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  /* ================================================================
   * EXTRA：基礎層（data.js）沒有的資料，只放在本檔
   * ================================================================ */
  var EXTRA = {
    /* 漏斗右三欄：本月已經走完流程的三間（房號與租客沿用 data.js，日期是本功能的流程紀錄） */
    closed: [
      { unitId: 'C14', stage: '已收訂', depositAt: '2026-09-18', depositAmount: 5000, newLease: '2026-10-01' },
      { unitId: 'B09', stage: '已簽約', depositAt: '2026-09-11', depositAmount: 5000, signedAt: '2026-09-16', newLease: '2026-09-28' },
      { unitId: 'A20', stage: '已入住', depositAt: '2026-08-28', depositAmount: 5000, signedAt: '2026-08-31', movedInAt: '2026-09-05' }
    ],
    /* 示範用：這一間的租客今天在 LINE 說不續租 */
    notice: {
      unitId: 'A08', at: '2026-09-21 10:12', moveOut: '2026-10-21',
      lines: [
        '您好，我工作調到新竹，下個月租約到期就不續租了',
        '10/21 可以點交嗎？押金再麻煩您'
      ]
    },
    /* 不續租通知進來後自動產生的四件待辦（票 DEMO-04 需求 #3） */
    autoTasks: [
      { key: 'photo', label: '拍攝招租照片', hint: '客廳、房間、衛浴各一組' },
      { key: 'rent', label: '確認租金建議', hint: '比對同區同房型行情' },
      { key: 'listing', label: '準備刊登資料', hint: '坪數、設備、交通與生活機能' },
      { key: 'clean', label: '排定清潔時間', hint: '點交後三天內完成' }
    ],
    /* 已經做完的待辦（B15 9/14 通知、E03 9/18 通知） */
    taskDone: { B15: ['photo', 'rent'], E03: ['photo'] },
    depositAmount: 5000,
    slots: ['10:00', '14:00', '19:00'],
    flagDays: 7,
    alertDays: 14
  };

  var STAGES = D.funnelStages.slice();          /* 即將空房 / 整備中 / 招租中 / 帶看預約 / 已收訂 / 已簽約 / 已入住 */
  var STAGE_META = {
    '即將空房': { icon: 'bell', kind: 'warn', action: '開始整備' },
    '整備中': { icon: 'wrench', kind: 'neutral', action: '開始招租' },
    '招租中': { icon: 'megaphone', kind: 'accent', action: '安排帶看' },
    '帶看預約': { icon: 'calendar', kind: 'accent', action: '登記訂金' },
    '已收訂': { icon: 'wallet', kind: 'ok', action: '完成簽約' },
    '已簽約': { icon: 'doc', kind: 'ok', action: '確認入住' },
    '已入住': { icon: 'user-check', kind: 'ok', action: null }
  };
  var VACANT_STAGES = ['整備中', '招租中', '帶看預約'];   /* 還沒有人住、也還沒收訂，對應 DB 的 prep + listing */
  var DEAL_STAGES = ['已收訂', '已簽約'];
  var REGIONS = ['全部'].concat(D.company.regions);
  var EDIT_ROLES = ['boss', 'manager'];

  /* ================================================================
   * 狀態
   * ================================================================ */
  var state = {
    region: '全部',
    onlyFlag: false,
    selected: 'A12',
    cards: [],
    tasks: [],
    showings: [],
    newId: null
  };

  function buildCard(unitId, stage, extra) {
    var u = D.unit(unitId);
    var c = {
      unitId: unitId, unit: u, stage: stage,
      region: u.region, type: u.type, ping: u.ping, floor: u.floor,
      listRent: u.listRent || u.rent,
      vacantSince: u.vacantSince || null,
      noticeAt: u.noticeAt || null,
      moveOut: u.moveOut || null,
      depositAt: null, depositAmount: 0, signedAt: null, movedInAt: null, newLease: null,
      copyReady: !!u.listRent, isNew: false
    };
    return Object.assign(c, extra || {});
  }

  function initState() {
    state.cards = [];
    D.units.forEach(function (u) {
      if (u.funnelStage) state.cards.push(buildCard(u.id, u.funnelStage));
    });
    EXTRA.closed.forEach(function (r) {
      state.cards.push(buildCard(r.unitId, r.stage, {
        depositAt: r.depositAt, depositAmount: r.depositAmount,
        signedAt: r.signedAt || null, movedInAt: r.movedInAt || null, newLease: r.newLease || null,
        copyReady: true
      }));
    });
    state.cards.sort(function (a, b) { return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || (a.unitId < b.unitId ? -1 : 1); });

    state.tasks = [];
    state.cards.forEach(function (c) {
      if (c.stage !== '即將空房') return;
      addTasks(c.unitId, (EXTRA.taskDone[c.unitId] || []));
    });

    state.showings = D.showings.map(function (s) { return Object.assign({}, s); });
  }

  function addTasks(unitId, doneKeys) {
    EXTRA.autoTasks.forEach(function (t) {
      state.tasks.push({
        id: unitId + '-' + t.key, unitId: unitId, key: t.key,
        label: t.label, hint: t.hint, done: (doneKeys || []).indexOf(t.key) >= 0
      });
    });
  }

  /* ================================================================
   * 小工具
   * ================================================================ */
  function findCard(id) {
    for (var i = 0; i < state.cards.length; i++) if (state.cards[i].unitId === id) return state.cards[i];
    return null;
  }
  function vacantDays(c) {
    if (!c.vacantSince || c.stage === '已入住' || c.stage === '即將空房') return 0;
    return Math.max(0, A.daysBetween(c.vacantSince, A.today));
  }
  function isFlagged(c) { return vacantDays(c) > EXTRA.flagDays; }
  function isAlert(c) { return vacantDays(c) > EXTRA.alertDays; }
  function canEdit() { return EDIT_ROLES.indexOf(A.role) >= 0; }
  function rentText(n) { return fmt.money(A.mask(n, 'rent')); }
  function tenantName(unitId) { var t = D.tenantOf(unitId); return t ? t.name : '—'; }
  function round100(n) { return Math.round(n / 100) * 100; }

  /* 同區、同房型、出租中的行情：最低、中位、最高（data.js 的 rentSuggestion 只給四分位，區間會塌成一個數） */
  function marketRange(c) {
    var peers = D.units.filter(function (x) {
      return x.region === c.region && x.type === c.type && x.status === 'rented' && x.id !== c.unitId;
    });
    var rents = peers.map(function (x) { return x.rent; }).sort(function (a, b) { return a - b; });
    if (!rents.length) return { low: c.listRent, mid: c.listRent, high: c.listRent, sample: 0 };
    var m = rents.length % 2 ? rents[(rents.length - 1) / 2] : Math.round((rents[rents.length / 2 - 1] + rents[rents.length / 2]) / 2);
    return { low: rents[0], mid: m, high: rents[rents.length - 1], sample: rents.length };
  }
  /* 建議租金：空置超過 14 天就往下探 3%，否則以中位數為準 */
  function suggestRent(c) {
    var m = marketRange(c);
    if (isAlert(c)) return round100(Math.min(c.listRent, m.mid) * 0.97);
    return Math.min(c.listRent, m.mid);
  }
  function suggestText(c) {
    var m = marketRange(c), s = suggestRent(c), d = vacantDays(c);
    if (s >= c.listRent) {
      return '目前刊登 ' + fmt.money(c.listRent) + '，已經在同區同房型中位數 ' + fmt.money(m.mid) + ' 之下，價格不是卡住的原因，建議補強照片與設備描述。';
    }
    var why = c.listRent > m.mid
      ? '高於同區同房型中位數 ' + fmt.money(m.mid)
      : '已經在同區下緣，詢問的人仍嫌貴';
    return '已空置 ' + d + ' 天，目前刊登 ' + fmt.money(c.listRent) + '，' + why + '。建議調到 ' + fmt.money(s) + ' 換成交速度。';
  }

  function leadsOf(unitId) { return D.leads.filter(function (l) { return l.unitId === unitId; }); }
  function showingsOf(unitId) {
    return state.showings.filter(function (s) { return s.unitId === unitId; })
      .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }
  function tasksOf(unitId) { return state.tasks.filter(function (t) { return t.unitId === unitId; }); }

  function listingCopy(c) {
    var u = c.unit, b = D.company.buildings[u.building];
    return [
      '【' + b.region + '｜' + u.type + '】' + u.ping + ' 坪，含全套家電家具，月租 ' + fmt.num(c.listRent) + ' 元',
      '地址：' + b.address + '（' + u.floor + ' 樓）',
      '設備：冷氣、冰箱、熱水器、床組、衣櫃、書桌，網路吃到飽',
      '交通：' + b.parkingRule,
      '生活：' + b.garbageDays,
      '押金兩個月，可短租討論，專人管理，報修 24 小時內回覆。'
    ].join('\n');
  }

  /* 空置天數樣本：目前空置中的房 ＋ 上個月已完成招租的房 */
  function vacancySamples(region) {
    var out = [];
    state.cards.forEach(function (c) {
      if (region && c.region !== region) return;
      if (VACANT_STAGES.indexOf(c.stage) < 0) return;
      if (!c.vacantSince) return;
      out.push(vacantDays(c));
    });
    D.units.forEach(function (u) {
      if (!u.pastVacantDays) return;
      if (region && u.region !== region) return;
      out.push(u.pastVacantDays);
    });
    return out;
  }
  function avgDays(list) {
    if (!list.length) return 0;
    return Math.round(list.reduce(function (a, b) { return a + b; }, 0) / list.length);
  }

  function filteredCards() {
    return state.cards.filter(function (c) {
      if (state.region !== '全部' && c.region !== state.region) return false;
      if (state.onlyFlag && !isFlagged(c)) return false;
      return true;
    });
  }

  /* ================================================================
   * 區塊：角色提示
   * ================================================================ */
  function renderRoleNote() {
    var host = document.getElementById('f03-role-note');
    if (canEdit()) { host.innerHTML = ''; return; }
    host.innerHTML = A.alert('', 'warn', {
      title: '目前是「' + A.roleName() + '」視角，只能檢視',
      html: '<p>推進招租流程、調整租金與登記訂金，要切換成老闆或租務管理員視角。' +
        (A.can('rent') ? '' : '這個視角也看不到租金，畫面上會顯示為點點。') + '</p>'
    });
  }

  /* ================================================================
   * 區塊：KPI
   * ================================================================ */
  function renderKpis() {
    var vacant = state.cards.filter(function (c) { return VACANT_STAGES.indexOf(c.stage) >= 0; });
    var deal = state.cards.filter(function (c) { return DEAL_STAGES.indexOf(c.stage) >= 0; });
    var alerts = state.cards.filter(isAlert);
    var leaving = state.cards.filter(function (c) { return c.stage === '即將空房'; });
    var avg = avgDays(vacancySamples(null));
    var alertHint = alerts.length
      ? alerts.map(function (c) { return c.unitId + ' ' + vacantDays(c) + ' 天'; }).join('、')
      : '沒有房間卡超過 14 天';

    document.getElementById('f03-kpis').innerHTML = [
      A.kpi({ label: '空置中物件', value: vacant.length, unit: ' 間', icon: 'door', hint: '另有 ' + deal.length + ' 間已收訂或簽約' }),
      A.kpi({ label: '平均空置天數', value: avg, unit: ' 天', icon: 'clock', hint: '含上個月完成招租的 5 間' }),
      A.kpi({ label: '空置超過 14 天', value: alerts.length, unit: ' 間', icon: 'alert', kind: alerts.length ? 'danger' : 'ok', hint: alertHint }),
      A.kpi({ label: '即將空房', value: leaving.length, unit: ' 間', icon: 'bell', hint: '租客已通知不續租' })
    ].join('');
  }

  /* ================================================================
   * 區塊：空置警示
   * ================================================================ */
  function renderAlert() {
    var host = document.getElementById('f03-alert');
    var alerts = state.cards.filter(isAlert).sort(function (a, b) { return vacantDays(b) - vacantDays(a); });
    if (!alerts.length) {
      host.innerHTML = A.alert('', 'ok', {
        title: '沒有房間卡超過 14 天',
        html: '<p>目前空置中的房間都還在 14 天內，維持現在的刊登與帶看節奏就好。</p>'
      });
      return;
    }
    var list = alerts.map(function (c) {
      return '<li>' + esc(c.unitId) + '（' + esc(c.region) + '）已空置 ' + vacantDays(c) + ' 天，' +
        '刊登 ' + esc(rentText(c.listRent)) + '，建議調到 ' + esc(rentText(suggestRent(c))) + '</li>';
    }).join('');
    host.innerHTML = A.alert('', 'danger', {
      title: alerts.length + ' 間空房超過 14 天，是否價格有問題',
      html: '<ul class="small" style="margin-top:4px;line-height:1.7">' + list + '</ul>' +
        '<div class="mt-8"><button type="button" class="btn btn--secondary btn--sm" data-act="open" data-unit="' + esc(alerts[0].unitId) + '">檢視 ' + esc(alerts[0].unitId) + ' 租金建議</button></div>'
    });
  }

  /* ================================================================
   * 區塊：各區平均空置天數
   * ================================================================ */
  function renderVacancy() {
    var all = avgDays(vacancySamples(null));
    var labels = D.company.regions.slice();
    var data = labels.map(function (r) { return avgDays(vacancySamples(r)); });
    document.getElementById('f03-vacancy-scope').textContent = '全部平均 ' + all + ' 天';
    A.charts.bar('#f03-vacancy-chart', {
      labels: labels,
      series: [{ name: '平均空置天數', data: data }],
      horizontal: true, legend: false, rowHeight: 32, ticks: 4,
      valueFormat: function (v) { return v + ' 天'; },
      yFormat: function (v) { return v + ' 天'; },
      colorOf: function (v) { return v > all ? 'var(--warn)' : 'var(--accent)'; },
      baseline: { value: all, label: '' }
    });
    var top = Math.max.apply(null, data);
    var worst = labels[data.indexOf(top)];
    document.getElementById('f03-vacancy-note').textContent = (top > all
      ? worst + ' 最久，平均 ' + top + ' 天，比全部平均多 ' + (top - all) + ' 天。'
      : '四個區的平均空置天數都在全部平均 ' + all + ' 天以內。')
      + '虛線是全部平均 ' + all + ' 天，橘色代表高於全部平均。';
  }

  /* ================================================================
   * 區塊：自動待辦
   * ================================================================ */
  function renderTasks() {
    var host = document.getElementById('f03-tasks');
    var units = state.cards.filter(function (c) { return c.stage === '即將空房'; });
    var open = state.tasks.filter(function (t) {
      return !t.done && units.some(function (c) { return c.unitId === t.unitId; });
    });
    document.getElementById('f03-task-count').textContent = open.length + ' 件待處理';

    if (!units.length) {
      host.innerHTML = A.emptyState({
        sm: true, icon: 'check-circle', title: '目前沒有即將空房的房間',
        text: '租客在 LINE 通知不續租後，系統會自動建立拍照、租金建議、刊登資料與清潔排程四件待辦。'
      });
      return;
    }
    host.innerHTML = units.map(function (c) {
      var items = tasksOf(c.unitId).map(function (t) {
        return { id: t.id, label: t.label, hint: t.hint, done: t.done };
      });
      var done = items.filter(function (i) { return i.done; }).length;
      return '<div class="mt-8">' +
        '<div class="row row--between" style="gap:8px">' +
          '<strong>' + esc(c.unitId) + '　<span class="muted small">' + esc(c.region) + '・' + esc(tenantName(c.unitId)) + ' 通知不續租</span></strong>' +
          '<span class="small muted-2 tnum">' + done + '／' + items.length + ' 完成</span>' +
        '</div>' +
        A.checklist(items, onTaskChange, { id: 'f03-task-' + c.unitId }) +
        '</div>';
    }).join('');
  }

  function onTaskChange(item, checked) {
    if (!item) return;
    if (!canEdit()) {
      A.toast('目前是「' + A.roleName() + '」視角，不能改待辦', 'warn');
      renderTasks();
      return;
    }
    state.tasks.forEach(function (t) { if (t.id === item.id) t.done = checked; });
    renderTasks();
    if (checked) A.toast('已完成「' + item.label + '」', 'ok', { ms: 2000 });
  }

  /* ================================================================
   * 區塊：招租看板
   * ================================================================ */
  function renderToolbar() {
    var host = document.getElementById('f03-board-toolbar');
    var seg = REGIONS.map(function (r) {
      return '<button type="button" class="tab' + (r === state.region ? ' is-active' : '') + '" data-act="region" data-region="' + esc(r) + '" aria-pressed="' + (r === state.region) + '">' + esc(r) + '</button>';
    }).join('');
    host.innerHTML = '<div class="segmented" role="group" aria-label="篩選區域">' + seg + '</div>' +
      '<button type="button" class="btn btn--sm ' + (state.onlyFlag ? 'btn--secondary' : 'btn--neutral') + '" data-act="toggle-flag" aria-pressed="' + state.onlyFlag + '">' +
        icon('filter') + '<span>只看空置超過 7 天</span></button>';
  }

  function cardHTML(c) {
    var meta = STAGE_META[c.stage];
    var days = vacantDays(c);
    var bits = [];
    if (c.stage === '即將空房') {
      bits.push('通知 ' + fmt.date(c.noticeAt));
      bits.push('退租 ' + fmt.date(c.moveOut));
    } else if (c.stage === '已入住') {
      bits.push('入住 ' + fmt.date(c.movedInAt));
      bits.push(esc(tenantName(c.unitId)));
    } else if (c.stage === '已簽約') {
      bits.push('簽約 ' + fmt.date(c.signedAt));
      bits.push('預計 ' + fmt.date(c.newLease) + ' 入住');
    } else if (c.stage === '已收訂') {
      bits.push('收訂 ' + fmt.date(c.depositAt));
      bits.push('訂金 ' + rentText(c.depositAmount));
    } else {
      bits.push('空置 ' + days + ' 天');
      bits.push(c.type + '・' + c.ping + ' 坪');
    }

    var flag = '';
    if (isFlagged(c)) {
      flag = '<div class="f03-card-flag f03-card-flag--' + (isAlert(c) ? 'danger' : 'warn') + '">' + icon('alert') +
        '<span>空置 ' + days + ' 天，是否價格有問題？建議 ' + esc(rentText(suggestRent(c))) + '</span></div>';
    }
    var prep = '';
    if (c.stage === '整備中') {
      var st = D.prepState[c.unitId];
      var doneN = st ? st.done.length : 0;
      prep = A.progress(doneN, { max: D.prepChecklist.length, label: '整備', valueLabel: doneN + '／' + D.prepChecklist.length + ' 項' });
    }

    var actions = meta.action
      ? '<button type="button" class="btn btn--secondary btn--sm btn--block" data-act="advance" data-unit="' + esc(c.unitId) + '"' + (canEdit() ? '' : ' disabled') + '>' + esc(meta.action) + '</button>'
      : '<span class="badge badge--ok">' + icon('check') + '流程完成</span>';
    actions += '<button type="button" class="link-more f03-card-link" data-act="open" data-unit="' + esc(c.unitId) + '">招租頁</button>';

    return '<article class="f03-card' + (c.unitId === state.selected ? ' is-selected' : '') + (c.unitId === state.newId ? ' is-new' : '') + '" data-unit="' + esc(c.unitId) + '">' +
      '<div class="f03-card-top"><span class="f03-card-id">' + esc(c.unitId) + '</span>' +
        '<span class="f03-card-region">' + esc(c.region) + '</span></div>' +
      '<div class="f03-card-meta">' + bits.map(function (b) { return '<span>' + b + '</span>'; }).join('') + '</div>' +
      '<div class="f03-card-rent">' + esc(rentText(c.listRent)) + '<small>／月</small></div>' +
      prep + flag +
      '<div class="f03-card-actions">' + actions + '</div>' +
      '</article>';
  }

  function renderBoard() {
    var host = document.getElementById('f03-board');
    var rows = filteredCards();
    document.getElementById('f03-board-count').textContent =
      rows.length === state.cards.length
        ? '共 ' + state.cards.length + ' 間在流程中'
        : '篩出 ' + rows.length + '／' + state.cards.length + ' 間';

    if (!rows.length) {
      host.innerHTML = A.emptyState({
        icon: 'search',
        title: '這個條件下沒有房間',
        text: '「' + state.region + '」目前沒有空置超過 7 天的房間。清除篩選可以看全部七個階段。',
        action: '<button type="button" class="btn btn--secondary" data-act="clear-filter">清除篩選</button>'
      });
      return;
    }
    host.innerHTML = '<div class="f03-board">' + STAGES.map(function (s) {
      var list = rows.filter(function (c) { return c.stage === s; });
      var meta = STAGE_META[s];
      return '<section class="f03-col" aria-label="' + esc(s) + '">' +
        '<div class="f03-col-head">' + icon(meta.icon) + '<span class="f03-col-name">' + esc(s) + '</span>' +
          '<span class="f03-col-count">' + list.length + '</span></div>' +
        (list.length ? list.map(cardHTML).join('') : '<p class="f03-col-empty">這一欄目前沒有房間</p>') +
        '</section>';
    }).join('') + '</div>';
    state.newId = null;
  }

  /* ================================================================
   * 區塊：招租頁
   * ================================================================ */
  function renderPicker() {
    var host = document.getElementById('f03-listing-picker');
    host.innerHTML = '<label class="sr-only" for="f03-unit">選擇房間</label>' +
      '<select class="select" id="f03-unit">' + state.cards.map(function (c) {
        return '<option value="' + esc(c.unitId) + '"' + (c.unitId === state.selected ? ' selected' : '') + '>' +
          esc(c.unitId + '　' + c.region + '　' + c.stage) + '</option>';
      }).join('') + '</select>';
  }

  function rangeBarHTML(c) {
    var m = marketRange(c), s = suggestRent(c);
    var lo = Math.min(m.low, c.listRent, s), hi = Math.max(m.high, c.listRent, s);
    var span = Math.max(1, hi - lo);
    function pos(v) { return (((v - lo) / span) * 100).toFixed(1) + '%'; }
    return '<div class="f03-range">' +
      '<div class="f03-range-bar">' +
        '<span class="f03-range-mark f03-range-mark--now" style="left:' + pos(c.listRent) + '" title="目前刊登"></span>' +
        '<span class="f03-range-mark" style="left:' + pos(s) + '" title="建議租金"></span>' +
      '</div>' +
      '<div class="f03-range-scale"><span>' + esc(rentText(lo)) + '</span><span>' + esc(rentText(hi)) + '</span></div>' +
      '<p class="small muted mt-8">黑色是目前刊登租金，藍色是建議租金。行情取同區同房型出租中的 ' + m.sample + ' 間。</p>' +
      '</div>';
  }

  function rentCardHTML(c) {
    var m = marketRange(c), s = suggestRent(c);
    var cta = (s < c.listRent && canEdit())
      ? '<button type="button" class="btn btn--secondary btn--sm" data-act="apply-rent" data-unit="' + esc(c.unitId) + '">套用建議租金</button>'
      : '';
    return '<article class="card card--static">' +
      '<div class="card-head"><h3 class="card-title">' + icon('tag') + '租金建議</h3>' + A.badge(c.region + '・' + c.type, 'neutral') + '</div>' +
      '<div class="card-body">' +
        '<div class="f03-rent-row">' +
          '<span class="f03-rent-now">' + esc(rentText(c.listRent)) + '<small>／月　目前刊登</small></span>' +
        '</div>' +
        A.statRow([
          { label: '同區最低', value: rentText(m.low) },
          { label: '同區中位', value: rentText(m.mid) },
          { label: '同區最高', value: rentText(m.high) },
          { label: '建議租金', value: rentText(s), kind: s < c.listRent ? 'danger' : 'ok' }
        ], { sm: true, divided: true }) +
        rangeBarHTML(c) +
        (isFlagged(c)
          ? A.alert('', isAlert(c) ? 'danger' : 'warn', {
              title: '空置 ' + vacantDays(c) + ' 天，是否價格有問題',
              html: '<p>' + esc(suggestText(c)) + '</p>' + (cta ? '<div class="mt-8">' + cta + '</div>' : '')
            })
          : '<p class="small muted">' + esc(suggestText(c)) + '</p>' + (cta ? '<div class="mt-8">' + cta + '</div>' : '')) +
      '</div></article>';
  }

  function copyCardHTML(c) {
    var ready = c.copyReady;
    return '<article class="card card--static">' +
      '<div class="card-head"><h3 class="card-title">' + icon('megaphone') + '刊登文案</h3>' +
        A.badge(ready ? '已產生' : '尚未產生', ready ? 'ok' : 'neutral') + '</div>' +
      '<div class="card-body">' +
        '<textarea class="f03-copy-box" id="f03-copy" aria-label="刊登文案" spellcheck="false">' +
          esc(ready ? listingCopy(c) : '') + '</textarea>' +
        '<p class="small muted">按「產生刊登文案」會依目前租金、坪數與棟別資料重新組一份，貼到 591 或社群都能用。</p>' +
        '<div class="row">' +
          '<button type="button" class="btn btn--secondary btn--sm" data-act="gen-copy" data-unit="' + esc(c.unitId) + '"' + (canEdit() ? '' : ' disabled') + '>' + icon('refresh') + '<span>產生刊登文案</span></button>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-act="copy-copy">' + icon('copy') + '<span>複製文案</span></button>' +
        '</div>' +
      '</div></article>';
  }

  function leadsCardHTML(c) {
    var rows = leadsOf(c.unitId);
    return '<article class="card card--static card--flush">' +
      '<div class="card-head"><h3 class="card-title">' + icon('inbox') + '詢問紀錄</h3>' + A.badge(rows.length + ' 組', 'neutral') + '</div>' +
      A.table({
        compact: true,
        columns: [
          { key: 'name', label: '姓名', primary: true, render: function (r) { return esc(r.name) + '<span class="cell-sub">' + esc(A.mask(r.phone, 'phone')) + '</span>'; } },
          { key: 'from', label: '來源' },
          { key: 'at', label: '時間', render: function (r) { return fmt.dateTime(r.at); } },
          { key: 'note', label: '備註' },
          { key: 'status', label: '狀態', render: function (r) { return A.badge(r.status, r.status === '待回覆' ? 'warn' : 'ok'); } }
        ],
        rows: rows,
        empty: { icon: 'inbox', title: '還沒有人詢問', text: '刊登文案發出去之後，591 與社群的詢問會收在這裡。' }
      }) +
      '</article>';
  }

  function calendarHTML(c) {
    var DOW = ['日', '一', '二', '三', '四', '五', '六'];
    var list = showingsOf(c.unitId);
    var cells = '';
    for (var i = 0; i < 7; i++) {
      var iso = A.addDays(A.today, i);
      var d = A.parseDate(iso);
      var n = list.filter(function (s) { return String(s.at).slice(0, 10) === iso; }).length;
      var dots = '';
      for (var k = 0; k < n; k++) dots += '<span class="f03-cal-dot"></span>';
      cells += '<button type="button" class="f03-cal-day' + (i === 0 ? ' is-today' : '') + '" data-act="add-showing" data-unit="' + esc(c.unitId) + '" data-date="' + iso + '"' + (canEdit() ? '' : ' disabled') + '>' +
        '<span class="f03-cal-dow">' + DOW[d.getDay()] + '</span>' +
        '<span class="f03-cal-date">' + d.getDate() + '</span>' +
        '<span class="f03-cal-dots">' + dots + '</span>' +
        '<span class="f03-cal-add">' + (n ? n + ' 組' : '＋') + '</span>' +
        '</button>';
    }
    var rows = list.length
      ? list.map(function (s) {
        var staff = D.staffById(s.staffId);
        return '<div class="f03-showing">' +
          '<span class="f03-showing-when">' + fmt.date(s.at).slice(5) + ' ' + fmt.time(s.at) + '</span>' +
          '<span class="f03-showing-who">' + esc(s.name) + '<span class="muted">　帶看 ' + esc(staff ? staff.name : '待指派') + '</span></span>' +
          A.badge(s.status + (s.result ? '・' + s.result : ''), s.status === '已完成' ? 'neutral' : 'accent') + '</div>';
      }).join('')
      : A.emptyState({ sm: true, icon: 'calendar', title: '這間還沒有帶看預約', text: '點上面的日期就能排一組帶看。' });

    var upcoming = list.filter(function (s) { return s.at >= A.today; }).length;
    return '<article class="card card--static">' +
      '<div class="card-head"><h3 class="card-title">' + icon('calendar') + '帶看預約</h3>' +
        A.badge(upcoming ? '待帶看 ' + upcoming + ' 組' : list.length + ' 組', upcoming ? 'accent' : 'neutral') + '</div>' +
      '<div class="card-body">' +
        '<p class="small muted">' + fmt.date(A.today) + ' ～ ' + fmt.date(A.addDays(A.today, 6)) + '，點日期加一組帶看。</p>' +
        '<div class="f03-cal">' + cells + '</div>' +
        '<div class="mt-16">' + rows + '</div>' +
      '</div></article>';
  }

  function dealCardHTML(c) {
    var i = STAGES.indexOf(c.stage);
    var hasDeposit = !!c.depositAt;
    var lines = [
      { label: '訂金', value: hasDeposit ? rentText(c.depositAmount) + '（' + fmt.date(c.depositAt) + ' 收）' : '尚未收訂' },
      { label: '簽約', value: c.signedAt ? fmt.date(c.signedAt) + ' 完成' : '尚未簽約' },
      { label: '入住', value: c.movedInAt ? fmt.date(c.movedInAt) + ' 已入住' : (c.newLease ? '預計 ' + fmt.date(c.newLease) : '未定') }
    ];
    var btns = '';
    if (i >= 0 && i < STAGES.length - 1 && STAGE_META[c.stage].action) {
      btns = '<button type="button" class="btn btn--secondary" data-act="advance" data-unit="' + esc(c.unitId) + '"' + (canEdit() ? '' : ' disabled') + '>' +
        esc(STAGE_META[c.stage].action) + '</button>';
    }
    return '<article class="card card--static">' +
      '<div class="card-head"><h3 class="card-title">' + icon('wallet') + '訂金與簽約</h3>' + A.badge(c.stage, STAGE_META[c.stage].kind) + '</div>' +
      '<div class="card-body">' +
        '<dl class="kv">' + lines.map(function (l) {
          return '<dt>' + esc(l.label) + '</dt><dd>' + esc(l.value) + '</dd>';
        }).join('') + '</dl>' +
        '<p class="small muted">訂金收 ' + fmt.money(EXTRA.depositAmount) + '，簽約時折抵首期租金。簽約要用的租約與點交表在「自動產生文件」一鍵產生。</p>' +
        (btns ? '<div class="row">' + btns + '</div>' : '') +
      '</div></article>';
  }

  function renderListing() {
    var c = findCard(state.selected) || state.cards[0];
    if (!c) { document.getElementById('f03-listing').innerHTML = ''; return; }
    state.selected = c.unitId;
    document.getElementById('f03-listing').innerHTML =
      '<div class="f03-panel">' +
        '<div class="stack">' + rentCardHTML(c) + copyCardHTML(c) + '</div>' +
        '<div class="stack">' + calendarHTML(c) + leadsCardHTML(c) + dealCardHTML(c) + '</div>' +
      '</div>';
  }

  /* ================================================================
   * 動作
   * ================================================================ */
  function guard() {
    if (canEdit()) return true;
    A.toast('目前是「' + A.roleName() + '」視角，不能改招租流程', 'warn');
    return false;
  }

  function advance(unitId) {
    if (!guard()) return;
    var c = findCard(unitId);
    if (!c) return;
    var i = STAGES.indexOf(c.stage);
    if (i < 0 || i >= STAGES.length - 1) return;
    var next = STAGES[i + 1];

    if (next === '已收訂') { askDeposit(c); return; }
    if (next === '已簽約') { askSign(c); return; }

    c.stage = next;
    state.newId = null;
    if (next === '整備中') {
      c.vacantSince = A.today;
      A.toast(c.unitId + ' 已點交，開始整備', 'ok', { sub: '整備清單在「退租整備流程」逐項打勾' });
    } else if (next === '招租中') {
      c.copyReady = true;
      A.toast(c.unitId + ' 開始招租，刊登文案已產生', 'ok');
    } else if (next === '帶看預約') {
      state.selected = c.unitId;
      A.toast(c.unitId + ' 進入帶看預約，請在招租頁選日期', 'ok');
    } else if (next === '已入住') {
      c.movedInAt = A.today;
      A.toast(c.unitId + ' 已入住，空置結束', 'ok', { sub: '這間房回到出租中庫存' });
    }
    renderAll();
    if (next === '帶看預約') focusListing();
  }

  function askDeposit(c) {
    A.confirm({
      title: '登記訂金 ' + fmt.money(EXTRA.depositAmount) + '？',
      text: c.unitId + ' 收訂後會移到「已收訂」，訂金在簽約時折抵首期租金。',
      confirmLabel: '登記訂金'
    }).then(function (ok) {
      if (!ok) return;
      c.stage = '已收訂';
      c.depositAt = A.today;
      c.depositAmount = EXTRA.depositAmount;
      A.toast(c.unitId + ' 已收訂 ' + fmt.money(EXTRA.depositAmount), 'ok');
      renderAll();
    });
  }

  function askSign(c) {
    A.modal({
      title: '完成 ' + c.unitId + ' 簽約',
      size: 'sm',
      body: '<p>租約與點交表已經照這間的租金、坪數與押金備好，可以到「自動產生文件」列印或用 LINE 送給租客。</p>' +
        '<p class="muted small">簽約後這間會移到「已簽約」，等確認入住就結束整條招租流程。</p>' +
        '<p><a class="link-more" href="' + esc(A.link('f17', 'app')) + '">到自動產生文件</a></p>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '完成簽約', kind: 'primary', onClick: function () {
          c.stage = '已簽約';
          c.signedAt = A.today;
          c.newLease = A.addDays(A.today, 7);
          A.toast(c.unitId + ' 已完成簽約，預計 ' + fmt.date(c.newLease) + ' 入住', 'ok');
          renderAll();
        } }
      ]
    });
  }

  function applyRent(unitId) {
    if (!guard()) return;
    var c = findCard(unitId);
    if (!c) return;
    var before = c.listRent, after = suggestRent(c);
    if (after >= before) { A.toast('目前租金已經低於建議價，不用再調', 'neutral'); return; }
    c.listRent = after;
    c.copyReady = true;
    A.toast(c.unitId + ' 租金由 ' + fmt.money(before) + ' 調為 ' + fmt.money(after), 'ok', { sub: '刊登文案已同步更新' });
    renderAll();
  }

  function genCopy(unitId) {
    if (!guard()) return;
    var c = findCard(unitId);
    if (!c) return;
    c.copyReady = true;
    renderListing();
    A.toast(c.unitId + ' 刊登文案已產生', 'ok', { sub: '可以直接複製貼到 591 或社群' });
  }

  function copyCopy() {
    var box = document.getElementById('f03-copy');
    if (!box || !box.value.trim()) { A.toast('還沒有文案可以複製，請先產生', 'warn'); return; }
    var text = box.value;
    function done() { A.toast('刊登文案已複製，可以貼到 591 或社群', 'ok'); }
    function fallback() {
      var ok = false;
      try { box.focus(); box.select(); ok = !!(document.execCommand && document.execCommand('copy')); } catch (e) { ok = false; }
      if (ok) done();
      else A.toast('這個瀏覽器不能自動複製，請直接選取文案', 'warn');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  function askShowing(unitId, iso) {
    if (!guard()) return;
    var c = findCard(unitId);
    if (!c) return;
    var pool = leadsOf(unitId);
    var opts = pool.map(function (l) { return '<option value="' + esc(l.name) + '">' + esc(l.name + '（' + l.from + '）') + '</option>'; }).join('');
    var staff = D.staff.filter(function (s) { return s.role === 'manager'; });
    A.modal({
      title: '新增 ' + fmt.date(iso) + ' 的帶看',
      size: 'sm',
      body: '<div class="stack">' +
        '<div class="field"><label for="f03-sh-name">看房人</label>' +
          (opts
            ? '<select class="select" id="f03-sh-name">' + opts + '</select>'
            : '<input class="input" id="f03-sh-name" type="text" placeholder="看房人姓名" value="">') +
        '</div>' +
        '<div class="field"><label for="f03-sh-time">時間</label>' +
          '<select class="select" id="f03-sh-time">' + EXTRA.slots.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('') + '</select>' +
        '</div>' +
        '<div class="field"><label for="f03-sh-staff">帶看同事</label>' +
          '<select class="select" id="f03-sh-staff">' + staff.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</select>' +
        '</div>' +
      '</div>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '新增預約', kind: 'primary', onClick: function () {
          var nameEl = document.getElementById('f03-sh-name');
          var name = nameEl ? String(nameEl.value || '').trim() : '';
          if (!name) { A.toast('請先填看房人姓名', 'warn'); return false; }
          var time = document.getElementById('f03-sh-time').value;
          var staffId = document.getElementById('f03-sh-staff').value;
          state.showings.push({
            id: 'SH-' + (300 + state.showings.length), unitId: unitId, name: name,
            at: iso + ' ' + time, staffId: staffId, status: '已預約'
          });
          state.selected = unitId;
          A.toast('已新增 ' + fmt.date(iso) + ' ' + time + ' 帶看', 'ok', { sub: name + '・' + (D.staffById(staffId) || {}).name });
          renderAll();
        } }
      ]
    });
  }

  function openNotice() {
    var n = EXTRA.notice;
    if (findCard(n.unitId)) { A.toast(n.unitId + ' 已經在招租看板上', 'neutral'); focusBoard(); return; }
    var t = D.tenantOf(n.unitId);
    A.modal({
      title: '租客在 LINE 通知不續租',
      size: 'lg',
      body: '<div class="row" style="align-items:flex-start;gap:20px">' +
        A.phone({
          sm: true, title: t ? t.name : '租客', sub: n.unitId + '・' + D.unit(n.unitId).region, input: false,
          messages: [{ from: 'day', text: '今天' }].concat(n.lines.map(function (line, i) {
            return { from: 'them', text: line, at: i === 0 ? '10:12' : '10:12', read: true };
          }))
        }) +
        '<div class="stack" style="flex:1 1 240px;min-width:0">' +
          '<p>系統讀到「不續租」，會把 ' + esc(n.unitId) + ' 切成「即將空房」，並自動建立四件待辦：拍照、租金建議、刊登資料、清潔排程。</p>' +
          '<dl class="kv"><dt>房間</dt><dd>' + esc(n.unitId) + '　' + esc(D.unit(n.unitId).region) + '　' + esc(D.unit(n.unitId).type) + '</dd>' +
          '<dt>租客</dt><dd>' + esc(t ? t.name : '—') + '</dd>' +
          '<dt>退租日</dt><dd>' + fmt.date(n.moveOut) + '</dd>' +
          '<dt>現在月租</dt><dd>' + esc(rentText(D.unit(n.unitId).rent)) + '</dd></dl>' +
          '<p class="muted small">不建立也沒關係，之後在租客資料裡一樣可以手動開空房流程。</p>' +
        '</div></div>',
      actions: [
        { label: '先不處理', kind: 'ghost' },
        { label: '建立空房流程', kind: 'primary', onClick: acceptNotice }
      ]
    });
  }

  function acceptNotice() {
    var n = EXTRA.notice;
    if (findCard(n.unitId)) return;
    var c = buildCard(n.unitId, '即將空房', { noticeAt: A.today, moveOut: n.moveOut, copyReady: false });
    state.cards.unshift(c);
    addTasks(n.unitId, []);
    state.newId = n.unitId;
    state.selected = n.unitId;
    state.region = '全部';
    state.onlyFlag = false;
    renderAll();
    A.toast(n.unitId + ' 已進入「即將空房」，同時建立 4 件待辦', 'ok', { sub: '拍照、租金建議、刊登資料、清潔排程' });
    focusBoard();
  }

  function focusBoard() {
    var el = document.getElementById('f03-board');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function focusListing() {
    var el = document.getElementById('f03-listing');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openUnit(unitId) {
    if (!findCard(unitId)) return;
    state.selected = unitId;
    renderBoard();
    renderListing();
    focusListing();
  }

  /* ================================================================
   * 事件
   * ================================================================ */
  function onClick(e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var btn = t.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-act');
    var unitId = btn.getAttribute('data-unit');

    if (act === 'region') {
      state.region = btn.getAttribute('data-region');
      renderToolbar(); renderBoard();
    } else if (act === 'toggle-flag') {
      state.onlyFlag = !state.onlyFlag;
      renderToolbar(); renderBoard();
    } else if (act === 'clear-filter') {
      state.region = '全部'; state.onlyFlag = false;
      renderToolbar(); renderBoard();
      A.toast('已清除篩選', 'neutral', { ms: 1800 });
    } else if (act === 'advance') {
      advance(unitId);
    } else if (act === 'open') {
      openUnit(unitId);
    } else if (act === 'apply-rent') {
      applyRent(unitId);
    } else if (act === 'gen-copy') {
      genCopy(unitId);
    } else if (act === 'copy-copy') {
      copyCopy();
    } else if (act === 'add-showing') {
      askShowing(unitId, btn.getAttribute('data-date'));
    }
  }

  function onChange(e) {
    var t = e.target;
    if (t instanceof Element && t.id === 'f03-unit') {
      state.selected = t.value;
      renderBoard();
      renderListing();
    }
  }

  function renderAll() {
    renderRoleNote();
    renderKpis();
    renderAlert();
    renderVacancy();
    renderTasks();
    renderToolbar();
    renderBoard();
    renderPicker();
    renderListing();
    A.reveal();
  }

  /* ================================================================
   * 啟動
   * ================================================================ */
  initState();
  renderAll();
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.getElementById('f03-notice-btn').addEventListener('click', openNotice);
  A.onRole(function () { renderAll(); });
})();
