/* js/app/f05.js — 退租整備流程（f05）進系統操作頁
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）、§6.1（檔案所有權）。
 * 資料：一律讀 window.DB；基礎層沒有的欄位（前租客、點交備註、整備歷史）放在本檔的 EXTRA。
 * 狀態：全部存在記憶體，重新整理即回到初始狀態（提案 demo，不做持久化）。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D) return;

  var esc = A.esc;
  var icon = A.icon;
  var fmt = A.fmt;
  var CHECK = D.prepChecklist;          /* 14 項整備清單（DESIGN.md §5） */
  var TOTAL = CHECK.length;

  /* ================================================================
   * 1. 基礎層沒有的資料（只在本檔補，不動 data.js）
   * ================================================================ */
  var EXTRA = {
    /* 工單 ↔ 整備項目：工單完工後自動勾選對應項目 */
    woItem: { 'WO-1044': 'paint', 'WO-1045': 'clean', 'WO-1049': 'paint' },

    /* 每間退租房的前租客、點交與整備紀錄 */
    rooms: {
      B15: {
        stage: 'leaving', tenantFrom: 'unit', staffId: 'S02',
        noticeAt: '2026-09-14', handoverAt: '2026-10-14 14:00',
        note: '租客已通知不續租，點交時間已回覆確認。',
        deductions: [
          { item: '欠繳水電費', amount: 860, basis: '9 月水電帳單' },
          { item: '門禁磁扣短少 1 張', amount: 300, basis: '點交清點 2026-10-14' }
        ]
      },
      E03: {
        stage: 'leaving', tenantFrom: 'unit', staffId: 'S03',
        noticeAt: '2026-09-18', handoverAt: '2026-10-31 10:00',
        note: '租客已通知不續租，點交時間待租客回覆。',
        deductions: []
      },
      C20: {
        stage: 'prep', tenantName: '張○○', staffId: 'S02',
        handoverAt: '2026-09-10 15:00', startedAt: '2026-09-10',
        workOrders: ['WO-1044', 'WO-1045'],
        deductions: [
          { item: '遺留物清運', amount: 1200, basis: '點交照片 2026-09-10' },
          { item: '牆面補漆分攤', amount: 2000, basis: '牆面檢查照片、油漆工單 WO-1044' }
        ],
        meta: {
          meter: '09/10 陳○○ · 讀數 8,421 度',
          keys: '09/10 陳○○ · 已全數回收',
          furniture: '09/11 陳○○ · 與入住點交表相符',
          wall: '09/11 陳○○ · 壁癌 3 處',
          mattress: '09/11 陳○○ · 無污漬',
          aircon: '09/12 吳○○ · 濾網已洗',
          bath: '09/12 吳○○ · 矽利康重打',
          trash: '09/12 潔淨清潔 · 已清運 2 大件',
          bills: '09/13 黃○○ · 結算至 09/10'
        },
        photos: [
          { src: '../assets/f05-photo-meter.svg', cap: '電表讀數 8,421 度 · 09/10' },
          { src: '../assets/f05-photo-handover.svg', cap: '點交現場，遺留物待清運 · 09/10' },
          { src: '../assets/f05-photo-wall.svg', cap: '牆面壁癌 3 處 · 09/11' }
        ]
      },
      D15: {
        stage: 'done', tenantName: '許○○', staffId: 'S03',
        handoverAt: '2026-09-11 11:00', startedAt: '2026-09-11', completedAt: '2026-09-16',
        workOrders: ['WO-1049'],
        deductions: [{ item: '雜項小修分攤', amount: 600, basis: '工單 WO-1049 完工單' }],
        result: '整備 5 天完成，已回到招租中，目前有 2 組帶看預約。',
        photos: [
          { src: '../assets/f05-photo-handover.svg', cap: '點交現場 · 09/11' },
          { src: '../assets/f05-photo-room.svg', cap: '整備完成後重新拍攝 · 09/16' }
        ]
      },
      C14: {
        stage: 'done', tenantName: '楊○○', staffId: 'S02',
        handoverAt: '2026-09-02 10:00', startedAt: '2026-09-02', completedAt: '2026-09-06',
        workOrders: [], deductions: [],
        result: '整備 4 天完成，是本月最快的一間，已重新出租。',
        photos: [{ src: '../assets/f05-photo-room.svg', cap: '整備完成後重新拍攝 · 09/06' }]
      },
      E08: {
        stage: 'done', tenantName: '賴○○', staffId: 'S03',
        handoverAt: '2026-09-05 16:00', startedAt: '2026-09-05', completedAt: '2026-09-12',
        workOrders: [], deductions: [{ item: '退租清潔', amount: 2200, basis: '清潔工單完工單' }],
        result: '整備 7 天完成，清潔排程等了 3 天，已重新出租。',
        photos: [{ src: '../assets/f05-photo-room.svg', cap: '整備完成後重新拍攝 · 09/12' }]
      },
      A20: {
        stage: 'done', tenantName: '周○○', staffId: 'S02',
        handoverAt: '2026-08-05 14:00', startedAt: '2026-08-06', completedAt: '2026-08-12',
        workOrders: [], deductions: [{ item: '退租清潔', amount: 2500, basis: '清潔工單 WO-1008' }],
        result: '整備 6 天完成，押金已於 2026/08/19 退還。',
        photos: [{ src: '../assets/f05-photo-room.svg', cap: '整備完成後重新拍攝 · 08/12' }]
      }
    },

    /* 整備後重新拍照時補上的照片 */
    afterPhotos: [
      { src: '../assets/f05-photo-room.svg', cap: '整備完成，刊登主圖' },
      { src: '../assets/f05-photo-meter.svg', cap: '電表歸零讀數，交屋備查' }
    ],

    prepRule: D.escalationRules.filter(function (r) { return r.event === '退租整備逾期'; })[0]
  };

  var ORDER = ['B15', 'E03', 'C20', 'D15', 'C14', 'E08', 'A20'];
  var STAGE_NAME = { leaving: '即將空房', prep: '整備中', done: '已完成整備' };
  var STAGE_KIND = { leaving: 'warn', prep: 'accent', done: 'ok' };
  var CAN_RELIST = ['boss', 'manager'];

  /* ================================================================
   * 2. 狀態（記憶體）
   * ================================================================ */
  function buildRoom(id) {
    var src = EXTRA.rooms[id];
    var u = D.unit(id);
    var seed = D.prepState[id];
    var done = {};
    if (src.stage === 'done') CHECK.forEach(function (c) { done[c.key] = true; });
    else if (seed) seed.done.forEach(function (k) { done[k] = true; });

    var wos = (src.workOrders || []).map(function (wid) {
      var w = D.workOrder(wid);
      return { id: wid, title: w.title, item: w.item, status: w.status, vendor: D.vendorById(w.vendorId), quote: w.quote };
    });
    if (src.stage === 'done') wos.forEach(function (w) { w.status = '完成'; });

    return {
      id: id, unit: u, stage: src.stage,
      tenantName: src.tenantName || (D.tenantOf(id) ? D.tenantOf(id).name : '前租客'),
      staff: D.staffById(src.staffId),
      noticeAt: src.noticeAt || null,
      handoverAt: src.handoverAt,
      startedAt: src.startedAt || null,
      completedAt: src.completedAt || null,
      note: src.note || '',
      result: src.result || '',
      deposit: u.downstream.deposit,
      deductions: (src.deductions || []).slice(),
      depositSettled: src.stage === 'done',
      workOrders: wos,
      done: done,
      notes: {},
      meta: src.meta || {},
      photos: (src.photos || []).slice()
    };
  }

  var state = {
    rooms: ORDER.map(buildRoom),
    selected: 'C20',
    stage: 'all',
    region: '全部'
  };

  function room(id) {
    for (var i = 0; i < state.rooms.length; i++) if (state.rooms[i].id === id) return state.rooms[i];
    return null;
  }
  function doneCount(r) { var n = 0; CHECK.forEach(function (c) { if (r.done[c.key]) n++; }); return n; }
  function prepDays(r) {
    if (!r.startedAt) return 0;
    return Math.max(0, A.daysBetween(r.startedAt, r.completedAt || D.today));
  }
  function overdueDays(r) { return r.stage === 'prep' ? prepDays(r) : 0; }
  function isOverdue(r) { return overdueDays(r) >= 7; }
  function deductTotal(r) { var t = 0; r.deductions.forEach(function (d) { t += d.amount; }); return t; }
  function thisMonthDone() {
    return state.rooms.filter(function (r) {
      return r.stage === 'done' && r.completedAt && r.completedAt.slice(0, 7) === D.currentMonth;
    });
  }
  function avgPrepDays() {
    var list = state.rooms.filter(function (r) { return r.stage === 'done'; });
    if (!list.length) return 0;
    var t = 0;
    list.forEach(function (r) { t += prepDays(r); });
    return Math.round(t / list.length * 10) / 10;
  }
  function canRelist() { return CAN_RELIST.indexOf(A.role) >= 0; }
  function canDeposit() { return A.can(A.role, 'deposit'); }

  /* ================================================================
   * 3. 渲染
   * ================================================================ */
  var $ = function (sel) { return document.querySelector(sel); };

  function renderKpis() {
    var waiting = state.rooms.filter(function (r) { return r.stage !== 'done'; });
    var leaving = waiting.filter(function (r) { return r.stage === 'leaving'; }).length;
    var inPrep = waiting.filter(function (r) { return r.stage === 'prep'; }).length;
    var late = state.rooms.filter(isOverdue);
    var monthDone = thisMonthDone();
    var avg = avgPrepDays();

    $('#f05-kpis').innerHTML = [
      A.kpi({
        label: '待整備物件', icon: 'door', value: waiting.length, unit: ' 間',
        hint: '即將空房 ' + leaving + ' 間、整備中 ' + inPrep + ' 間'
      }),
      A.kpi({
        label: '整備逾期', icon: 'alert', value: late.length, unit: ' 間',
        kind: late.length ? 'danger' : 'ok',
        hint: late.length ? late.map(function (r) { return r.id + ' 已 ' + prepDays(r) + ' 天'; }).join('、') : '沒有超過 7 天的整備'
      }),
      A.kpi({
        label: '本月完成整備', icon: 'check-circle', value: monthDone.length, unit: ' 間',
        hint: monthDone.length ? monthDone.map(function (r) { return r.id; }).join('、') : '本月還沒有完成的整備'
      }),
      A.kpi({
        label: '平均整備天數', icon: 'clock', value: avg, unit: ' 天',
        hint: '近 ' + state.rooms.filter(function (r) { return r.stage === 'done'; }).length + ' 件平均，全社區平均空置 ' + D.stats.avgVacantDays + ' 天'
      })
    ].join('');
  }

  function renderAlerts() {
    var out = [];
    var late = state.rooms.filter(isOverdue);
    late.forEach(function (r) {
      out.push(A.alert('', 'danger', {
        title: r.id + ' 整備已 ' + prepDays(r) + ' 天，超過 7 天提醒線',
        html: '<p>還有 ' + (TOTAL - doneCount(r)) + ' 項沒完成，再 ' + Math.max(0, 14 - prepDays(r)) + ' 天就會列入老闆的工作中心。空著一天就少收一天租金。</p>',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="focus" data-room="' + r.id + '">查看 ' + r.id + '</button>'
      }));
    });
    var d11 = D.deposits.filter(function (d) { return d.unitId === 'D11' && d.status === '逾期未結算'; })[0];
    if (d11) {
      out.push(A.alert('', 'warn', {
        title: 'D11 前租客退租已 ' + d11.daysSinceMoveOut + ' 天，押金還沒結算',
        html: '<p>押金 ' + fmt.money(A.mask(d11.amount, 'deposit')) + '仍在公司帳上，扣款項目已經列了 ' + d11.deductions.length + ' 筆。拖越久越容易有爭議。</p>',
        action: '<a class="btn btn--secondary btn--sm" href="' + A.link('f04', 'app') + '">到押金管理</a>'
      }));
    }
    $('#f05-alerts').innerHTML = out.join('');
  }

  function roomMatch(r) {
    if (state.stage !== 'all' && r.stage !== state.stage) return false;
    if (state.region !== '全部' && r.unit.region !== state.region) return false;
    return true;
  }

  function renderTabs() {
    $('#f05-stage-tabs').outerHTML = A.tabs([
      { id: 'all', label: '全部' },
      { id: 'leaving', label: '即將空房' },
      { id: 'prep', label: '整備中' },
      { id: 'done', label: '已完成' }
    ], { segmented: true, block: true, active: state.stage, className: 'f05-stage-tabs' });
    var el = document.querySelector('.f05-stage-tabs');
    if (el) el.id = 'f05-stage-tabs';
  }

  function renderRegion() {
    var sel = $('#f05-region');
    var opts = ['全部'].concat(D.company.regions);
    sel.innerHTML = opts.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === state.region ? ' selected' : '') + '>' + esc(o === '全部' ? '全部區域' : o) + '</option>';
    }).join('');
  }

  function renderRooms() {
    var list = state.rooms.filter(roomMatch);
    if (!list.length) {
      $('#f05-rooms').innerHTML = A.emptyState({
        icon: 'door',
        title: '這個條件下沒有退租物件',
        text: '目前 ' + (state.region === '全部' ? '全部區域' : state.region) + '沒有「' + (state.stage === 'all' ? '退租' : STAGE_NAME[state.stage]) + '」的房間。換個條件或清除篩選再看看。',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="clear-filter">清除篩選</button>'
      });
      return;
    }
    $('#f05-rooms').innerHTML = '<p class="card-sub f05-count">符合條件 ' + list.length + ' 間</p>' + list.map(function (r) {
      var n = doneCount(r);
      var u = r.unit;
      var right = A.badge(STAGE_NAME[r.stage], STAGE_KIND[r.stage]) +
        (isOverdue(r) ? A.badge('逾期 ' + prepDays(r) + ' 天', 'danger') : '');
      return '<button type="button" class="f05-room' + (r.id === state.selected ? ' is-active' : '') + '" data-act="select" data-room="' + r.id + '" aria-pressed="' + (r.id === state.selected) + '">' +
        '<span class="f05-room-id">' + esc(r.id) + '</span>' +
        '<span class="f05-room-right">' + right + '</span>' +
        '<span class="f05-room-sub">' + esc(u.region + ' · ' + u.type + ' · ' + u.ping + ' 坪') + '</span>' +
        (r.stage === 'leaving'
          ? '<span class="f05-room-sub">點交 ' + esc(fmt.date(r.handoverAt)) + '</span>'
          : '<span class="f05-room-sub f05-room-progress">已完成 ' + n + ' ／ ' + TOTAL + ' 項</span>' +
            A.progress(n, { max: TOTAL, kind: n === TOTAL ? 'ok' : (isOverdue(r) ? 'danger' : null) })) +
        '</button>';
    }).join('');
  }

  /* ---------------- 整備詳情 ---------------- */
  function headHTML(r) {
    var u = r.unit;
    var sub = [u.region + ' · ' + u.type, u.ping + ' 坪 · ' + u.floor + ' 樓', '前租客 ' + r.tenantName, '負責人 ' + r.staff.name];
    return '<div class="f05-detail-head">' +
      '<div><div class="f05-detail-title"><h2>' + esc(r.id) + '</h2>' +
        A.badge(STAGE_NAME[r.stage], STAGE_KIND[r.stage]) +
        (isOverdue(r) ? A.badge('逾期 ' + prepDays(r) + ' 天', 'danger') : '') +
      '</div><p class="f05-detail-sub">' + sub.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</p></div>' +
      '</div>';
  }

  function summaryHTML(r) {
    var items = [];
    if (r.stage === 'leaving') {
      items.push({ label: '收到退租通知', value: fmt.date(r.noticeAt) });
      items.push({ label: '預定點交', value: fmt.dateTime(r.handoverAt) });
      items.push({ label: '距離點交', value: A.daysBetween(D.today, r.handoverAt) + ' 天' });
    } else {
      items.push({ label: '點交完成', value: fmt.date(r.handoverAt) });
      items.push({ label: '整備天數', value: prepDays(r) + ' 天', kind: isOverdue(r) ? 'danger' : null });
      items.push({ label: '已完成項目', value: doneCount(r) + ' ／ ' + TOTAL });
      items.push({ label: '押金結算', value: r.depositSettled ? '已結算' : '未結算', kind: r.depositSettled ? 'ok' : 'danger' });
    }
    return A.statRow(items, { divided: true });
  }

  function itemMeta(r, c) {
    if (r.done[c.key] && r.meta[c.key]) return r.meta[c.key];
    if (r.done[c.key]) return r.completedAt ? fmt.date(r.completedAt) : '今天 · ' + r.staff.name;
    if (c.key === 'paint' || c.key === 'clean') {
      var w = openWoFor(r, c.key);
      if (w) return w.id + ' ' + w.status;
    }
    if (c.key === 'deposit' && !canDeposit()) return '需要會計權限';
    return '';
  }
  function openWoFor(r, key) {
    for (var i = 0; i < r.workOrders.length; i++) {
      if (EXTRA.woItem[r.workOrders[i].id] === key && r.workOrders[i].status !== '完成') return r.workOrders[i];
    }
    return null;
  }

  function checklistHTML(r) {
    var readOnly = r.stage === 'done';
    return '<ul class="checklist f05-check">' + CHECK.map(function (c) {
      var id = 'f05-chk-' + c.key;
      var isDone = !!r.done[c.key];
      var locked = readOnly || (c.key === 'deposit' && !canDeposit());
      var meta = itemMeta(r, c);
      return '<li class="checklist-item' + (isDone ? ' is-done' : '') + (locked ? ' is-locked is-static' : '') + '" data-key="' + c.key + '">' +
        '<input type="checkbox" id="' + id + '" data-prep="' + c.key + '"' + (isDone ? ' checked' : '') + (locked ? ' disabled' : '') + '>' +
        '<label class="checklist-box" for="' + id + '" aria-hidden="true">' + icon('check') + '</label>' +
        '<label class="checklist-label" for="' + id + '">' + esc(c.name) +
          '<span class="checklist-hint">' + esc(c.hint) + '</span>' +
          (r.notes[c.key] ? '<span class="f05-note">備註：' + esc(r.notes[c.key]) + '</span>' : '') +
        '</label>' +
        (meta ? '<span class="checklist-meta">' + esc(meta) + '</span>' : '<span class="checklist-meta"></span>') +
        (readOnly ? '' : '<button type="button" class="f05-note-btn' + (r.notes[c.key] ? ' has-note' : '') + '" data-act="note" data-key="' + c.key + '" aria-label="幫「' + esc(c.name) + '」寫備註">' + icon('edit') + '</button>') +
        '</li>';
    }).join('') + '</ul>';
  }

  function actionsHTML(r) {
    var n = doneCount(r);
    var ready = n === TOTAL;
    var allowed = canRelist();
    var hint;
    if (!ready) hint = '還有 ' + (TOTAL - n) + ' 項沒完成，完成後才能重新出租。';
    else if (!allowed) hint = '14 項都完成了。標記為可出租需要老闆或租務管理員的權限。';
    else hint = '14 項都完成了，可以把房間放回招租中。';
    return '<div class="f05-actions">' +
      '<p class="f05-actions-hint">' + esc(hint) + '</p>' +
      '<button type="button" class="btn btn--primary" data-act="relist"' + (ready && allowed ? '' : ' disabled') + '>' +
        icon('refresh') + '<span>標記為可出租</span></button>' +
      '</div>';
  }

  function woCardHTML(r) {
    var body;
    if (!r.workOrders.length) {
      body = A.emptyState({
        sm: true, icon: 'wrench',
        title: r.stage === 'done' ? '這次整備沒有開工單' : '還沒有整備工單',
        text: r.stage === 'done' ? '牆面與設備都堪用，省下一筆修繕費。' : '勾到「是否需要油漆或修繕」時，可以直接在這裡開單給廠商。'
      });
    } else {
      body = '<div class="f05-wo">' + r.workOrders.map(function (w) {
        var kind = w.status === '完成' ? 'ok' : (w.status === '施工中' ? 'accent' : 'warn');
        return '<div class="f05-wo-item">' +
          '<span class="f05-wo-title">' + esc(w.item) + '</span>' +
          '<span class="f05-wo-right">' + A.badge(w.status, kind) +
            (w.status === '完成' || r.stage === 'done' ? '' : '<button type="button" class="btn btn--secondary btn--sm" data-act="finish-wo" data-wo="' + w.id + '">標記完工</button>') +
          '</span>' +
          '<span class="f05-wo-sub">' + esc(w.id + ' · ' + w.vendor.name) + '<br>' + esc(fmt.money(A.mask(w.quote, 'repairCost')) + ' · 平均 ' + w.vendor.avgDays + ' 天完工') + '</span>' +
          '</div>';
      }).join('') + '</div>';
    }
    return '<section class="card card--static"><div class="card-head"><h3 class="card-title">' + icon('wrench') + '整備工單</h3>' +
      '<a class="link-more small" href="' + A.link('f07', 'app') + '">到工單管理</a></div>' + body + '</section>';
  }

  function depositCardHTML(r) {
    var total = deductTotal(r);
    var refund = r.deposit - total;
    var rows = r.deductions.map(function (d) {
      return '<tr><td data-label="扣款項目">' + esc(d.item) + '<span class="cell-sub">' + esc(d.basis) + '</span></td>' +
        '<td class="num" data-label="金額">' + esc(fmt.money(A.mask(d.amount, 'deposit'))) + '</td></tr>';
    }).join('');
    var body = '<div class="stack stack--sm">' +
      A.statRow([
        { label: '押金總額', value: fmt.money(A.mask(r.deposit, 'deposit')) },
        { label: '扣款合計', value: fmt.money(A.mask(total, 'deposit')), kind: total ? 'danger' : null },
        { label: r.depositSettled ? '已退還' : '應退還', value: fmt.money(A.mask(refund, 'deposit')), kind: 'ok' }
      ], { divided: true, sm: true }) +
      (r.deductions.length
        ? '<div class="table-wrap"><table class="table table--cards table--compact"><thead><tr><th>扣款項目與依據</th><th class="num">金額</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p class="small muted">沒有扣款項目，押金可全額退還。</p>') +
      (r.depositSettled
        ? '<p class="small muted">' + icon('check-circle') + ' 已完成結算，結算單可在押金管理下載。</p>'
        : (r.stage === 'leaving'
            ? '<p class="small muted">點交當天清點完鑰匙與設備，才會開始結算。</p>'
            : '<button type="button" class="btn btn--secondary btn--sm" data-act="settle"' + (canDeposit() ? '' : ' disabled') + '>開始結算押金</button>')) +
      '</div>';
    if (!canDeposit()) {
      body = A.alert('押金金額只有老闆、租務管理員與會計看得到。需要結算請找會計。', 'accent', { title: '目前角色看不到押金' });
    }
    return '<section class="card card--static"><div class="card-head"><h3 class="card-title">' + icon('wallet') + '押金結算</h3>' +
      A.badge(r.depositSettled ? '已結算' : '未結算', r.depositSettled ? 'ok' : 'warn') + '</div>' + body + '</section>';
  }

  function photoCardHTML(r) {
    var body = r.photos.length
      ? '<div class="f05-photos">' + r.photos.map(function (p) {
          return '<figure class="f05-photo"><img src="' + esc(p.src) + '" alt="' + esc(p.cap) + '" loading="lazy" width="320" height="220"><figcaption>' + esc(p.cap) + '</figcaption></figure>';
        }).join('') + '</div>'
      : A.emptyState({ sm: true, icon: 'camera', title: '還沒有照片', text: '點交時拍的電表、牆面與室內照片會集中在這裡。' });
    return '<section class="card card--static"><div class="card-head"><h3 class="card-title">' + icon('camera') + '點交與整備照片</h3>' +
      '<span class="small muted">' + r.photos.length + ' 張</span></div>' + body + '</section>';
  }

  function leavingHTML(r) {
    var short = D.keyShortages.filter(function (s) { return s.unitId === r.id; });
    var tl = [
      { at: r.noticeAt + ' 16:20', title: '租客在 LINE 通知不續租', by: r.tenantName },
      { at: r.noticeAt + ' 16:22', title: '系統把 ' + r.id + ' 切為即將空房，並排定點交', by: '系統' },
      { at: r.handoverAt, title: '預定點交，現場照整備清單逐項檢查', by: r.staff.name, current: true }
    ];
    return '<section class="card card--static">' +
      '<div class="card-head"><h3 class="card-title">' + icon('history') + '退租進度</h3>' +
        A.badge('尚未點交', 'warn') + '</div>' +
      '<p class="muted small mb-16">' + esc(r.note) + '</p>' +
      A.timeline(tl, { rawTime: false }) +
      (short.length ? '<div class="mt-16">' + A.alert(short[0].item + '短少 ' + short[0].missing + ' 張，補發 ' + fmt.money(short[0].price) + '，點交時會自動列入押金扣款。', 'warn', { title: '點交清點已預先提醒' }) + '</div>' : '') +
      '<div class="f05-actions"><p class="f05-actions-hint">清單可以先開好，點交當天現場照著打勾就不會漏。</p>' +
        '<button type="button" class="btn btn--primary" data-act="create-list"' + (canRelist() ? '' : ' disabled') + '>' + icon('file-plus') + '<span>建立整備清單</span></button></div>' +
      '</section>';
  }

  function renderDetail() {
    var r = room(state.selected);
    var host = $('#f05-detail');
    if (!r) {
      host.innerHTML = A.emptyState({ title: '先從左邊選一間房', text: '選一間退租物件，右邊會顯示它的 14 項整備清單。' });
      return;
    }
    var out = headHTML(r);
    out += '<section class="card card--static">' + summaryHTML(r) + '</section>';

    if (r.stage === 'leaving') {
      out += leavingHTML(r);
      out += '<div class="grid grid--2">' + depositCardHTML(r) + photoCardHTML(r) + '</div>';
    } else {
      var n = doneCount(r);
      out += '<section class="card card--static">' +
        '<div class="card-head"><div><h3 class="card-title">' + icon('clipboard') + '整備清單</h3>' +
          '<p class="card-sub">' + esc(r.stage === 'done' ? '已於 ' + fmt.date(r.completedAt) + ' 全部完成' : '每一項都要有人確認，漏一項房間就不能重新出租') + '</p></div>' +
          A.badge(n === TOTAL ? '全部完成' : '進行中', n === TOTAL ? 'ok' : 'accent') + '</div>' +
        '<div class="f05-progress-row"><span class="f05-progress-num">' + n + '</span><span class="f05-progress-total">／ ' + TOTAL + ' 項已完成</span></div>' +
        A.progress(n, { max: TOTAL, kind: n === TOTAL ? 'ok' : (isOverdue(r) ? 'danger' : null), lg: true }) +
        '<div class="mt-16">' + checklistHTML(r) + '</div>' +
        (r.stage === 'done'
          ? '<div class="f05-actions"><p class="f05-actions-hint">' + esc(r.result) + '</p>' +
            '<a class="btn btn--secondary" href="' + A.link('f03', 'app') + '">到招租漏斗</a></div>'
          : actionsHTML(r)) +
        '</section>';
      out += '<div class="grid grid--2">' + woCardHTML(r) + depositCardHTML(r) + '</div>';
      out += photoCardHTML(r);
    }
    host.innerHTML = out;
  }

  function renderAll() {
    renderKpis();
    renderAlerts();
    renderTabs();
    renderRegion();
    renderRooms();
    renderDetail();
  }

  /* ================================================================
   * 4. 互動
   * ================================================================ */
  function select(id) {
    state.selected = id;
    renderRooms();
    renderDetail();
  }

  function toggleItem(key, checked) {
    var r = room(state.selected);
    if (!r || r.stage !== 'prep') return;
    var c = CHECK.filter(function (x) { return x.key === key; })[0];

    if (checked && (key === 'paint' || key === 'clean')) {
      var w = openWoFor(r, key);
      if (w) {
        renderDetail();
        A.toast(w.id + ' ' + w.status + '，完工後會自動勾選這一項', 'warn');
        return;
      }
      if (key === 'paint' && !r.workOrders.length) { renderDetail(); askWorkOrder(r); return; }
    }
    if (checked && key === 'deposit' && !r.depositSettled) { renderDetail(); openSettle(r); return; }

    r.done[key] = checked;
    if (key === 'photo') {
      if (checked) {
        EXTRA.afterPhotos.forEach(function (p) { r.photos.push({ src: p.src, cap: p.cap + ' · ' + fmt.date(D.today) }); });
        A.toast('已補上 ' + EXTRA.afterPhotos.length + ' 張整備後照片', 'ok');
      } else {
        r.photos = r.photos.slice(0, r.photos.length - EXTRA.afterPhotos.length);
      }
    } else {
      A.toast((checked ? '已完成：' : '已取消勾選：') + c.name, checked ? 'ok' : 'neutral');
    }
    afterChange(r);
  }

  function afterChange(r) {
    if (state.stage !== 'all' && r.stage !== state.stage) state.stage = 'all';
    renderKpis();
    renderAlerts();
    renderTabs();
    renderRooms();
    renderDetail();
  }

  function askWorkOrder(r) {
    var vendor = D.vendors.filter(function (v) { return v.category === '油漆' && v.regions.indexOf(r.unit.region) >= 0; })[0];
    var quote = vendor.avgQuote['單間油漆'];
    A.modal({
      title: r.id + ' 需要油漆或修繕嗎？',
      size: 'sm',
      body: '<p>牆面檢查記錄到壁癌與釘孔。開工單後，系統會派給同區評價最高的廠商，完工才會自動勾選這一項。</p>' +
        A.statRow([
          { label: '建議廠商', value: vendor.name },
          { label: '參考報價', value: fmt.money(quote) },
          { label: '平均工期', value: vendor.avgDays + ' 天' }
        ], { divided: true, sm: true }),
      actions: [
        { label: '不需要，直接完成', kind: 'ghost', onClick: function () {
          r.done.paint = true;
          A.toast('已完成：是否需要油漆或修繕', 'ok');
          afterChange(r);
        } },
        { label: '建立工單', kind: 'primary', icon: 'wrench', onClick: function () {
          var id = 'WO-10' + (60 + r.workOrders.length);
          r.workOrders.push({ id: id, title: '退租整備：單間油漆', item: '單間油漆', status: '已派工', vendor: vendor, quote: quote });
          EXTRA.woItem[id] = 'paint';
          A.toast('已建立 ' + id + '，派給 ' + vendor.name, 'ok', { sub: '完工後會自動勾選這一項' });
          afterChange(r);
        } }
      ]
    });
  }

  function openSettle(r) {
    var total = deductTotal(r);
    var refund = r.deposit - total;
    A.modal({
      title: r.id + ' 押金結算',
      body: '<p>扣款項目都附有依據照片或工單，確認後會產生押金結算單，並以 LINE 傳給前租客。</p>' +
        A.statRow([
          { label: '押金總額', value: fmt.money(r.deposit) },
          { label: '扣款合計', value: fmt.money(total) },
          { label: '應退還', value: fmt.money(refund), kind: 'ok' }
        ], { divided: true }) +
        A.table({
          columns: [
            { label: '扣款項目', key: 'item', primary: true },
            { label: '金額', key: 'amount', align: 'num', render: function (row) { return esc(fmt.money(row.amount)); } },
            { label: '依據', key: 'basis' }
          ],
          rows: r.deductions,
          empty: { title: '沒有扣款項目', text: '押金可全額退還。' }
        }),
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '確認結算', kind: 'primary', icon: 'check', onClick: function () {
          r.done.deposit = true;
          r.depositSettled = true;
          A.toast('押金結算完成，應退還 ' + fmt.money(refund), 'ok', { sub: '結算單已傳給 ' + r.tenantName });
          afterChange(r);
        } }
      ]
    });
  }

  function finishWo(r, id) {
    var w = null;
    r.workOrders.forEach(function (x) { if (x.id === id) w = x; });
    if (!w) return;
    w.status = '完成';
    var key = EXTRA.woItem[id];
    var msg = id + ' 已完工';
    if (key && !r.done[key]) {
      r.done[key] = true;
      var c = CHECK.filter(function (x) { return x.key === key; })[0];
      r.meta[key] = fmt.date(D.today) + ' ' + w.vendor.name + ' · 完工照片 2 張';
      msg = id + ' 完工，已自動勾選「' + c.name + '」';
    }
    A.toast(msg, 'ok');
    afterChange(r);
  }

  function relist(r) {
    A.confirm({
      title: '把 ' + r.id + ' 標記為可出租？',
      body: '<p>14 項整備都完成了。標記後房間會回到招租中、進入可出租庫存，整備清單同時結案。</p>' +
        A.statRow([
          { label: '整備天數', value: prepDays(r) + ' 天' },
          { label: '整備工單', value: r.workOrders.length + ' 張' },
          { label: '下一步', value: '刊登與帶看' }
        ], { divided: true, sm: true }),
      confirmLabel: '標記為可出租'
    }).then(function (ok) {
      if (!ok) return;
      r.stage = 'done';
      r.completedAt = D.today;
      r.result = '整備 ' + prepDays(r) + ' 天完成，已回到招租中，等待刊登與帶看。';
      A.toast(r.id + ' 已回到招租中', 'ok', { sub: '可出租庫存 +1，招租漏斗會同步更新' });
      afterChange(r);
    });
  }

  function createList(r) {
    r.stage = 'prep';
    r.startedAt = r.handoverAt.slice(0, 10);
    r.meta = {};
    r.photos = [];
    A.toast('已建立 ' + r.id + ' 的 ' + TOTAL + ' 項整備清單', 'ok', { sub: '點交當天現場照著打勾即可' });
    afterChange(r);
  }

  function openNote(r, key) {
    var c = CHECK.filter(function (x) { return x.key === key; })[0];
    var id = 'f05-note-input';
    A.modal({
      title: c.name + '　備註',
      size: 'sm',
      body: '<div class="field"><label for="' + id + '">現場狀況或提醒</label>' +
        '<textarea class="input textarea" id="' + id + '" rows="3" placeholder="例如：主臥牆角壁癌約 30 公分">' + esc(r.notes[key] || '') + '</textarea>' +
        '<span class="field-hint">備註會跟著照片一起留在這間房的整備紀錄裡。</span></div>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '儲存備註', kind: 'primary', onClick: function () {
          var v = document.getElementById(id).value.trim();
          if (v) r.notes[key] = v; else delete r.notes[key];
          A.toast(v ? '已儲存「' + c.name + '」的備註' : '已清除備註', v ? 'ok' : 'neutral');
          renderDetail();
        } }
      ]
    });
  }

  function openRules() {
    var rule = EXTRA.prepRule;
    A.modal({
      title: '整備逾期怎麼提醒',
      body: '<p>整備拖太久，房間就一直空著。系統照下面的規則自動往上通知，不用有人盯著。</p>' +
        A.timeline(rule.levels.map(function (l) {
          return { title: l.after, text: l.action, by: '通知對象：' + l.to };
        }), {}) +
        A.alert('目前 ' + state.rooms.filter(isOverdue).length + ' 間超過 7 天提醒線。', state.rooms.filter(isOverdue).length ? 'warn' : 'ok', { title: '現在的狀況' }),
      actions: [{ label: '知道了', kind: 'primary' }]
    });
  }

  /* ---------------- 事件委派 ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    var btn = t.closest('[data-act]');
    if (btn) {
      var act = btn.getAttribute('data-act');
      var r = room(state.selected);
      if (act === 'select') { select(btn.getAttribute('data-room')); return; }
      if (act === 'focus') {
        select(btn.getAttribute('data-room'));
        var d = document.getElementById('f05-detail');
        if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (act === 'clear-filter') { state.stage = 'all'; state.region = '全部'; renderAll(); return; }
      if (!r) return;
      if (act === 'note') { openNote(r, btn.getAttribute('data-key')); return; }
      if (act === 'finish-wo') { finishWo(r, btn.getAttribute('data-wo')); return; }
      if (act === 'settle') { openSettle(r); return; }
      if (act === 'relist') { relist(r); return; }
      if (act === 'create-list') { createList(r); return; }
      return;
    }
    var tab = t.closest('.f05-stage-tabs .tab[data-tab]');
    if (tab) { state.stage = tab.getAttribute('data-tab'); renderRooms(); return; }
    if (t.closest('#f05-rules')) { openRules(); return; }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches('input[type="checkbox"][data-prep]')) { toggleItem(t.getAttribute('data-prep'), t.checked); return; }
    if (t.id === 'f05-region') { state.region = t.value; renderRooms(); }
  });

  A.onRole(function () { renderAll(); });

  renderAll();
})();
