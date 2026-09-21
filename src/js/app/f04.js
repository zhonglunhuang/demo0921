/* js/app/f04.js — 押金管理「進系統操作」頁。
 * 資料來源：window.DB（只讀）；共用元件：window.App。
 * 基礎層沒有的東西一律寫在 EXTRA，不動 data.js／common.js／main.css。
 * 所有操作只改記憶體裡的 state，重新整理就回到初始狀態。 */
(function () {
  'use strict';

  var A = window.App, D = window.DB;
  if (!A || !D) return;
  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  /* ================================================================
   * 1. EXTRA：基礎層沒有、但這個功能需要的資料
   * ================================================================ */
  var EXTRA = {
    /* 逾期判定門檻：退租超過這個天數還沒結算，就算逾期 */
    overdueDays: 30,
    /* 假的退款證明與點交照片（本功能自己的 assets） */
    proofImage: '../assets/f04-refund-proof.svg',
    handoverImage: '../assets/f04-handover-photo.svg',
    handler: { name: '陳○○', role: '租務管理員' },
    docNo: { 'D11-X01': 'DS-2026-0041', 'B15-T34': 'DS-2026-0042' },

    /* 退租整備（DEMO-04）點交後送過來、但還要人工確認才計入的建議扣款項 */
    suggested: {
      'D11-X01': [
        { item: '門禁磁扣遺失 1 張', amount: 300, basis: '點交清點應還 2 張、實還 1 張，確認後才計入' }
      ],
      'B15-T34': [
        { item: '冷氣清洗', amount: 1200, basis: '退租整備預估費用，實際施工後才計入' }
      ]
    },

    /* 押金歷程（結算流程跑起來後會再往後接） */
    history: {
      'D11-X01': [
        { at: '2024-03-05', title: '收到押金 14,000 元', text: '入住點交完成，押金入帳', by: '陳○○（租務管理員）' },
        { at: '2026-08-07', title: '完成退租點交', text: '現場清點鑰匙與設備，牆面污損已拍照存證', by: '陳○○（租務管理員）' },
        { at: '2026-08-10', title: '退租清潔完成', text: '工單 WO-1012，清潔費 2,500 元', by: '系統自動帶入' },
        { at: '2026-09-21', title: '系統提醒：退租已滿 45 天尚未結算', text: '押金 14,000 元仍掛在帳上，請儘快完成結算', kind: 'danger', by: '系統自動提醒', current: true }
      ],
      'B15-T34': [
        { at: '2025-06-15', title: '收到押金 14,000 元', text: '入住點交完成，押金入帳', by: '陳○○（租務管理員）' },
        { at: '2026-09-14', title: '租客通知不續租', text: '退租日 2026/10/14，已排入退租整備', by: '陳○○（租務管理員）' },
        { at: '2026-09-18', title: '9 月水電帳單結出', text: '尚欠 860 元，已列為扣款項', kind: 'warn', by: '系統自動帶入', current: true }
      ],
      'A20-X02': [
        { at: '2023-09-01', title: '收到押金 14,000 元', text: '入住點交完成，押金入帳', by: '陳○○（租務管理員）' },
        { at: '2026-08-05', title: '完成退租點交', text: '鑰匙、磁扣、遙控器全數歸還', by: '陳○○（租務管理員）' },
        { at: '2026-08-12', title: '退租清潔完成', text: '工單 WO-1008，清潔費 2,500 元', by: '系統自動帶入' },
        { at: '2026-08-19', title: '退還 11,500 元，匯款證明已歸檔', text: '押金結算單 DS-2026-0033', kind: 'ok', by: '黃○○（會計）', current: true }
      ]
    },

    /* 結算流程四步 */
    steps: [
      { name: '帶入扣款項', hint: '退租整備點交結果' },
      { name: '確認應退金額', hint: '核對金額與依據' },
      { name: '產生押金結算單', hint: '欄位自動帶入' },
      { name: '登錄退款與歸檔', hint: '附上匯款證明' }
    ],

    statusKind: { '持有中': 'neutral', '結算中': 'accent', '逾期未結算': 'danger', '已退還': 'ok' }
  };

  var CASE_KEYS = ['D11-X01', 'B15-T34'];
  var TODAY = A.today;

  /* ================================================================
   * 2. 把 DB.deposits 整理成畫面用的紀錄
   * ================================================================ */
  function keyOf(d) { return d.unitId + '-' + d.tenantId; }

  function buildRecords() {
    return (D.deposits || []).map(function (d) {
      var u = D.unit(d.unitId) || {};
      var k = keyOf(d);
      var base = (d.deductions || []).map(function (o) {
        return { item: o.item, amount: o.amount, basis: o.basis, on: true, source: '點交結果' };
      });
      var extra = (EXTRA.suggested[k] || []).map(function (o) {
        return { item: o.item, amount: o.amount, basis: o.basis, on: false, source: '待確認' };
      });
      return {
        key: k,
        unitId: d.unitId,
        tenantId: d.tenantId,
        tenantName: d.tenantName,
        region: u.region || '',
        unitType: u.type || '',
        floor: u.floor,
        building: u.building || '',
        amount: d.amount,
        receivedAt: d.receivedAt,
        moveOutAt: d.moveOutAt || null,
        daysSinceMoveOut: d.daysSinceMoveOut || 0,
        former: !!d.moveOutAt && u.tenantId !== d.tenantId,
        leaving: !!d.moveOutAt && u.tenantId === d.tenantId,
        status: d.status,
        deductions: base.concat(extra),
        refundAt: d.refundAt || null,
        refundAmount: d.refundAmount,
        proof: d.proof ? EXTRA.proofImage : null,
        step: d.status === '已退還' ? 4 : 0,
        events: (EXTRA.history[k] || [{ at: d.receivedAt, title: '收到押金 ' + fmt.num(d.amount) + ' 元', text: '入住點交完成，押金入帳', by: '陳○○（租務管理員）', current: true }]).slice()
      };
    });
  }

  var records = buildRecords();
  var byKey = {};
  records.forEach(function (r) { byKey[r.key] = r; });

  function rec(k) { return byKey[k]; }
  function deductTotal(r) {
    return r.deductions.reduce(function (s, x) { return s + (x.on ? x.amount : 0); }, 0);
  }
  function expectedRefund(r) {
    return r.refundAmount != null ? r.refundAmount : r.amount - deductTotal(r);
  }
  function pendingCases() {
    return CASE_KEYS.map(rec).filter(function (r) { return r && r.status !== '已退還'; });
  }
  function overdueList() {
    return records.filter(function (r) { return r.status === '逾期未結算'; });
  }
  function address(r) {
    var b = (D.company.buildings || {})[r.building];
    return (b ? b.address : '桃園市中壢區') + ' ' + r.unitId + ' 室';
  }

  /* 權限：修繕人員看不到押金金額，也不能跑結算 */
  function canSeeMoney() { return A.can(A.role, 'deposit'); }
  function moneyNum(n) { return canSeeMoney() ? fmt.num(n) : '••••'; }

  /* ================================================================
   * 3. 畫面狀態
   * ================================================================ */
  var state = {
    filter: 'all',
    q: '',
    region: 'all',
    limit: 12,
    activeCase: 'D11-X01',
    selected: 'D11-X01'
  };

  var FILTERS = [
    { id: 'all', label: '全部' },
    { id: '持有中', label: '持有中' },
    { id: '結算中', label: '結算中' },
    { id: '逾期未結算', label: '逾期未結算' },
    { id: '已退還', label: '已退還' }
  ];

  function statusRank(s) { return { '逾期未結算': 0, '結算中': 1, '已退還': 2, '持有中': 3 }[s]; }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return records.filter(function (r) {
      if (state.filter !== 'all' && r.status !== state.filter) return false;
      if (state.region !== 'all' && r.region !== state.region) return false;
      if (q && (r.unitId + ' ' + r.tenantName + ' ' + r.region + ' ' + r.unitType).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var d = statusRank(a.status) - statusRank(b.status);
      if (d) return d;
      return a.unitId < b.unitId ? -1 : a.unitId > b.unitId ? 1 : 0;
    });
  }

  /* ================================================================
   * 4. 小元件
   * ================================================================ */
  function segmented(name, items, active, label) {
    return '<div class="f04-segscroll"><div class="segmented" role="tablist" aria-label="' + esc(label || name) + '">' + items.map(function (it) {
      var on = it.id === active;
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" ' +
        'data-f04-seg="' + esc(name) + '" data-f04-value="' + esc(it.id) + '">' +
        '<span>' + esc(it.label) + '</span>' +
        (it.count !== undefined ? A.badge(it.count, it.countKind || 'neutral') : '') + '</button>';
    }).join('') + '</div></div>';
  }

  function statusBadge(r) { return A.badge(r.status, EXTRA.statusKind[r.status] || 'neutral'); }

  function whoLabel(r) {
    if (r.former) return '前租客';
    if (r.leaving) return '即將退租';
    return '在租中';
  }

  /* ================================================================
   * 5. 區塊：警示
   * ================================================================ */
  function renderAlert() {
    var host = document.getElementById('f04-alert');
    var over = overdueList();
    if (over.length) {
      var lines = over.map(function (r) {
        return '<li>' + esc(r.unitId) + ' ' + esc(r.tenantName) + '（' + esc(r.region) + '）退租已 ' + fmt.num(r.daysSinceMoveOut) +
          ' 天，押金 ' + moneyNum(r.amount) + ' 元尚未結算</li>';
      }).join('');
      host.innerHTML = A.alert('', 'danger', {
        title: '有 ' + fmt.num(over.length) + ' 筆押金逾期未結算',
        html: '<p>退租滿 ' + EXTRA.overdueDays + ' 天還沒結算的押金，時間拖越久越容易變成爭議。</p><ul class="f04-overdue">' + lines + '</ul>',
        action: '<button type="button" class="btn btn--danger btn--sm" data-f04-act="goto-settle">開始結算</button>'
      });
    } else {
      host.innerHTML = A.alert('目前沒有逾期未結算的押金，退租案件都在期限內處理完成。', 'ok', { title: '押金都在期限內結清' });
    }
  }

  /* ================================================================
   * 6. 區塊：總覽數字
   * ================================================================ */
  function renderKpis() {
    var held = records.filter(function (r) { return r.status === '持有中'; });
    var heldSum = held.reduce(function (s, r) { return s + r.amount; }, 0);
    var pending = records.filter(function (r) { return r.status === '結算中' || r.status === '逾期未結算'; });
    var pendingSum = pending.reduce(function (s, r) { return s + r.amount; }, 0);
    var over = overdueList();
    var refunded = records.filter(function (r) { return r.status === '已退還'; });
    var refundedSum = refunded.reduce(function (s, r) { return s + (r.refundAmount || 0); }, 0);

    document.getElementById('f04-kpis').innerHTML =
      A.kpi({
        label: '持有中押金總額', icon: 'wallet',
        value: canSeeMoney() ? fmt.money(heldSum, 'NT$') : '••••',
        hint: fmt.num(held.length) + ' 間在租物件的押金還在公司帳上'
      }) +
      A.kpi({
        label: '待結算', icon: 'receipt',
        value: fmt.num(pending.length), unit: ' 筆',
        hint: pending.length ? '押金合計 ' + moneyNum(pendingSum) + ' 元' : '沒有待結算的案件'
      }) +
      A.kpi({
        label: '逾期未結算', icon: 'alert', kind: over.length ? 'danger' : 'ok',
        value: fmt.num(over.length), unit: ' 筆',
        hint: over.length ? over[0].unitId + ' 退租已 ' + fmt.num(over[0].daysSinceMoveOut) + ' 天' : '全部都在 ' + EXTRA.overdueDays + ' 天內結清'
      }) +
      A.kpi({
        label: '已退還押金', icon: 'check-circle',
        value: canSeeMoney() ? fmt.money(refundedSum, 'NT$') : '••••',
        hint: fmt.num(refunded.length) + ' 筆退款已完成並附匯款證明'
      });
  }

  /* ================================================================
   * 7. 區塊：結算工作區
   * ================================================================ */
  function stepsHTML(r) {
    return '<ol class="f04-steps">' + EXTRA.steps.map(function (s, i) {
      var cls = i < r.step ? 'is-done' : (i === r.step ? 'is-current' : '');
      return '<li class="f04-step ' + cls + '">' +
        '<span class="f04-step-name">' + esc(s.name) + '</span>' +
        '<span class="f04-step-hint">' + esc(s.hint) + '</span></li>';
    }).join('') + '</ol>';
  }

  function deductListHTML(r, locked) {
    if (!r.deductions.length) {
      return A.emptyState({ sm: true, icon: 'check-circle', title: '沒有要扣的項目', text: '點交結果沒有損壞或欠款，押金全額退還' });
    }
    return '<ul class="f04-deduct">' + r.deductions.map(function (x, i) {
      return '<li class="f04-deduct-item' + (x.on ? '' : ' is-off') + (locked ? ' is-locked' : '') + '" data-f04-deduct="' + i + '"' +
        (locked ? '' : ' data-f04-toggle="' + i + '"') + '>' +
        '<input type="checkbox" ' + (x.on ? 'checked ' : '') + (locked ? 'disabled ' : '') +
          'aria-label="計入' + esc(x.item) + '">' +
        '<span><span class="f04-deduct-name">' + esc(x.item) + '</span>' +
          '<span class="f04-deduct-tag">' + esc(x.source) + '</span>' +
          '<span class="f04-deduct-basis">' + esc(x.basis) + '</span></span>' +
        '<span class="f04-deduct-amount">-' + moneyNum(x.amount) + ' 元</span></li>';
    }).join('') + '</ul>';
  }

  function sumHTML(r) {
    var dt = deductTotal(r), refund = expectedRefund(r);
    var totalLabel = r.step >= 4 ? '實退金額' : '應退金額';
    return '<div class="f04-sum">' +
      '<div class="f04-sum-row"><span>收到押金</span><span>' + moneyNum(r.amount) + ' 元</span></div>' +
      '<div class="f04-sum-row f04-sum-row--minus"><span>扣除合計</span><span id="f04-deduct-total">-' + moneyNum(dt) + ' 元</span></div>' +
      '<div class="f04-sum-total"><span class="f04-sum-total-label">' + totalLabel + '</span>' +
        '<span class="f04-sum-total-value" id="f04-refund-value">' + moneyNum(refund) + ' 元</span></div>' +
      '<p class="f04-sum-note">' + (r.step >= 4
        ? '已於 ' + fmt.date(r.refundAt) + ' 匯出，匯款證明已歸檔。'
        : '勾選要計入的扣款項，金額會即時重算。') + '</p>' +
      '</div>';
  }

  function docHTML(r) {
    return '<div class="f04-doc">' +
      '<div class="f04-doc-head"><span class="f04-doc-title">押金結算單</span>' +
        '<span class="f04-doc-no">' + esc(EXTRA.docNo[r.key] || 'DS-2026-0050') + '</span></div>' +
      '<dl class="kv">' +
        '<dt>租客姓名</dt><dd>' + esc(r.tenantName) + '</dd>' +
        '<dt>物件地址</dt><dd>' + esc(address(r)) + '</dd>' +
        '<dt>押金金額</dt><dd>' + moneyNum(r.amount) + ' 元</dd>' +
        '<dt>扣除項目</dt><dd>' + (r.deductions.filter(function (x) { return x.on; }).map(function (x) {
          return esc(x.item) + ' ' + moneyNum(x.amount) + ' 元';
        }).join('、') || '無') + '</dd>' +
        '<dt>應退金額</dt><dd>' + moneyNum(expectedRefund(r)) + ' 元</dd>' +
        '<dt>退款日期</dt><dd>' + (r.refundAt ? fmt.date(r.refundAt) : '待登錄') + '</dd>' +
      '</dl></div>';
  }

  function proofHTML(r) {
    if (!r.proof) return '';
    return '<div class="f04-proof"><figure>' +
      '<img src="' + esc(r.proof) + '" alt="' + esc(r.unitId) + ' 押金退款匯款證明" width="240" height="168" loading="lazy">' +
      '<figcaption>匯款證明 · ' + fmt.date(r.refundAt) + '</figcaption></figure>' +
      '<figure><img src="' + esc(EXTRA.handoverImage) + '" alt="' + esc(r.unitId) + ' 退租點交照片" width="240" height="168" loading="lazy">' +
      '<figcaption>點交照片 · 扣款依據</figcaption></figure></div>';
  }

  function actionHTML(r) {
    if (!canSeeMoney()) {
      return A.alert('修繕人員看不到押金金額，也不能執行結算。切換成老闆、租務管理員或會計視角就能操作。', 'warn', { title: '這個視角不能跑結算' });
    }
    var refund = expectedRefund(r);
    if (r.step === 0) {
      return '<button type="button" class="btn btn--primary btn--block" data-f04-act="confirm-deduct">確認扣除項目</button>';
    }
    if (r.step === 1) {
      return '<button type="button" class="btn btn--primary btn--block" data-f04-act="make-doc">產生押金結算單</button>' +
        '<button type="button" class="btn btn--ghost btn--block mt-8" data-f04-act="back-deduct">回上一步改扣款項</button>';
    }
    if (r.step === 2) {
      return '<button type="button" class="btn btn--primary btn--block" data-f04-act="refund">登錄退款與歸檔</button>';
    }
    if (r.step === 3) {
      return '<button type="button" class="btn btn--primary btn--block" data-f04-act="refund">登錄退款 ' + moneyNum(refund) + ' 元</button>';
    }
    return '<button type="button" class="btn btn--secondary btn--block" data-f04-act="view-card">查看押金卡</button>';
  }

  function renderSettle() {
    var host = document.getElementById('f04-settle');
    var cases = CASE_KEYS.map(rec).filter(Boolean);
    var open = pendingCases();

    if (!cases.length) { host.innerHTML = ''; return; }
    if (!rec(state.activeCase)) state.activeCase = (open[0] || cases[0]).key;
    var r = rec(state.activeCase);
    var locked = r.step > 0 || !canSeeMoney();

    var segItems = cases.map(function (c) {
      return { id: c.key, label: c.unitId + ' ' + c.tenantName, count: c.status === '逾期未結算' ? '逾期' : (c.status === '已退還' ? '已完成' : '結算中'), countKind: EXTRA.statusKind[c.status] };
    });

    var moveOutLine = r.former
      ? fmt.date(r.moveOutAt) + '（已過 ' + fmt.num(r.daysSinceMoveOut) + ' 天）'
      : fmt.date(r.moveOutAt) + '（預計退租）';

    host.innerHTML =
      '<div class="card-head"><div><h2 class="card-title" id="f04-settle-title">' + icon('receipt') + '押金結算</h2>' +
        '<p class="card-sub">退租整備的點交結果會自動帶進扣款項，確認後直接產生押金結算單。</p></div>' +
        statusBadge(r) + '</div>' +
      '<div class="card-body">' +
        (open.length ? '' : A.alert('每一筆退租押金都已結算並退還，重新整理頁面可以再看一次完整流程。', 'ok', { title: '押金全部結清' })) +
        segmented('case', segItems, r.key, '切換結算案件') +
        stepsHTML(r) +
        '<div class="grid grid--2">' +
          '<div class="stack">' +
            '<dl class="kv">' +
              '<dt>物件</dt><dd>' + esc(r.unitId) + '（' + esc(r.region) + ' · ' + esc(r.unitType) + '）</dd>' +
              '<dt>租客</dt><dd>' + esc(r.tenantName) + '（' + esc(whoLabel(r)) + '）</dd>' +
              '<dt>收到押金</dt><dd>' + moneyNum(r.amount) + ' 元 · ' + fmt.date(r.receivedAt) + '</dd>' +
              '<dt>退租日</dt><dd>' + esc(moveOutLine) + '</dd>' +
            '</dl>' +
            '<div><h3 class="section-title">扣除項目</h3>' +
              '<p class="small muted">來自退租整備的點交結果，標示「待確認」的要人工勾選才計入。</p>' +
              deductListHTML(r, locked) + '</div>' +
          '</div>' +
          '<div class="stack">' +
            sumHTML(r) +
            (r.step >= 2 ? docHTML(r) : '') +
            (r.step >= 4 ? proofHTML(r) : '') +
            '<div>' + actionHTML(r) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ================================================================
   * 8. 區塊：押金總覽清單
   * ================================================================ */
  function renderList() {
    var host = document.getElementById('f04-list');
    var rows = filtered();
    var shown = rows.slice(0, state.limit);

    var counts = {};
    FILTERS.forEach(function (f) {
      counts[f.id] = f.id === 'all' ? records.length : records.filter(function (r) { return r.status === f.id; }).length;
    });
    var filterItems = FILTERS.map(function (f) {
      return { id: f.id, label: f.label, count: counts[f.id], countKind: f.id === '逾期未結算' && counts[f.id] ? 'danger' : 'neutral' };
    });

    var regionOpts = ['all'].concat(D.company.regions || []).map(function (rg) {
      return '<option value="' + esc(rg) + '"' + (state.region === rg ? ' selected' : '') + '>' + (rg === 'all' ? '全部區域' : esc(rg)) + '</option>';
    }).join('');

    var tableHTML = A.table({
      id: 'f04-table',
      columns: [
        { label: '物件', primary: true, render: function (r) { return '<span class="f04-unit">' + esc(r.unitId) + '</span><span class="f04-sub">' + esc(r.region) + ' · ' + esc(r.unitType) + '</span>'; } },
        { label: '租客', render: function (r) { return esc(r.tenantName) + '<span class="f04-sub">' + esc(whoLabel(r)) + '</span>'; } },
        { label: '押金', align: 'num', render: function (r) { return moneyNum(r.amount) + ' 元'; } },
        { label: '收款日', align: 'num', render: function (r) { return fmt.date(r.receivedAt); } },
        { label: '扣除', align: 'num', render: function (r) { var t = deductTotal(r); return t ? '<span class="neg">-' + moneyNum(t) + ' 元</span>' : '<span class="muted-2">—</span>'; } },
        { label: '應退／已退', align: 'num', render: function (r) { return moneyNum(expectedRefund(r)) + ' 元'; } },
        { label: '狀態', render: statusBadge },
        {
          label: '', noLabel: true, align: 'center',
          render: function (r) { return '<button type="button" class="btn btn--ghost btn--sm" data-f04-view="' + esc(r.key) + '">查看</button>'; }
        }
      ],
      rows: shown,
      rowClass: function (r) { return r.key === state.selected ? 'is-selected' : ''; },
      empty: (state.filter !== 'all' && !state.q.trim() && state.region === 'all')
        ? {
            icon: state.filter === '逾期未結算' ? 'check-circle' : 'inbox',
            title: '沒有「' + state.filter + '」的押金',
            text: state.filter === '逾期未結算' ? '退租案件都在 ' + EXTRA.overdueDays + ' 天內結清' : '換一個狀態看看其他押金',
            action: '<button type="button" class="btn btn--secondary btn--sm" data-f04-act="reset">看全部押金</button>'
          }
        : {
            icon: 'search',
            title: '找不到符合的押金',
            text: '換個關鍵字或狀態再試一次',
            action: '<button type="button" class="btn btn--secondary btn--sm" data-f04-act="reset">清除篩選</button>'
          }
    });

    host.innerHTML =
      '<div class="card-head"><div><h2 class="card-title" id="f04-list-title">' + icon('list') + '押金總覽</h2>' +
        '<p class="card-sub">每一筆押金的狀態一次看完，最需要處理的排在最前面。</p></div></div>' +
      '<div class="card-body">' +
        '<div class="toolbar f04-toolbar">' +
          '<div class="search">' + icon('search') +
            '<input type="search" class="input" id="f04-q" placeholder="搜尋物件編號或租客" value="' + esc(state.q) + '" aria-label="搜尋押金紀錄">' +
          '</div>' +
          '<select class="select" id="f04-region" aria-label="篩選區域">' + regionOpts + '</select>' +
          '<span class="spacer"></span>' +
          '<span class="f04-count">' + fmt.num(rows.length) + ' 筆</span>' +
        '</div>' +
        segmented('filter', filterItems, state.filter, '依狀態篩選押金') +
        '<div class="mt-16">' + tableHTML + '</div>' +
        (rows.length > shown.length
          ? '<div class="row row--between mt-16"><span class="small muted">目前顯示前 ' + fmt.num(shown.length) + ' 筆</span>' +
            '<button type="button" class="btn btn--secondary btn--sm" data-f04-act="show-all">顯示全部 ' + fmt.num(rows.length) + ' 筆</button></div>'
          : '') +
      '</div>';
  }

  /* ================================================================
   * 9. 區塊：押金卡（單戶詳情）
   * ================================================================ */
  function renderDetail() {
    var host = document.getElementById('f04-detail');
    var r = rec(state.selected) || records[0];
    if (!r) { host.innerHTML = ''; return; }

    var refundLine = r.step >= 4
      ? fmt.date(r.refundAt) + ' 退還 ' + moneyNum(r.refundAmount != null ? r.refundAmount : expectedRefund(r)) + ' 元'
      : '尚未退款';

    var deductRows = r.deductions.filter(function (x) { return x.on; });
    var deductBlock = deductRows.length
      ? '<ul class="f04-deduct">' + deductRows.map(function (x) {
          return '<li class="f04-deduct-item is-locked"><input type="checkbox" checked disabled aria-hidden="true">' +
            '<span><span class="f04-deduct-name">' + esc(x.item) + '</span>' +
            '<span class="f04-deduct-basis">依據：' + esc(x.basis) + '</span></span>' +
            '<span class="f04-deduct-amount">-' + moneyNum(x.amount) + ' 元</span></li>';
        }).join('') + '</ul>' +
        '<div class="f04-sum-row f04-sum-row--minus mt-8"><span>扣除合計</span><span>-' + moneyNum(deductTotal(r)) + ' 元</span></div>'
      : A.emptyState({ sm: true, icon: 'check-circle', title: '沒有扣款項', text: '這一戶目前沒有任何扣除項目' });

    var proofBlock = r.proof
      ? proofHTML(r)
      : A.emptyState({ sm: true, icon: 'image', title: '還沒有退款證明', text: '完成結算並登錄退款後，匯款證明會自動存進這張卡' });

    host.innerHTML =
      '<div class="card-head"><div><h2 class="card-title" id="f04-detail-title">' + icon('wallet') + '押金卡 · ' + esc(r.unitId) + '</h2>' +
        '<p class="card-sub">' + esc(address(r)) + '</p></div>' + statusBadge(r) + '</div>' +
      '<div class="card-body">' +
        '<div class="grid grid--2">' +
          '<div class="stack">' +
            '<dl class="kv">' +
              '<dt>租客</dt><dd>' + esc(r.tenantName) + '（' + esc(whoLabel(r)) + '）</dd>' +
              '<dt>收到金額</dt><dd>' + moneyNum(r.amount) + ' 元</dd>' +
              '<dt>收到日期</dt><dd>' + fmt.date(r.receivedAt) + '</dd>' +
              '<dt>退租日期</dt><dd>' + (r.moveOutAt ? fmt.date(r.moveOutAt) : '仍在租') + '</dd>' +
              '<dt>' + (r.step >= 4 ? '實退金額' : '預計退還') + '</dt><dd>' + moneyNum(expectedRefund(r)) + ' 元</dd>' +
              '<dt>退款紀錄</dt><dd>' + esc(refundLine) + '</dd>' +
            '</dl>' +
            '<div><h3 class="section-title">扣除項目與依據</h3>' + deductBlock + '</div>' +
          '</div>' +
          '<div class="stack">' +
            '<div><h3 class="section-title">退款證明</h3>' + proofBlock + '</div>' +
            '<div><h3 class="section-title">押金歷程</h3>' + A.timeline(r.events) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ================================================================
   * 10. 頁首主鈕
   * ================================================================ */
  function renderHeadAction() {
    var btn = document.getElementById('f04-start');
    if (!btn) return;
    var open = pendingCases();
    if (!open.length) {
      btn.disabled = true;
      btn.textContent = '押金都已結清';
    } else {
      btn.disabled = false;
      btn.textContent = '開始結算';
    }
  }

  function renderAll() {
    renderHeadAction();
    renderAlert();
    renderKpis();
    renderSettle();
    renderList();
    renderDetail();
  }

  /* ================================================================
   * 11. 流程動作
   * ================================================================ */
  function addEvent(r, title, text, kind) {
    r.events.forEach(function (e) { e.current = false; });
    r.events.push({ at: TODAY, title: title, text: text, kind: kind, by: EXTRA.handler.name + '（' + EXTRA.handler.role + '）', current: true });
  }

  function gotoSettle() {
    var open = pendingCases();
    if (!open.length) return;
    state.activeCase = open[0].key;
    state.selected = open[0].key;
    renderAll();
    var card = document.getElementById('f04-settle');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('highlight');
    setTimeout(function () { card.classList.remove('highlight'); }, 1600);
  }

  function toggleDeduct(i) {
    var r = rec(state.activeCase);
    if (!r || r.step > 0 || !canSeeMoney()) return;
    var x = r.deductions[i];
    if (!x) return;
    x.on = !x.on;
    /* 即時反映：只換數字與該列樣式，不整塊重畫 */
    var li = document.querySelector('[data-f04-deduct="' + i + '"]');
    if (li) {
      li.classList.toggle('is-off', !x.on);
      var box = li.querySelector('input[type="checkbox"]');
      if (box) box.checked = x.on;
    }
    var dt = document.getElementById('f04-deduct-total');
    if (dt) dt.textContent = '-' + moneyNum(deductTotal(r)) + ' 元';
    var rv = document.getElementById('f04-refund-value');
    if (rv) rv.textContent = moneyNum(expectedRefund(r)) + ' 元';
    A.toast((x.on ? '已計入「' : '已取消「') + x.item + '」', x.on ? 'neutral' : 'warn', {
      sub: '應退金額 ' + moneyNum(expectedRefund(r)) + ' 元', ms: 2200
    });
  }

  function confirmDeduct() {
    var r = rec(state.activeCase);
    if (!r || r.step !== 0) return;
    r.step = 1;
    addEvent(r, '確認扣除項目，合計 ' + moneyNum(deductTotal(r)) + ' 元', '依據點交結果與工單金額核對無誤');
    renderAll();
    A.toast('扣除項目已確認', 'ok', { sub: '扣除合計 ' + moneyNum(deductTotal(r)) + ' 元，應退 ' + moneyNum(expectedRefund(r)) + ' 元' });
  }

  function backDeduct() {
    var r = rec(state.activeCase);
    if (!r || r.step !== 1) return;
    r.step = 0;
    renderAll();
    A.toast('可以重新勾選扣除項目', 'neutral');
  }

  function makeDoc() {
    var r = rec(state.activeCase);
    if (!r || r.step !== 1) return;
    r.step = 2;
    addEvent(r, '產生押金結算單 ' + (EXTRA.docNo[r.key] || 'DS-2026-0050'), '租客姓名、地址、押金與扣除項目由系統自動帶入');
    renderAll();
    A.toast('押金結算單已產生', 'ok', { sub: r.unitId + ' ' + r.tenantName + '，應退 ' + moneyNum(expectedRefund(r)) + ' 元' });
  }

  function doRefund() {
    var r = rec(state.activeCase);
    if (!r || r.step < 2 || r.step > 3) return;
    var refund = expectedRefund(r);
    A.confirm({
      title: '登錄退款 ' + moneyNum(refund) + ' 元？',
      text: '登錄後狀態會變成「已退還」，匯款證明與結算單會一起歸檔到這一戶的押金卡。',
      confirmLabel: '登錄退款'
    }).then(function (ok) {
      if (!ok) return;
      r.step = 4;
      r.status = '已退還';
      r.refundAt = TODAY;
      r.refundAmount = refund;
      r.proof = EXTRA.proofImage;
      addEvent(r, '退還 ' + moneyNum(refund) + ' 元，匯款證明已歸檔', '押金結算單 ' + (EXTRA.docNo[r.key] || 'DS-2026-0050'), 'ok');
      state.selected = r.key;
      renderAll();
      A.toast('押金 ' + moneyNum(refund) + ' 元已退還', 'ok', { sub: '匯款證明已存進 ' + r.unitId + ' 的押金卡' });
    });
  }

  /* ================================================================
   * 12. 事件
   * ================================================================ */
  function onClick(e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var seg = t.closest('[data-f04-seg]');
    if (seg) {
      var name = seg.getAttribute('data-f04-seg'), val = seg.getAttribute('data-f04-value');
      if (name === 'filter') { state.filter = val; state.limit = 12; renderList(); }
      else if (name === 'case') { state.activeCase = val; state.selected = val; renderSettle(); renderList(); renderDetail(); }
      return;
    }

    var toggle = t.closest('[data-f04-toggle]');
    if (toggle) { toggleDeduct(Number(toggle.getAttribute('data-f04-toggle'))); return; }

    var view = t.closest('[data-f04-view]');
    if (view) {
      state.selected = view.getAttribute('data-f04-view');
      renderList();
      renderDetail();
      var card = document.getElementById('f04-detail');
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    var act = t.closest('[data-f04-act]');
    if (!act) return;
    switch (act.getAttribute('data-f04-act')) {
      case 'goto-settle': gotoSettle(); break;
      case 'confirm-deduct': confirmDeduct(); break;
      case 'back-deduct': backDeduct(); break;
      case 'make-doc': makeDoc(); break;
      case 'refund': doRefund(); break;
      case 'view-card':
        state.selected = state.activeCase;
        renderDetail();
        document.getElementById('f04-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'reset':
        state.q = ''; state.filter = 'all'; state.region = 'all'; state.limit = 12;
        renderList();
        A.toast('已清除篩選', 'neutral', { ms: 2000 });
        break;
      case 'show-all':
        state.limit = records.length;
        renderList();
        break;
    }
  }

  function onInput(e) {
    if (e.target && e.target.id === 'f04-q') {
      state.q = e.target.value;
      state.limit = 12;
      renderList();
      var box = document.getElementById('f04-q');
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    }
  }

  function onChange(e) {
    if (e.target && e.target.id === 'f04-region') {
      state.region = e.target.value;
      state.limit = 12;
      renderList();
    }
  }

  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);

  /* 頁首主鈕 */
  var startBtn = document.getElementById('f04-start');
  if (startBtn) startBtn.addEventListener('click', gotoSettle);

  /* 切換角色：押金金額與結算權限跟著變 */
  A.onRole(function (role) {
    renderAll();
    if (!canSeeMoney()) A.toast('修繕人員看不到押金金額', 'warn', { sub: '金額欄位已打碼，結算流程也停用', ms: 2600 });
  });

  renderAll();
  A.reveal();
})();
