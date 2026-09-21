/* js/app/f07.js — 廠商與修繕工單（f07）進系統操作頁
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）、§6.1（檔案所有權）。
 * 資料：一律讀 window.DB；基礎層沒有的欄位（報修照片、AI 初步排查、角色可做的動作）放在本檔的 EXTRA。
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

  /* ================================================================
   * 1. 基礎層沒有的資料（只在本檔補，不動 data.js）
   * ================================================================ */
  var EXTRA = {
    /* 工單流程：狀態 → 下一步。報修 → 派工 → 報價 → 核准 → 完工 → 發票 → 付款。 */
    flow: ['待派工', '已派工', '待核准', '施工中', '待付款', '完成'],

    steps: [
      { key: 'report', label: '報修', icon: 'message' },
      { key: 'dispatch', label: '派工', icon: 'truck' },
      { key: 'quote', label: '報價', icon: 'tag' },
      { key: 'approve', label: '核准', icon: 'shield-check' },
      { key: 'done', label: '完工', icon: 'camera' },
      { key: 'invoice', label: '發票', icon: 'receipt' },
      { key: 'pay', label: '付款', icon: 'wallet' }
    ],

    /* 每個狀態已走完的流程節點數 */
    reached: { '待派工': 1, '已派工': 2, '待核准': 3, '施工中': 4, '待付款': 6, '完成': 7 },

    statusKind: { '待派工': 'warn', '已派工': 'accent', '待核准': 'danger', '施工中': 'accent', '待付款': 'warn', '完成': 'ok' },

    /* 哪個角色能做哪一步（基礎層權限矩陣只管資料遮蔽，動作權限寫在這裡） */
    perm: {
      dispatch: ['boss', 'manager', 'maintenance'],
      quote: ['boss', 'manager', 'maintenance'],
      approve: ['boss', 'manager'],
      complete: ['boss', 'manager', 'maintenance'],
      pay: ['boss', 'accountant']
    },
    permHint: {
      dispatch: '派工由租務管理員或修繕人員處理',
      quote: '報價由租務管理員或修繕人員代為登錄',
      approve: '核准報價需要老闆或租務管理員',
      complete: '完工回報由租務管理員或修繕人員處理',
      pay: '確認付款需要老闆或會計'
    },

    /* 租客報修的照片與 AI 初步排查（基礎層沒有這兩個欄位） */
    intake: {
      'WO-1043': {
        photo: { src: '../assets/f07-photo-report.svg', cap: '租客上傳：水箱底部持續滲水 · 2026/09/19' },
        ai: '從照片與描述判斷是水箱止水皮老化，屬水電類；同棟近半年同項目 3 件，零件與工資合計約 1,800 元。'
      },
      'WO-1051': {
        photo: null,
        ai: '租客兩次未回覆細節，無法確定是熱水器本身或整棟水壓問題，建議人工到場判斷後再派工。'
      },
      'WO-1053': {
        photo: { src: '../assets/f07-photo-report.svg', cap: '租客上傳：馬桶止水皮滲水 · 2026/09/20' },
        ai: '症狀與 09/19 的 B02 相同，屬水電類；已依同區、同項目報價最接近平均的廠商建議派工。'
      },
      'WO-1050': { photo: null, ai: '冰箱冷藏不冷、冷凍正常，判斷為風扇或溫控問題，屬家電類。' },
      'WO-1047': { photo: null, ai: '洗衣機不排水多為排水管阻塞或水位開關故障，屬家電類。' },
      'WO-1046': { photo: null, ai: '樓下天花板滴水且樓上浴室地面潮濕，判斷為防水層破損，屬水電類並升為重大事件。' }
    },

    /* 完工照片與發票（示意圖，所有工單共用同一組） */
    donePhoto: { src: '../assets/f07-photo-done.svg', cap: '廠商上傳的完工照片' },
    invoicePhoto: { src: '../assets/f07-invoice.svg', cap: '廠商上傳的發票' },

    /* 建立工單用的常見項目 */
    newItems: ['馬桶水箱零件', '排水管疏通', '熱水器檢修', '冷氣清洗', '燈具更換', '門鎖更換', '紗窗更換', '洗衣機檢修']
  };

  var ANOMALY_RATIO = 1.5;                       /* 高於同項目平均 50% 即標為價格異常 */
  var MONTH = D.stats.month;

  /* ================================================================
   * 2. 狀態（記憶體）
   * ================================================================ */
  function cloneOrder(w) {
    return {
      id: w.id, unitId: w.unitId, title: w.title, item: w.item, category: w.category,
      status: w.status, createdAt: w.createdAt, vendorId: w.vendorId, quote: w.quote,
      marketAvg: w.marketAvg, approvedBy: w.approvedBy, completedAt: w.completedAt,
      invoice: w.invoice, paid: w.paid, source: w.source, aiUndecided: w.aiUndecided,
      incidentId: w.incidentId,
      timeline: w.timeline.map(function (t) { return { at: t.at, text: t.text, by: t.by }; })
    };
  }

  var state = {
    view: 'orders',
    status: '全部',
    category: '全部',
    selected: 'WO-1043',
    orders: D.workOrders.map(cloneOrder).sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }),
    vendorQ: '',
    vendorCategory: '全部',
    vendorRegion: '全部',
    seq: 53                                      /* 新工單編號從 WO-1054 起跳 */
  };

  function order(id) {
    var found = null;
    state.orders.forEach(function (o) { if (o.id === id) found = o; });
    return found;
  }
  function vendor(id) { return id ? D.vendorById(id) : null; }
  function isOpen(o) { return o.status !== '完成'; }
  function isAnomaly(o) { return !!(o.quote && o.marketAvg && o.quote > o.marketAvg * ANOMALY_RATIO); }
  function overPct(o) { return Math.round((o.quote / o.marketAvg - 1) * 100); }
  function stepIndex(o) { return EXTRA.reached[o.status] || 0; }
  function rework(v) { return Math.round(v.reworkRate * 100) + '%'; }
  function canDo(act) { return EXTRA.perm[act].indexOf(A.role) >= 0; }
  function nowStamp() { return D.today + ' ' + '16:20'; }
  function log(o, text, by) { o.timeline.push({ at: nowStamp(), text: text, by: by }); }

  /* 同項目的所有廠商報價（報價比較與異常判斷都用這一份） */
  function quotesFor(item, region) {
    return D.vendors.filter(function (v) {
      return v.avgQuote[item] != null && (!region || v.regions.indexOf(region) >= 0);
    }).map(function (v) {
      return { vendor: v, amount: v.avgQuote[item] };
    }).sort(function (a, b) { return a.amount - b.amount; });
  }

  /* ================================================================
   * 3. 概況與警示
   * ================================================================ */
  function renderKpis() {
    var open = state.orders.filter(isOpen);
    var pending = state.orders.filter(function (o) { return o.status === '待核准'; });
    var anomalies = open.filter(isAnomaly);
    var repair = D.stats.repairTotal;
    var byStatus = {};
    open.forEach(function (o) { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });
    var hint = EXTRA.flow.filter(function (s) { return byStatus[s]; }).map(function (s) { return s + ' ' + byStatus[s]; }).join('、');

    document.getElementById('f07-kpis').innerHTML =
      A.kpi({ label: '進行中工單', value: open.length, unit: ' 張', icon: 'wrench', hint: hint || '目前沒有進行中的工單' }) +
      A.kpi({ label: '待核准報價', value: pending.length, unit: ' 張', icon: 'shield-check', kind: pending.length ? 'warn' : 'ok', hint: pending.length ? '核准後廠商才會進場' : '沒有等待核准的報價' }) +
      A.kpi({ label: '價格異常', value: anomalies.length, unit: ' 筆', icon: 'alert', kind: anomalies.length ? 'danger' : 'ok', hint: anomalies.length ? '高於同項目平均 ' + overPct(anomalies[0]) + '%' : '報價都在合理範圍' }) +
      A.kpi({ label: fmt.month(MONTH) + ' 修繕費', value: 'NT$ ' + fmt.num(repair), icon: 'wallet', hint: '佔本月收入 ' + D.stats.repairRate + '%，平均每間 ' + fmt.money(D.stats.repairPerUnit) });
  }

  function renderAlerts() {
    var box = document.getElementById('f07-alerts');
    var html = '';
    var anomalies = state.orders.filter(function (o) { return isOpen(o) && isAnomaly(o); });
    anomalies.forEach(function (o) {
      html += A.alert('', 'danger', {
        title: '價格異常：' + o.id + '　' + o.unitId + ' ' + o.item,
        html: '<p>' + esc(vendor(o.vendorId).name + ' 報價 ' + fmt.money(o.quote) + '，同項目平均 ' + fmt.money(o.marketAvg) +
          '，高出 ' + overPct(o) + '%。核准前先比一次同區其他廠商的報價。') + '</p>',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="focus" data-wo="' + esc(o.id) + '">查看工單</button>'
      });
    });
    var undecided = state.orders.filter(function (o) { return o.aiUndecided && o.status === '待派工'; });
    undecided.forEach(function (o) {
      html += A.alert('', 'warn', {
        title: 'AI 無法判斷派工類別：' + o.id + '　' + o.unitId + ' ' + o.title,
        html: '<p>' + esc('租客兩次未回覆細節，已依升級規則通知租務管理員。請人工判斷後派工。') + '</p>',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="focus" data-wo="' + esc(o.id) + '">查看工單</button>'
      });
    });
    box.innerHTML = html;
  }

  /* ================================================================
   * 4. 工單清單
   * ================================================================ */
  function statusCounts() {
    var c = { '全部': 0 };
    EXTRA.flow.forEach(function (s) { c[s] = 0; });
    state.orders.forEach(function (o) { c['全部']++; c[o.status]++; });
    return c;
  }

  function renderStatusTabs() {
    var c = statusCounts();
    var items = ['全部'].concat(EXTRA.flow).map(function (s) {
      return { id: s, label: s, count: c[s] };
    });
    document.getElementById('f07-status-tabs').innerHTML = A.tabs(items, { segmented: true, block: true, active: state.status })
      .replace(/^<div class="[^"]*" role="tablist">/, '').replace(/<\/div>$/, '');
  }

  function renderCategory() {
    var cats = ['全部'];
    state.orders.forEach(function (o) { if (cats.indexOf(o.category) < 0) cats.push(o.category); });
    document.getElementById('f07-category').innerHTML = cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c === '全部' ? '全部類別' : c) + '</option>';
    }).join('');
  }

  function filtered() {
    return state.orders.filter(function (o) {
      if (state.status !== '全部' && o.status !== state.status) return false;
      if (state.category !== '全部' && o.category !== state.category) return false;
      return true;
    });
  }

  function orderRow(o) {
    var v = vendor(o.vendorId);
    var anomaly = isAnomaly(o);
    return '<button type="button" class="f07-order' + (o.id === state.selected ? ' is-active' : '') + '" data-act="select" data-wo="' + esc(o.id) + '">' +
      '<span class="f07-order-id">' + esc(o.id) + A.badge(o.status, EXTRA.statusKind[o.status]) + '</span>' +
      '<span class="f07-order-title">' + esc(o.unitId + '　' + o.title) + '</span>' +
      '<span class="f07-order-sub">' + esc(o.item + ' · ' + (v ? v.name : '尚未指派廠商') + ' · ' + fmt.date(o.createdAt)) + '</span>' +
      '<span class="f07-order-right">' +
        (anomaly ? A.badge('價格異常', 'danger') : '') +
        '<span class="f07-order-quote' + (anomaly ? ' is-anomaly' : '') + '">' + esc(o.quote ? fmt.money(o.quote) : '未報價') + '</span>' +
      '</span></button>';
  }

  function renderOrders() {
    var rows = filtered();
    document.getElementById('f07-count').textContent = rows.length + ' 張';
    var box = document.getElementById('f07-orders');
    if (!rows.length) {
      box.innerHTML = A.emptyState({
        icon: 'filter',
        title: '這個條件下沒有工單',
        text: '換一個狀態或類別再看一次。',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="clear-filter">清除篩選</button>'
      });
      return;
    }
    box.innerHTML = rows.map(orderRow).join('');
  }

  /* ================================================================
   * 5. 工單詳情
   * ================================================================ */
  function stepsHtml(o) {
    var reached = stepIndex(o);
    var blocked = o.status === '待核准' && isAnomaly(o);
    return '<div class="f07-steps">' + EXTRA.steps.map(function (s, i) {
      var done = i < reached;
      var current = i === reached;
      var cls = 'f07-step' + (done ? ' is-done' : '') + (current ? (blocked ? ' is-current is-blocked' : ' is-current') : '');
      return '<div class="' + cls + '">' +
        '<span class="f07-step-dot">' + (done ? icon('check') : icon(s.icon)) + '</span>' +
        '<span class="f07-step-label">' + esc(s.label) + '</span></div>';
    }).join('') + '</div>';
  }

  function intakeCard(o) {
    var extra = EXTRA.intake[o.id];
    var t = D.tenantOf(o.unitId);
    var body = '<dl class="kv">' +
      '<dt>報修來源</dt><dd>' + esc(o.source) + '</dd>' +
      '<dt>報修時間</dt><dd>' + esc(fmt.date(o.createdAt)) + '</dd>' +
      '<dt>租客</dt><dd>' + esc(t ? t.name + '　' + A.mask(t.phone, 'phone') : '目前無人承租') + '</dd>' +
      '<dt>租客描述</dt><dd>' + esc(o.title) + '</dd>' +
      '</dl>';
    if (extra && extra.ai) {
      body += '<div class="alert alert--accent mt-16" role="status">' + icon('bot') +
        '<div class="alert-body"><span class="alert-title">AI 初步排查</span><p>' + esc(extra.ai) + '</p></div></div>';
    }
    if (extra && extra.photo) {
      body += '<div class="f07-photos mt-16"><figure class="f07-photo"><img src="' + esc(extra.photo.src) + '" alt="' + esc(extra.photo.cap) + '">' +
        '<figcaption>' + esc(extra.photo.cap) + '</figcaption></figure></div>';
    }
    return '<section class="card"><div class="card-head"><h3 class="card-title">報修內容</h3></div><div class="card-body">' + body + '</div></section>';
  }

  function quoteCompareHtml(o, pickable) {
    var u = D.unit(o.unitId);
    var list = quotesFor(o.item, null);
    if (!list.length) return '<p class="muted small">這個項目還沒有歷史報價，核准前請先問過兩家。</p>';
    return '<div class="f07-quotes">' + list.map(function (q) {
      var current = q.vendor.id === o.vendorId;
      var sameRegion = q.vendor.regions.indexOf(u.region) >= 0;
      var cls = 'f07-quote' + (current ? ' is-current' : (pickable && sameRegion && q.amount <= o.marketAvg ? ' is-pick' : ''));
      return '<div class="' + cls + '">' +
        '<span class="f07-quote-name">' + esc(q.vendor.name) +
          (current ? A.badge('本次報價', 'danger') : '') +
          (sameRegion ? A.badge(u.region + ' 可服務', 'neutral') : '') + '</span>' +
        '<span class="f07-quote-meta">' + esc('平均 ' + q.vendor.avgDays + ' 天完工 · 返修率 ' + rework(q.vendor) + ' · 評分 ' + q.vendor.rating) + '</span>' +
        '<span class="f07-quote-amount">' + esc(fmt.money(current ? o.quote : q.amount)) + '</span>' +
        (pickable && !current && sameRegion
          ? '<span class="f07-quote-action"><button type="button" class="btn btn--secondary btn--sm" data-act="reassign" data-vendor="' + esc(q.vendor.id) + '">改派這家</button></span>'
          : '<span class="f07-quote-action"></span>') +
        '</div>';
    }).join('') + '</div>';
  }

  function quoteCard(o) {
    if (!o.quote) {
      return '<section class="card"><div class="card-head"><h3 class="card-title">報價</h3></div><div class="card-body">' +
        A.emptyState({ sm: true, icon: 'tag', title: '廠商還沒回報價', text: '派工後廠商到場勘查，報價回來就會出現在這裡。' }) +
        '</div></section>';
    }
    var anomaly = isAnomaly(o);
    var v = vendor(o.vendorId);
    var head = '<div class="f07-avg">' +
      '<span class="f07-avg-num' + (anomaly ? ' f07-avg-num--bad' : '') + '">' + esc(fmt.num(o.quote)) + '</span>' +
      '<span class="muted">元　' + esc(v.name) + '</span>' +
      (anomaly ? A.badge('高於平均 ' + overPct(o) + '%', 'danger') : A.badge('在合理範圍', 'ok')) +
      '</div>' +
      '<p class="muted small mt-8">' + esc('同項目（' + o.item + '）歷史平均 ' + fmt.money(o.marketAvg) + '，取自 ' + quotesFor(o.item, null).length + ' 家廠商的過去報價。') + '</p>';

    var alertHtml = anomaly
      ? A.alert('', 'danger', {
          title: '這筆報價貴了 ' + fmt.money(o.quote - o.marketAvg),
          html: '<p>' + esc('高於同項目平均 ' + overPct(o) + '%。可以請廠商說明，或直接改派同區其他廠商。') + '</p>'
        })
      : '';

    return '<section class="card"><div class="card-head"><h3 class="card-title">報價與比價</h3>' +
      '<span class="card-sub">' + esc('核准前先比一次歷史平均') + '</span></div>' +
      '<div class="card-body">' + head + (alertHtml ? '<div class="mt-16">' + alertHtml + '</div>' : '') +
      '<div class="mt-16">' + quoteCompareHtml(o, o.status === '待核准') + '</div>' +
      '</div></section>';
  }

  function evidenceCard(o) {
    var items = [];
    if (['待付款', '完成'].indexOf(o.status) >= 0) {
      items.push({ src: EXTRA.donePhoto.src, cap: EXTRA.donePhoto.cap + ' · ' + fmt.date(o.completedAt) });
      if (o.invoice) items.push({ src: EXTRA.invoicePhoto.src, cap: '發票 ' + o.invoice });
    }
    if (!items.length) return '';
    return '<section class="card"><div class="card-head"><h3 class="card-title">完工與發票</h3></div><div class="card-body">' +
      '<div class="f07-photos">' + items.map(function (p) {
        return '<figure class="f07-photo"><img src="' + esc(p.src) + '" alt="' + esc(p.cap) + '"><figcaption>' + esc(p.cap) + '</figcaption></figure>';
      }).join('') + '</div>' +
      A.statRow([
        { label: '完工日', value: fmt.date(o.completedAt) },
        { label: '發票號碼', value: o.invoice || '尚未上傳' },
        { label: '付款狀態', value: o.paid ? '已付款' : '待付款', kind: o.paid ? 'ok' : 'danger' }
      ], { divided: true, sm: true, className: 'mt-16' }) +
      '</div></section>';
  }

  /* 下一步動作：狀態 → 按鈕 */
  function nextAction(o) {
    if (o.status === '待派工') return { act: 'dispatch', label: '派工給廠商', icon: 'truck', perm: 'dispatch' };
    if (o.status === '已派工') return { act: 'quote', label: '登錄廠商報價', icon: 'tag', perm: 'quote' };
    if (o.status === '待核准') return { act: 'approve', label: '核准報價', icon: 'shield-check', perm: 'approve' };
    if (o.status === '施工中') return { act: 'complete', label: '回報完工', icon: 'camera', perm: 'complete' };
    if (o.status === '待付款') return { act: 'pay', label: '確認付款', icon: 'wallet', perm: 'pay' };
    return null;
  }

  function actionsCard(o) {
    var next = nextAction(o);
    var v = vendor(o.vendorId);
    if (!next) {
      return '<section class="card"><div class="card-head"><h3 class="card-title">下一步</h3></div><div class="card-body">' +
        A.alert('這張工單已結案，報價、完工照片、發票與付款紀錄都留在時間軸裡。', 'ok', { title: '已完成' }) +
        '</div></section>';
    }
    var allowed = canDo(next.perm);
    var buttons = '<button type="button" class="btn btn--primary" data-act="' + next.act + '"' + (allowed ? '' : ' disabled') + '>' +
      icon(next.icon) + '<span>' + esc(next.label) + '</span></button>';
    if (o.status === '待核准') {
      buttons += '<button type="button" class="btn btn--secondary" data-act="reassign-pick"' + (canDo('approve') ? '' : ' disabled') + '>改派其他廠商</button>';
    }
    if (o.status === '待派工') {
      buttons += '<button type="button" class="btn btn--ghost" data-act="ai-detail">看 AI 排查紀錄</button>';
    }
    var note = allowed
      ? '目前以' + A.roleName() + '身分操作，可執行這一步。'
      : EXTRA.permHint[next.perm] + '，目前以' + A.roleName() + '身分只能查看。';

    return '<section class="card"><div class="card-head"><h3 class="card-title">下一步</h3>' +
      '<span class="card-sub">' + esc(v ? v.name : '尚未指派廠商') + '</span></div>' +
      '<div class="card-body"><div class="f07-actions">' + buttons + '</div>' +
      '<div class="f07-role-note mt-16">' + icon('shield') + '<span>' + esc(note) + '</span></div>' +
      '</div></section>';
  }

  function timelineCard(o) {
    return '<section class="card"><div class="card-head"><h3 class="card-title">工單時間軸</h3>' +
      '<span class="card-sub">' + esc(o.timeline.length + ' 筆紀錄') + '</span></div><div class="card-body">' +
      A.timeline(o.timeline.map(function (t, i) {
        var kind = null;
        if (t.text.indexOf('價格異常') >= 0) kind = 'danger';
        else if (t.text.indexOf('核准') >= 0 || t.text.indexOf('已付款') >= 0 || t.text.indexOf('完工') >= 0) kind = 'ok';
        else if (t.by === 'AI' || t.by === '系統') kind = 'accent';
        return { at: t.at, text: t.text, by: t.by, kind: kind, current: i === o.timeline.length - 1 };
      }), { rawTime: true }) + '</div></section>';
  }

  function renderDetail() {
    var box = document.getElementById('f07-detail');
    var o = order(state.selected);
    if (!o) {
      box.innerHTML = A.emptyState({ icon: 'wrench', title: '左邊選一張工單', text: '選了就能看到報修內容、報價比對與時間軸。' });
      return;
    }
    var u = D.unit(o.unitId);
    var v = vendor(o.vendorId);
    box.innerHTML =
      '<div class="f07-detail-head">' +
        '<div><div class="f07-detail-title"><h2>' + esc(o.id) + '</h2>' + A.badge(o.status, EXTRA.statusKind[o.status]) +
          (isAnomaly(o) ? A.badge('價格異常', 'danger') : '') +
          (o.incidentId ? A.badge('事件 ' + o.incidentId, 'warn') : '') + '</div>' +
          '<div class="f07-detail-sub">' +
            '<span>' + esc(o.unitId + '　' + u.region + ' · ' + u.type) + '</span>' +
            '<span>' + esc(o.item + '（' + o.category + '）') + '</span>' +
            '<span>' + esc(v ? v.name : '尚未指派廠商') + '</span>' +
          '</div></div>' +
        '<a class="btn btn--ghost btn--sm" href="' + esc(A.link('f06', 'app')) + '">看這間房的設備履歷</a>' +
      '</div>' +
      stepsHtml(o) +
      intakeCard(o) +
      quoteCard(o) +
      evidenceCard(o) +
      actionsCard(o) +
      timelineCard(o);
  }

  /* ================================================================
   * 6. 廠商資料庫
   * ================================================================ */
  function vendorFilters() {
    var cats = ['全部'], regions = ['全部'].concat(D.company.regions);
    D.vendors.forEach(function (v) { if (cats.indexOf(v.category) < 0) cats.push(v.category); });
    document.getElementById('f07-vendor-category').innerHTML = cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === state.vendorCategory ? ' selected' : '') + '>' + esc(c === '全部' ? '全部分類' : c) + '</option>';
    }).join('');
    document.getElementById('f07-vendor-region').innerHTML = regions.map(function (r) {
      return '<option value="' + esc(r) + '"' + (r === state.vendorRegion ? ' selected' : '') + '>' + esc(r === '全部' ? '全部區域' : r) + '</option>';
    }).join('');
  }

  function vendorJobs(v) {
    return state.orders.filter(function (o) { return o.vendorId === v.id; });
  }

  function filteredVendors() {
    var q = state.vendorQ.trim();
    return D.vendors.filter(function (v) {
      if (state.vendorCategory !== '全部' && v.category !== state.vendorCategory) return false;
      if (state.vendorRegion !== '全部' && v.regions.indexOf(state.vendorRegion) < 0) return false;
      if (q) {
        var hay = v.name + ' ' + v.category + ' ' + Object.keys(v.avgQuote).join(' ');
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function priceList(v, limit) {
    var keys = Object.keys(v.avgQuote).slice(0, limit || 99);
    return '<div class="f07-price-list">' + keys.map(function (k) {
      return '<span>' + esc(k) + '　<b class="f07-price-amt">' + esc(fmt.money(v.avgQuote[k])) + '</b></span>';
    }).join('') + (Object.keys(v.avgQuote).length > keys.length ? '<span class="muted-2">等 ' + Object.keys(v.avgQuote).length + ' 項</span>' : '') + '</div>';
  }

  function renderVendors() {
    var rows = filteredVendors();
    document.getElementById('f07-vendor-count').textContent = rows.length + ' 家 · 共 ' + D.vendors.length + ' 家';
    document.getElementById('f07-vendors').innerHTML = A.table({
      id: 'f07-vendor-table',
      sortable: true,
      columns: [
        { label: '廠商', key: 'name', primary: true, render: function (v) {
          return '<span class="f07-vendor-name"><strong>' + esc(v.name) + '</strong>' +
            '<span class="f07-vendor-phone">' + esc(A.mask(v.phone, 'phone')) + '</span></span>';
        } },
        { label: '分類', key: 'category', render: function (v) { return A.badge(v.category, 'neutral'); } },
        { label: '服務區域', key: 'regions', sortValue: function (v) { return v.regions.length; }, render: function (v) {
          return '<span class="f07-regions">' + v.regions.map(function (r) { return A.badge(r, 'neutral'); }).join('') + '</span>';
        } },
        { label: '過去報價', key: 'avgQuote', sortable: false, render: function (v) { return priceList(v, 2); } },
        { label: '平均完工', key: 'avgDays', align: 'num', render: function (v) { return esc(v.avgDays + ' 天'); } },
        { label: '返修率', key: 'reworkRate', align: 'num', render: function (v) {
          return '<span' + (v.reworkRate >= 0.1 ? ' class="neg"' : '') + '>' + esc(rework(v)) + '</span>';
        } },
        { label: '評分', key: 'rating', align: 'num', render: function (v) {
          return '<span class="f07-rating">' + icon('star') + esc(v.rating.toFixed(1)) + '</span>';
        } },
        { label: '工單', key: 'jobs', align: 'num', sortValue: function (v) { return vendorJobs(v).length; }, render: function (v) {
          return esc(vendorJobs(v).length + ' 張');
        } },
        { label: '', sortable: false, noLabel: true, align: 'center', render: function (v) {
          return '<button type="button" class="btn btn--ghost btn--sm" data-act="vendor" data-vendor="' + esc(v.id) + '">看明細</button>';
        } }
      ],
      rows: rows,
      empty: {
        icon: 'search',
        title: '找不到符合的廠商',
        text: '換一個分類或區域，或清掉搜尋字再試一次。',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="clear-vendor-filter">清除篩選</button>'
      }
    });
  }

  function openVendor(id) {
    var v = vendor(id);
    var jobs = vendorJobs(v);
    A.modal({
      title: v.name,
      size: 'lg',
      body: A.statRow([
        { label: '分類', value: v.category },
        { label: '服務區域', value: v.regions.join('、') },
        { label: '平均完工', value: v.avgDays + ' 天' },
        { label: '返修率', value: rework(v), kind: v.reworkRate >= 0.1 ? 'danger' : 'ok' },
        { label: '評分', value: v.rating.toFixed(1) },
        { label: '電話', value: A.mask(v.phone, 'phone') }
      ], { divided: true }) +
      '<h4 class="section-title mt-24 mb-8">過去報價</h4>' +
      A.table({
        columns: [
          { label: '維修項目', key: 'item', primary: true },
          { label: '這家的報價', key: 'amount', align: 'num', render: function (r) { return esc(fmt.money(r.amount)); } },
          { label: '同項目平均', key: 'avg', align: 'num', render: function (r) { return esc(fmt.money(r.avg)); } },
          { label: '價差', key: 'diff', align: 'num', render: function (r) {
            if (!r.avg) return '<span class="muted-2">—</span>';
            var d = Math.round((r.amount / r.avg - 1) * 100);
            return '<span class="' + (d > 0 ? 'neg' : d < 0 ? 'pos' : '') + '">' + esc((d > 0 ? '+' : '') + d + '%') + '</span>';
          } }
        ],
        rows: Object.keys(v.avgQuote).map(function (k) {
          return { item: k, amount: v.avgQuote[k], avg: D.marketAvgOf(k) };
        })
      }) +
      '<h4 class="section-title mt-24 mb-8">近期工單</h4>' +
      A.table({
        columns: [
          { label: '工單', key: 'id', primary: true },
          { label: '物件', key: 'unitId' },
          { label: '項目', key: 'item' },
          { label: '金額', key: 'quote', align: 'num', render: function (r) { return esc(r.quote ? fmt.money(r.quote) : '未報價'); } },
          { label: '狀態', key: 'status', render: function (r) { return A.badge(r.status, EXTRA.statusKind[r.status]); } }
        ],
        rows: jobs,
        empty: { title: '還沒派過工單給這家', text: '派工時可以從同區廠商裡挑。' }
      }),
      actions: [{ label: '關閉', kind: 'secondary' }]
    });
  }

  /* ================================================================
   * 7. 流程動作
   * ================================================================ */
  function afterChange() {
    renderKpis(); renderAlerts(); renderStatusTabs(); renderOrders(); renderDetail();
    if (state.view === 'vendors') renderVendors();
  }

  function select(id) {
    state.selected = id;
    renderOrders(); renderDetail();
  }

  function openDispatch(o) {
    var u = D.unit(o.unitId);
    var list = D.vendors.filter(function (v) { return v.category === o.category && v.regions.indexOf(u.region) >= 0; });
    if (!list.length) list = D.vendors.filter(function (v) { return v.category === o.category; });
    var best = list.slice().sort(function (a, b) { return (b.rating - a.rating) || (a.avgDays - b.avgDays); })[0];
    var name = 'f07-dispatch-vendor';
    A.modal({
      title: o.id + '　派工',
      body: '<p>' + esc('AI 判斷類別為「' + o.category + '」，下面是 ' + u.region + ' 可服務的' + o.category + '廠商。建議派給 ' + best.name + '（評分最高、同區）。') + '</p>' +
        '<div class="f07-quotes mt-16">' + list.map(function (v, i) {
          var price = v.avgQuote[o.item];
          return '<label class="f07-quote' + (v.id === best.id ? ' is-pick' : '') + '">' +
            '<span class="f07-quote-name">' +
              '<input type="radio" name="' + name + '" value="' + esc(v.id) + '"' + (v.id === best.id ? ' checked' : '') + '> ' +
              esc(v.name) + (v.id === best.id ? A.badge('系統建議', 'accent') : '') + '</span>' +
            '<span class="f07-quote-meta">' + esc('平均 ' + v.avgDays + ' 天完工 · 返修率 ' + rework(v) + ' · 評分 ' + v.rating) + '</span>' +
            '<span class="f07-quote-amount">' + esc(price ? fmt.money(price) + ' 起' : '無同項目報價') + '</span>' +
            '<span class="f07-quote-action"></span></label>';
        }).join('') + '</div>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '派工', kind: 'primary', icon: 'truck', onClick: function () {
          var picked = document.querySelector('input[name="' + name + '"]:checked');
          var v = vendor(picked ? picked.value : best.id);
          o.vendorId = v.id;
          o.status = '已派工';
          log(o, '派工給 ' + v.name + '（同區、平均 ' + v.avgDays + ' 天完工）', A.roleName());
          A.toast(o.id + ' 已派工給 ' + v.name, 'ok', { sub: '廠商回報價後會回到待核准' });
          afterChange();
        } }
      ]
    });
  }

  function openQuote(o) {
    var v = vendor(o.vendorId);
    var suggest = v.avgQuote[o.item] || o.marketAvg || 1500;
    var id = 'f07-quote-input';
    A.modal({
      title: o.id + '　登錄報價',
      size: 'sm',
      body: '<p>' + esc(v.name + ' 到場勘查後回報的金額。登錄後系統會自動跟同項目的歷史平均比一次。') + '</p>' +
        '<div class="field mt-16"><label for="' + id + '">報價金額（元）</label>' +
        '<input class="input" id="' + id + '" type="number" inputmode="numeric" min="0" step="100" value="' + suggest + '">' +
        '<span class="field-hint">' + esc('同項目（' + o.item + '）歷史平均 ' + fmt.money(o.marketAvg || suggest) + '。') + '</span></div>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '登錄報價', kind: 'primary', icon: 'tag', onClick: function () {
          var val = parseInt(document.getElementById(id).value, 10);
          if (!val || val <= 0) { A.toast('報價金額要大於 0 元', 'warn'); return false; }
          o.quote = val;
          o.marketAvg = o.marketAvg || D.marketAvgOf(o.item);
          o.status = '待核准';
          log(o, '廠商回報報價 ' + fmt.num(val) + ' 元' + (o.marketAvg ? '（同項目平均 ' + fmt.num(o.marketAvg) + ' 元）' : ''), v.name);
          if (isAnomaly(o)) {
            log(o, '系統標記價格異常：高於同項目平均 ' + overPct(o) + '%，待人工核准', '系統');
            A.toast(o.id + ' 報價高於平均 ' + overPct(o) + '%', 'danger', { sub: '已標為價格異常，核准前先比價' });
          } else {
            A.toast(o.id + ' 已登錄報價 ' + fmt.money(val), 'ok', { sub: '在合理範圍，等待核准' });
          }
          afterChange();
        } }
      ]
    });
  }

  function openApprove(o) {
    var anomaly = isAnomaly(o);
    var v = vendor(o.vendorId);
    A.modal({
      title: o.id + '　核准報價',
      size: 'lg',
      body: (anomaly
        ? A.alert('', 'danger', {
            title: '價格異常：高於同項目平均 ' + overPct(o) + '%',
            html: '<p>' + esc(v.name + ' 報 ' + fmt.money(o.quote) + '，同項目平均 ' + fmt.money(o.marketAvg) + '，差額 ' + fmt.money(o.quote - o.marketAvg) + '。仍要核准請先確認原因。') + '</p>'
          })
        : A.alert('報價在合理範圍，核准後廠商即可進場施工。', 'ok', { title: '報價正常' })) +
        '<h4 class="section-title mt-24 mb-8">同項目報價比較</h4>' +
        quoteCompareHtml(o, false),
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '核准報價', kind: anomaly ? 'danger' : 'primary', icon: 'shield-check', onClick: function () {
          o.status = '施工中';
          o.approvedBy = A.role;
          log(o, '核准報價 ' + fmt.num(o.quote) + ' 元' + (anomaly ? '（已知高於平均，理由：當日到場、附零件保固一年）' : ''), A.roleName());
          A.toast(o.id + ' 已核准 ' + fmt.money(o.quote), 'ok', { sub: v.name + ' 可以進場施工' });
          afterChange();
        } }
      ]
    });
  }

  function reassign(o, vendorId) {
    var v = vendor(vendorId);
    var before = o.quote;
    var price = v.avgQuote[o.item];
    A.confirm({
      title: '改派給 ' + v.name + '？',
      body: '<p>' + esc('原廠商報 ' + fmt.money(before) + '，' + v.name + ' 同項目報價 ' + fmt.money(price) + '，可以省 ' + fmt.money(before - price) + '。') + '</p>' +
        A.statRow([
          { label: '平均完工', value: v.avgDays + ' 天' },
          { label: '返修率', value: rework(v) },
          { label: '評分', value: v.rating.toFixed(1) }
        ], { divided: true, sm: true }),
      confirmLabel: '改派這家'
    }).then(function (ok) {
      if (!ok) return;
      var oldName = vendor(o.vendorId).name;
      o.vendorId = v.id;
      o.quote = price;
      o.status = '已派工';
      log(o, '改派給 ' + v.name + '（原 ' + oldName + ' 報價偏高），報價 ' + fmt.num(price) + ' 元', A.roleName());
      A.toast('已改派 ' + v.name + '，省下 ' + fmt.money(before - price), 'ok', { sub: '價格異常警示已解除' });
      afterChange();
    });
  }

  function openReassignPick(o) {
    var u = D.unit(o.unitId);
    var list = quotesFor(o.item, u.region).filter(function (q) { return q.vendor.id !== o.vendorId; });
    if (!list.length) { A.toast('這個區域沒有其他報過同項目的廠商', 'warn'); return; }
    A.modal({
      title: o.id + '　改派其他廠商',
      body: '<p>' + esc(u.region + ' 可服務、而且報過「' + o.item + '」的廠商如下，金額由低到高。') + '</p>' +
        '<div class="mt-16">' + quoteCompareHtml(o, true) + '</div>',
      actions: [{ label: '關閉', kind: 'secondary' }]
    });
  }

  function complete(o) {
    var v = vendor(o.vendorId);
    A.confirm({
      title: o.id + ' 回報完工？',
      body: '<p>' + esc('確認後會記下完工日、附上廠商的完工照片與發票，工單進入待付款。') + '</p>' +
        A.statRow([
          { label: '廠商', value: v.name },
          { label: '核准金額', value: fmt.money(o.quote) },
          { label: '完工日', value: fmt.date(D.today) }
        ], { divided: true, sm: true }),
      confirmLabel: '回報完工'
    }).then(function (ok) {
      if (!ok) return;
      o.status = '待付款';
      o.completedAt = D.today;
      o.invoice = 'INV-' + D.today.slice(2).replace(/-/g, '') + '-' + (10 + (state.seq % 80));
      log(o, '完工，上傳完工照片 2 張', v.name);
      log(o, '發票 ' + o.invoice + ' 已上傳，待會計付款', v.name);
      A.toast(o.id + ' 已完工，發票 ' + o.invoice, 'ok', { sub: '等會計確認付款就結案' });
      afterChange();
    });
  }

  function pay(o) {
    var v = vendor(o.vendorId);
    A.confirm({
      title: '確認付款給 ' + v.name + '？',
      body: '<p>' + esc('付款後這張工單結案，金額會認列到 ' + fmt.month(MONTH) + ' 的修繕成本。') + '</p>' +
        A.statRow([
          { label: '發票', value: o.invoice },
          { label: '金額', value: fmt.money(o.quote) },
          { label: '物件', value: o.unitId }
        ], { divided: true, sm: true }),
      confirmLabel: '確認付款'
    }).then(function (ok) {
      if (!ok) return;
      o.status = '完成';
      o.paid = true;
      log(o, '發票 ' + o.invoice + ' 入帳，已付款', A.roleName());
      A.toast(o.id + ' 已付款結案', 'ok', { sub: fmt.money(o.quote) + ' 已認列到本月修繕成本' });
      afterChange();
    });
  }

  function openAiDetail(o) {
    var extra = EXTRA.intake[o.id] || {};
    A.modal({
      title: o.id + '　AI 排查紀錄',
      body: '<p>' + esc(extra.ai || 'AI 已完成初步判斷，細節留在工單時間軸。') + '</p>' +
        '<div class="mt-16">' + A.timeline(o.timeline.filter(function (t) {
          return t.by === 'AI' || t.by === '系統' || t.by === '租客';
        }).map(function (t) { return { at: t.at, text: t.text, by: t.by, kind: t.by === 'AI' ? 'accent' : null }; }), { rawTime: true }) + '</div>',
      actions: [{ label: '關閉', kind: 'secondary' }]
    });
  }

  function openNew() {
    var unitSel = 'f07-new-unit', itemSel = 'f07-new-item', descId = 'f07-new-desc';
    var units = D.units.filter(function (u) { return u.status === 'rented' || u.status === 'leaving'; }).slice(0, 40);
    A.modal({
      title: '建立工單',
      body: '<p>' + esc('手動開單用在電話報修或巡檢發現的問題。租客從 LINE 報修的會自動開單。') + '</p>' +
        '<div class="field mt-16"><label for="' + unitSel + '">物件</label>' +
        '<select class="select" id="' + unitSel + '">' + units.map(function (u) {
          var t = D.tenantOf(u.id);
          return '<option value="' + esc(u.id) + '">' + esc(u.id + '　' + u.region + '　' + (t ? t.name : '無租客')) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field mt-16"><label for="' + itemSel + '">維修項目</label>' +
        '<select class="select" id="' + itemSel + '">' + EXTRA.newItems.map(function (i) {
          return '<option value="' + esc(i) + '">' + esc(i + '（同項目平均 ' + fmt.money(D.marketAvgOf(i)) + '）') + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field mt-16"><label for="' + descId + '">問題描述</label>' +
        '<textarea class="input textarea" id="' + descId + '" rows="3" placeholder="例如：浴室馬桶一直流水，水箱關不緊"></textarea>' +
        '<span class="field-hint">寫清楚現象與發生時間，AI 判類別會更準。</span></div>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '建立工單', kind: 'primary', icon: 'plus', onClick: function () {
          var unitId = document.getElementById(unitSel).value;
          var item = document.getElementById(itemSel).value;
          var desc = document.getElementById(descId).value.trim();
          if (!desc) { A.toast('請先填問題描述', 'warn'); return false; }
          state.seq++;
          var id = 'WO-10' + state.seq;
          var category = D.vendors.filter(function (v) { return v.avgQuote[item] != null; })[0].category;
          var o = {
            id: id, unitId: unitId, title: desc, item: item, category: category,
            status: '待派工', createdAt: D.today, vendorId: null, quote: null,
            marketAvg: D.marketAvgOf(item), approvedBy: null, completedAt: null,
            invoice: null, paid: false, source: '人工開單', aiUndecided: false, incidentId: null,
            timeline: [
              { at: nowStamp(), text: '人工開單：' + desc, by: A.roleName() },
              { at: nowStamp(), text: 'AI 判斷類別：' + category + '，同項目平均 ' + fmt.num(D.marketAvgOf(item)) + ' 元', by: 'AI' }
            ]
          };
          state.orders.unshift(o);
          state.status = '全部';
          state.category = '全部';
          state.selected = id;
          A.toast('已建立 ' + id, 'ok', { sub: unitId + '　' + item + '，接下來派工' });
          renderCategory();
          afterChange();
        } }
      ]
    });
  }

  /* ================================================================
   * 8. 視圖切換與事件
   * ================================================================ */
  function renderViewTabs() {
    document.getElementById('f07-view-tabs').innerHTML = A.tabs([
      { id: 'orders', label: '工單', icon: 'wrench', count: state.orders.filter(isOpen).length },
      { id: 'vendors', label: '廠商資料庫', icon: 'briefcase', count: D.vendors.length }
    ], { segmented: true, active: state.view });
  }

  function setView(v) {
    state.view = v;
    document.getElementById('f07-view-orders').hidden = v !== 'orders';
    document.getElementById('f07-view-vendors').hidden = v !== 'vendors';
    renderViewTabs();
    if (v === 'vendors') renderVendors();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var viewTab = t.closest('#f07-view-tabs .tab[data-tab]');
    if (viewTab) { setView(viewTab.getAttribute('data-tab')); return; }

    var statusTab = t.closest('#f07-status-tabs .tab[data-tab]');
    if (statusTab) { state.status = statusTab.getAttribute('data-tab'); renderStatusTabs(); renderOrders(); return; }

    if (t.closest('#f07-new')) { openNew(); return; }

    var btn = t.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');

    if (act === 'select') { select(btn.getAttribute('data-wo')); return; }
    if (act === 'focus') {
      setView('orders');
      state.status = '全部';
      renderStatusTabs();
      select(btn.getAttribute('data-wo'));
      var d = document.getElementById('f07-detail');
      if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (act === 'clear-filter') { state.status = '全部'; state.category = '全部'; renderStatusTabs(); renderCategory(); renderOrders(); return; }
    if (act === 'clear-vendor-filter') {
      state.vendorQ = ''; state.vendorCategory = '全部'; state.vendorRegion = '全部';
      document.getElementById('f07-vendor-q').value = '';
      vendorFilters(); renderVendors(); return;
    }
    if (act === 'vendor') { openVendor(btn.getAttribute('data-vendor')); return; }

    var o = order(state.selected);
    if (!o) return;
    if (act === 'dispatch') { openDispatch(o); return; }
    if (act === 'quote') { openQuote(o); return; }
    if (act === 'approve') { openApprove(o); return; }
    if (act === 'complete') { complete(o); return; }
    if (act === 'pay') { pay(o); return; }
    if (act === 'reassign') { reassign(o, btn.getAttribute('data-vendor')); return; }
    if (act === 'reassign-pick') { openReassignPick(o); return; }
    if (act === 'ai-detail') { openAiDetail(o); return; }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (t.id === 'f07-category') { state.category = t.value; renderOrders(); return; }
    if (t.id === 'f07-vendor-category') { state.vendorCategory = t.value; renderVendors(); return; }
    if (t.id === 'f07-vendor-region') { state.vendorRegion = t.value; renderVendors(); return; }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t instanceof Element && t.id === 'f07-vendor-q') { state.vendorQ = t.value; renderVendors(); }
  });

  A.onRole(function () { renderDetail(); renderVendors(); });

  /* ---------------- 初始化 ---------------- */
  document.getElementById('f07-vendor-search-icon').innerHTML = icon('search');
  renderViewTabs();
  renderStatusTabs();
  renderCategory();
  vendorFilters();
  renderKpis();
  renderAlerts();
  renderOrders();
  renderDetail();
  renderVendors();
  A.reveal();
})();
