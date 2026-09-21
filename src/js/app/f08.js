/* js/app/f08.js — 水電異常偵測（f08）進系統操作頁
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）、§6.1（檔案所有權）。
 * 資料：一律讀 window.DB（DB.utilities／DB.utilityAnomalies）；基礎層沒有的欄位
 *      （估價單價、排除理由、現場備註）放在本檔的 EXTRA，不動 data.js。
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
   * 1. 基礎層沒有的資料（只在本檔補）
   * ================================================================ */
  var EXTRA = {
    /* 估算單價：每度水 12 元、每度電 4 元（畫面上會標示） */
    rate: { water: 12, elec: 4 },

    kind: {
      water: {
        name: '疑似漏水', badge: 'danger', icon: 'droplet', unit: '度',
        item: '漏水檢修', category: '水電',
        woTitle: '疑似漏水，檢查管線與馬桶止水',
        done: '更換馬桶止水皮並重做浴室防水層，現場複測已不再滴水'
      },
      elec: {
        name: '空房仍在用電', badge: 'warn', icon: 'zap', unit: '度',
        item: '用電檢查', category: '水電',
        woTitle: '空房仍在用電，現場檢查電箱與家電',
        done: '現場確認冰箱與冷氣未關，已關閉電源並改由總開關斷電'
      }
    },

    /* 每件異常的現場備註（基礎層只有規則判斷，這裡補人看得懂的一句話） */
    note: {
      B04: '樓下 B03 已回報天花板滴水，走的是同一支管線，事件 INC-07 同步追蹤。',
      A12: '空置 21 天，用電量卻和有人住時差不多，要現場確認是不是有人未經同意使用。',
      C08: '空置 33 天，最常見是冰箱與冷氣沒拔電，順便確認電表有沒有被鄰戶接去用。',
      C20: '整備中，油漆與清潔師傅在現場施工，用電多半屬正常。',
      D15: '9 月 11 日才退租，月初仍有租客在住，這個月的用電多半屬正常。'
    },

    excuse: ['月初還有租客在住', '整備或施工人員用電', '已現場確認並關閉電源', '公共設備接在這一戶'],

    rules: [
      { name: '疑似漏水', kind: 'danger', text: '本月用水達過去 12 個月平均的 2 倍以上。水管或馬桶止水皮漏水時，帳單還沒來就先被抓到。' },
      { name: '空房仍在用電', kind: 'warn', text: '房間狀態是招租中或整備中，本月用電仍達 50 度以上。空房的水電由公司吸收，一間一個月就是好幾百元。' }
    ],

    nextWo: 1054,
    nextTodo: 31
  };

  var CAN_DISPATCH = ['boss', 'manager', 'maintenance'];   /* 派工與回報完工 */
  var CAN_CLOSE = ['boss', 'manager'];                     /* 結案：排除或確認解除 */
  var ACTOR = { boss: '張○○', manager: '陳○○', accountant: '黃○○', maintenance: '吳○○' };

  function can(list) { return list.indexOf(A.role) >= 0; }
  function actor() { return ACTOR[A.role] || '陳○○'; }
  function deg(n) { return fmt.num(n) + ' 度'; }
  function money(n) { return fmt.money(n); }

  /* ================================================================
   * 2. 狀態（記憶體）
   * ================================================================ */
  var MONTHS = D.utilityMonths;
  var MONTH_LABEL = D.stats.monthLabel;
  var NEXT_READ = '2026-10-01';

  function buildItem(a) {
    var it = {
      unitId: a.unitId, kind: a.kind, month: a.month, value: a.value,
      avg: a.baseline, desc: a.desc, action: a.action,
      status: '待處理', wo: null, excuse: null, resolved: null
    };
    if (a.unitId === 'B04') {                 /* 事件 INC-07 已經派工，接上既有工單 */
      var w = D.workOrder('WO-1046');
      it.status = '處理中';
      it.wo = {
        id: w.id, item: w.item, title: w.title, vendorId: w.vendorId,
        vendorName: D.vendorById(w.vendorId).name, quote: w.quote, status: w.status,
        timeline: w.timeline.slice()
      };
    }
    return it;
  }

  var state = {
    items: D.utilityAnomalies.map(buildItem),
    kind: 'all',
    region: '全部',
    selected: 'B04',
    vendorPick: null
  };

  function itemOf(unitId) {
    var found = null;
    state.items.forEach(function (it) { if (it.unitId === unitId) found = it; });
    return found;
  }
  function isOpen(it) { return it.status === '待處理' || it.status === '處理中'; }
  function openItems() { return state.items.filter(isOpen); }
  function extraCost(it) {
    return it.kind === 'water'
      ? Math.round((it.value - it.avg) * EXTRA.rate.water)
      : Math.round(it.value * EXTRA.rate.elec);
  }
  function statusKind(s) {
    return s === '待處理' ? 'warn' : s === '處理中' ? 'accent' : s === '已解除' ? 'ok' : 'neutral';
  }
  function readingOf(unitId, kind) {
    var rows = D.utilityOf(unitId).rows;
    return rows[rows.length - 1][kind];
  }
  function monthLabels() { return MONTHS.map(function (m) { return (+m.slice(5)) + ' 月'; }); }

  /* ================================================================
   * 3. KPI 與警示
   * ================================================================ */
  function renderKpis() {
    var open = openItems();
    var pending = state.items.filter(function (it) { return it.status === '待處理'; }).length;
    var working = state.items.filter(function (it) { return it.status === '處理中'; }).length;
    var excluded = state.items.filter(function (it) { return it.status === '已排除'; }).length;
    var resolved = state.items.filter(function (it) { return it.status === '已解除'; }).length;
    var leaks = open.filter(function (it) { return it.kind === 'water'; }).length;
    var cost = open.reduce(function (t, it) { return t + extraCost(it); }, 0);

    var parts = [];
    if (working) parts.push('處理中 ' + working + ' 件');
    if (excluded) parts.push('已排除 ' + excluded + ' 件');
    if (resolved) parts.push('已解除 ' + resolved + ' 件');

    document.getElementById('f08-kpis').innerHTML =
      A.kpi({ label: '本月偵測異常', value: state.items.length, unit: ' 件', icon: 'activity',
        hint: '103 間的水電讀數全部比對過' }) +
      A.kpi({ label: '待處理', value: pending, unit: ' 件', icon: 'inbox', kind: pending ? 'warn' : 'ok',
        hint: parts.length ? parts.join('、') : '都處理完了' }) +
      A.kpi({ label: '疑似漏水', value: leaks, unit: ' 間', icon: 'droplet', kind: leaks ? 'danger' : 'ok',
        hint: '本月用水達過往平均兩倍以上' }) +
      A.kpi({ label: '異常多用水電', value: 'NT$ ' + fmt.num(cost), icon: 'wallet', kind: cost ? 'warn' : 'ok',
        hint: '未結案的異常，以水 12 元、電 4 元一度估算' });
  }

  function renderAlerts() {
    var host = document.getElementById('f08-alerts');
    var open = openItems();
    if (!open.length) {
      host.innerHTML = A.alert('103 間的水電讀數都回到基準內，' + fmt.date(NEXT_READ) + ' 抄表後系統會再比對一次。', 'ok',
        { title: '本月水電異常都處理完了' });
      return;
    }
    var html = '';
    open.filter(function (it) { return it.kind === 'water'; }).forEach(function (it) {
      html += A.alert(it.desc + '。' + it.action + '。', 'danger', {
        title: it.unitId + ' 疑似漏水',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="select" data-unit="' + it.unitId + '">查看 ' + it.unitId + '</button>'
      });
    });
    var elec = open.filter(function (it) { return it.kind === 'elec'; });
    if (elec.length) {
      var total = elec.reduce(function (t, it) { return t + it.value; }, 0);
      var cost = elec.reduce(function (t, it) { return t + extraCost(it); }, 0);
      html += A.alert(elec.map(function (it) { return it.unitId; }).join('、') + ' 本月合計用電 ' + deg(total) +
        '，估計多付 ' + money(cost) + '。空房的水電由公司吸收，先確認是設備沒關還是有人在用。', 'warn', {
        title: elec.length + ' 間空房仍在用電',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="select" data-unit="' + elec[0].unitId + '">查看 ' + elec[0].unitId + '</button>'
      });
    }
    host.innerHTML = html;
  }

  /* ================================================================
   * 4. 篩選列與異常一覽表
   * ================================================================ */
  function renderFilters() {
    var water = state.items.filter(function (it) { return it.kind === 'water'; }).length;
    var elec = state.items.length - water;
    document.getElementById('f08-kind-tabs').innerHTML = A.tabs([
      { id: 'all', label: '全部', count: state.items.length },
      { id: 'water', label: '疑似漏水', count: water, countKind: 'danger' },
      { id: 'elec', label: '空房仍在用電', count: elec, countKind: 'warn' }
    ], { segmented: true, active: state.kind });

    var sel = document.getElementById('f08-region');
    if (!sel.options.length) {
      sel.innerHTML = ['全部'].concat(D.company.regions).map(function (r) {
        return '<option value="' + esc(r) + '">' + esc(r === '全部' ? '全部區域' : r) + '</option>';
      }).join('');
    }
    sel.value = state.region;
  }

  function filtered() {
    return state.items.filter(function (it) {
      if (state.kind !== 'all' && it.kind !== state.kind) return false;
      if (state.region !== '全部' && D.unit(it.unitId).region !== state.region) return false;
      return true;
    });
  }

  function renderTable() {
    var rows = filtered();
    document.getElementById('f08-count').textContent = rows.length === state.items.length
      ? '共 ' + state.items.length + ' 件'
      : '篩選後 ' + rows.length + ' 件，共 ' + state.items.length + ' 件';

    document.getElementById('f08-table').innerHTML = A.table({
      sortable: true,
      rowClass: function (r) { return r.unitId === state.selected ? 'is-selected' : ''; },
      rowAttrs: function (r) { return 'data-act="select" data-unit="' + r.unitId + '" tabindex="0"'; },
      empty: {
        icon: 'check-circle',
        title: '這個條件下沒有異常',
        text: '換個區域或類型再看一次，或直接看全部 ' + state.items.length + ' 件。',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="clear-filter">看全部異常</button>'
      },
      columns: [
        { label: '物件', key: 'unitId', primary: true, render: function (r) {
          var u = D.unit(r.unitId);
          return '<span class="cell-strong">' + esc(r.unitId) + '</span>' +
            '<span class="f08-cell-sub">' + esc(u.region + ' · ' + u.type + ' · ' + D.statusName(u.status)) + '</span>';
        } },
        { label: '異常類型', sortValue: function (r) { return EXTRA.kind[r.kind].name; }, render: function (r) {
          var k = EXTRA.kind[r.kind];
          return A.badge(k.name, k.badge, { icon: k.icon });
        } },
        { label: '本月讀數', align: 'num', sortValue: function (r) { return r.value; }, render: function (r) {
          return '<span class="cell-strong">' + esc(deg(r.value)) + '</span>' +
            '<span class="f08-cell-sub">' + esc(r.kind === 'water' ? '用水' : '用電') + '</span>';
        } },
        { label: '比對基準', align: 'num', sortValue: function (r) { return r.kind === 'water' ? r.avg : 0; }, render: function (r) {
          return r.kind === 'water'
            ? esc(deg(r.avg)) + '<span class="f08-cell-sub">過往 12 個月平均</span>'
            : '0 度<span class="f08-cell-sub">空房基準</span>';
        } },
        { label: '估計多付', align: 'num', sortValue: function (r) { return isOpen(r) ? extraCost(r) : 0; }, render: function (r) {
          return isOpen(r) ? esc(money(extraCost(r))) : '<span class="muted-2">已結案</span>';
        } },
        { label: '狀態', sortValue: function (r) { return r.status; }, render: function (r) {
          return A.badge(r.status, statusKind(r.status));
        } },
        { label: '動作', render: function (r) {
          var btn;
          if (r.status === '待處理') {
            btn = can(CAN_DISPATCH)
              ? '<button type="button" class="btn btn--primary btn--sm" data-act="dispatch" data-unit="' + r.unitId + '">派工檢查</button>'
              : '<span class="muted-2 small">待租務管理員派工</span>';
          } else if (r.wo) {
            btn = '<button type="button" class="btn btn--ghost btn--sm" data-act="select" data-unit="' + r.unitId + '">看工單 ' + esc(r.wo.id) + '</button>';
          } else {
            btn = '<button type="button" class="btn btn--ghost btn--sm" data-act="select" data-unit="' + r.unitId + '">查看</button>';
          }
          return '<div class="row-actions">' + btn + '</div>';
        } }
      ],
      rows: rows
    });
  }

  /* ================================================================
   * 5. 物件詳情
   * ================================================================ */
  function unitPicker() {
    var anomaly = state.items.map(function (it) { return it.unitId; });
    function opt(id) {
      var u = D.unit(id);
      return '<option value="' + esc(id) + '"' + (id === state.selected ? ' selected' : '') + '>' +
        esc(id + ' · ' + u.region + ' · ' + u.type) + '</option>';
    }
    var others = D.units.filter(function (u) { return anomaly.indexOf(u.id) < 0; }).map(function (u) { return opt(u.id); }).join('');
    return '<label class="f08-picker"><span>查看物件</span>' +
      '<select class="select" id="f08-unit">' +
      '<optgroup label="本月異常">' + anomaly.map(opt).join('') + '</optgroup>' +
      '<optgroup label="其他物件">' + others + '</optgroup>' +
      '</select></label>';
  }

  function detailHead(u, it) {
    var t = u.tenantId ? D.tenant(u.tenantId) : null;
    var badges = it
      ? A.badge(EXTRA.kind[it.kind].name, EXTRA.kind[it.kind].badge, { icon: EXTRA.kind[it.kind].icon }) + A.badge(it.status, statusKind(it.status))
      : A.badge('本月正常', 'ok', { icon: 'check-circle' });
    var sub = ['<span>' + esc(u.region + ' · ' + u.building + ' 棟 ' + u.floor + ' 樓 · ' + u.type + ' ' + fmt.ping(u.ping)) + '</span>'];
    if (t) sub.push('<span>租客 ' + esc(t.name) + '（' + esc(A.mask(t.phone, 'phone')) + '）</span>');
    else sub.push('<span>' + esc(D.statusName(u.status)) + (u.vacantSince ? '，已空置 ' + A.daysBetween(u.vacantSince, D.today) + ' 天' : '') + '</span>');
    sub.push('<span>抄表月份 ' + esc(MONTH_LABEL) + '</span>');
    return '<header class="f08-detail-head"><div>' +
      '<div class="f08-detail-title"><h2>' + esc(u.id) + '</h2>' + badges + '</div>' +
      '<div class="f08-detail-sub">' + sub.join('') + '</div>' +
      '</div>' + unitPicker() + '</header>';
  }

  function chartCard(u, kind, it) {
    var util = D.utilityOf(u.id);
    var base = util.baseline[kind];
    var value = readingOf(u.id, kind);
    var isKind = !!it && it.kind === kind;
    var ratio = base ? value / base : 0;
    var stats = [
      { label: '本月', value: deg(value), kind: isKind ? 'danger' : '' },
      { label: '過往平均', value: deg(base) },
      { label: kind === 'water' ? '倍數' : '與平均差', value: kind === 'water'
        ? (Math.round(ratio * 10) / 10) + ' 倍'
        : fmt.signed(value - base) + ' 度' }
    ];
    return '<section class="card card--static f08-chart-card">' +
      '<div class="card-head"><h3 class="card-title">' + icon(kind === 'water' ? 'droplet' : 'zap') +
      (kind === 'water' ? '用水趨勢' : '用電趨勢') + '</h3>' +
      A.badge('近 12 個月', 'neutral') + '</div>' +
      A.statRow(stats, { divided: true, sm: true }) +
      '<div id="f08-chart-' + kind + '"></div>' +
      '<p class="f08-chart-note">虛線是這間房過去 12 個月的平均 ' + esc(deg(base)) + '，每次抄表都拿本月讀數和它比。</p>' +
      '</section>';
  }

  function drawCharts(u, it) {
    ['water', 'elec'].forEach(function (kind) {
      var util = D.utilityOf(u.id);
      var data = util.rows.map(function (r) { return r[kind]; });
      var alertIdx = (it && it.kind === kind) ? data.length - 1 : -1;
      var color = kind === 'water' ? 'var(--accent)' : 'var(--warn)';
      A.charts.bar('#f08-chart-' + kind, {
        labels: monthLabels(),
        series: [{ name: kind === 'water' ? '用水' : '用電', data: data, color: color }],
        baseline: { value: util.baseline[kind], label: '' },
        colorOf: function (v, i) { return i === alertIdx ? 'var(--danger)' : color; },
        valueFormat: function (v) { return deg(v); },
        yFormat: function (v) { return String(v); },
        height: 200
      });
    });
  }

  function evidenceCard(u, it) {
    var util = D.utilityOf(u.id);
    var lines = [];
    function line(text, sub, kind) {
      return { text: text, sub: sub, kind: kind || 'ok' };
    }
    if (it && it.kind === 'water') {
      var rows = util.rows.map(function (r) { return r.water; });
      var past = rows.slice(0, rows.length - 1);
      var lo = Math.min.apply(null, past), hi = Math.max.apply(null, past);
      var peers = D.units.filter(function (x) { return x.building === u.building && x.type === u.type && x.id !== u.id; });
      var peerAvg = peers.length
        ? Math.round(peers.reduce(function (t, x) { return t + readingOf(x.id, 'water'); }, 0) / peers.length * 10) / 10
        : null;
      lines.push(line('本月用水 ' + deg(it.value) + '，是過往平均 ' + deg(it.avg) + ' 的 ' +
        (Math.round(it.value / it.avg * 10) / 10) + ' 倍', '超過兩倍就達到警示門檻', 'danger'));
      lines.push(line('前 11 個月都在 ' + lo + ' ～ ' + hi + ' 度之間', '基準很穩，不是季節性變動'));
      if (peerAvg !== null) lines.push(line('同棟同房型另外 ' + peers.length + ' 間本月平均 ' + deg(peerAvg),
        '不是整棟一起漲，問題出在這一間'));
      var t = u.tenantId ? D.tenant(u.tenantId) : null;
      if (t) lines.push(line('這間房有人住：租客 ' + t.name + '，本月租金' + t.paid,
        '租客沒有回報異常，用量先被系統抓到', 'neutral'));
    } else if (it) {
      var days = u.vacantSince ? A.daysBetween(u.vacantSince, D.today) : 0;
      var prev = util.rows[util.rows.length - 2].elec;
      var vac = D.units.filter(function (x) { return ['listing', 'prep'].indexOf(x.status) >= 0 && x.id !== u.id; });
      var vacAvg = vac.length ? Math.round(vac.reduce(function (t, x) { return t + readingOf(x.id, 'elec'); }, 0) / vac.length) : null;
      lines.push(line('本月用電 ' + deg(it.value) + '，但這間房沒有人住', '空房的用電應該接近 0 度', 'danger'));
      lines.push(line('目前狀態' + D.statusName(u.status) + (days ? '，已空置 ' + days + ' 天（' + fmt.date(u.vacantSince) + ' 起）' : ''),
        '空房期間的水電由公司吸收'));
      lines.push(line('上個月也用了 ' + deg(prev), '不是單月異常，是一直在跑'));
      if (vacAvg !== null) lines.push(line('其他 ' + vac.length + ' 間空房本月平均 ' + deg(vacAvg),
        '同期空房的比較基準', 'neutral'));
    } else {
      ['water', 'elec'].forEach(function (kind) {
        var v = readingOf(u.id, kind), b = util.baseline[kind];
        lines.push(line('本月' + (kind === 'water' ? '用水 ' : '用電 ') + deg(v) + '，過往平均 ' + deg(b),
          kind === 'water' ? '未達兩倍門檻' : '未達空房用電門檻'));
      });
      lines.push(line('下次比對 ' + fmt.date(NEXT_READ), '抄表當天自動跑，不用有人記得', 'neutral'));
    }
    return '<section class="card card--static"><div class="card-head"><h3 class="card-title">' +
      icon('search') + '判斷依據</h3></div>' +
      '<div class="f08-evidence">' + lines.map(function (l) {
        return '<div class="f08-evidence-item is-' + l.kind + '">' +
          icon(l.kind === 'danger' ? 'alert-circle' : l.kind === 'neutral' ? 'info' : 'check-circle') +
          '<div>' + esc(l.text) + '<small>' + esc(l.sub) + '</small></div></div>';
      }).join('') + '</div>' +
      (it ? '<p class="f08-chart-note">' + esc(EXTRA.note[u.id] || it.action) + '</p>' : '') +
      '</section>';
  }

  function woCard(it) {
    var w = it.wo;
    var kindName = w.status === '完成' ? 'ok' : w.status === '已派工' ? 'accent' : 'warn';
    return '<div class="f08-wo-item">' +
      '<div class="f08-wo-title">' + esc(w.title) + '</div>' +
      '<div class="f08-wo-sub">' + esc(w.id + ' · ' + w.vendorName + ' · ' + (w.quote ? money(w.quote) : '現場報價')) + '</div>' +
      '<div class="f08-wo-right">' + A.badge(w.status, kindName) +
      '<a class="link-more small" href="' + esc(A.link('f07', 'app')) + '">到工單管理</a></div>' +
      '</div>' +
      '<div class="f08-wo-timeline">' + A.timeline(w.timeline.map(function (t) {
        return { at: t.at, text: t.text, by: t.by };
      })) + '</div>';
  }

  function actionCard(u, it) {
    var body = '';
    var actions = '';
    var hint = '';

    if (!it) {
      body = A.alert('本月用水與用電都在基準內，不需要派工。' + fmt.date(NEXT_READ) + ' 抄表後系統會再比對一次。', 'ok',
        { title: u.id + ' 本月正常' });
      return '<section class="card card--static"><div class="card-head"><h3 class="card-title">' +
        icon('wrench') + '處理</h3></div>' + body + '</section>';
    }

    body = A.alert(it.desc + '。' + it.action + '。', it.kind === 'water' ? 'danger' : 'warn',
      { title: EXTRA.kind[it.kind].name + '：' + it.unitId });

    if (it.wo) body += '<div class="mt-16">' + woCard(it) + '</div>';

    if (it.status === '待處理') {
      hint = '派工後系統會開工單、指派待辦給修繕人員，時間軸從這一刻開始記。';
      actions = can(CAN_DISPATCH)
        ? '<button type="button" class="btn btn--primary" data-act="dispatch" data-unit="' + u.id + '">派工檢查</button>'
        : '';
      if (can(CAN_CLOSE)) actions += '<button type="button" class="btn btn--secondary" data-act="exclude" data-unit="' + u.id + '">標記為已排除</button>';
    } else if (it.status === '處理中') {
      if (it.wo && it.wo.status !== '完成') {
        hint = '工單 ' + it.wo.id + ' 完工並回報後，才能確認異常解除。';
        if (can(CAN_DISPATCH)) actions += '<button type="button" class="btn btn--secondary" data-act="finish-wo" data-unit="' + u.id + '">廠商回報完工</button>';
        if (can(CAN_CLOSE)) actions += '<button type="button" class="btn btn--primary is-disabled" aria-disabled="true" disabled>確認異常已解除</button>';
      } else {
        hint = '工單已完工。確認後這件異常結案，下次抄表再比對一次。';
        actions = can(CAN_CLOSE)
          ? '<button type="button" class="btn btn--primary" data-act="resolve" data-unit="' + u.id + '">確認異常已解除</button>'
          : '';
      }
    } else if (it.status === '已排除') {
      hint = '已排除：' + it.excuse;
      actions = can(CAN_CLOSE)
        ? '<button type="button" class="btn btn--secondary" data-act="reopen" data-unit="' + u.id + '">重新列入追蹤</button>'
        : '';
    } else {
      hint = it.resolved || '異常已解除。';
      actions = '';
    }

    if (!can(CAN_DISPATCH) && !can(CAN_CLOSE)) hint = '會計視角只能檢視。派工與結案由租務管理員或修繕人員處理。';

    return '<section class="card card--static"><div class="card-head"><h3 class="card-title">' +
      icon('wrench') + '處理</h3>' + A.badge(it.status, statusKind(it.status)) + '</div>' +
      body +
      '<div class="f08-actions"><p class="f08-actions-hint">' + esc(hint) + '</p>' + actions + '</div>' +
      '</section>';
  }

  function renderDetail() {
    var u = D.unit(state.selected);
    var it = itemOf(state.selected);
    document.getElementById('f08-detail').innerHTML =
      detailHead(u, it) +
      '<div class="f08-charts">' + chartCard(u, 'water', it) + chartCard(u, 'elec', it) + '</div>' +
      '<div class="grid grid--2">' + evidenceCard(u, it) + actionCard(u, it) + '</div>';
    drawCharts(u, it);
  }

  function renderAll() {
    renderKpis();
    renderAlerts();
    renderFilters();
    renderTable();
    renderDetail();
  }

  /* ================================================================
   * 6. 動作
   * ================================================================ */
  function select(unitId) {
    if (!unitId || !D.unit(unitId)) return;
    state.selected = unitId;
    renderTable();
    renderDetail();
  }

  function vendorsFor(u, k) {
    return D.vendors.filter(function (v) {
      return v.category === k.category && v.regions.indexOf(u.region) >= 0;
    }).sort(function (a, b) { return b.rating - a.rating; });
  }

  function vendorRow(v, k, picked) {
    var price = v.avgQuote[k.item];
    return '<label class="f08-vendor-item' + (picked ? ' is-picked' : '') + '" data-act="pick-vendor" data-vendor="' + v.id + '">' +
      '<input type="radio" name="f08-vendor" value="' + v.id + '"' + (picked ? ' checked' : '') + '>' +
      '<span class="f08-vendor-dot" aria-hidden="true"></span>' +
      '<span class="f08-vendor-name">' + esc(v.name) + '</span>' +
      '<span class="f08-vendor-meta">' + esc('平均 ' + v.avgDays + ' 天完工 · 返修率 ' + fmt.pct(v.reworkRate) + ' · 評分 ' + v.rating) + '</span>' +
      '<span class="f08-vendor-price">' + (price ? esc(money(price)) + '<small>同項目歷史平均</small>' : '現場報價<small>這個項目沒有報價紀錄</small>') + '</span>' +
      '</label>';
  }

  function openDispatch(unitId) {
    var it = itemOf(unitId);
    if (!it || it.status !== '待處理') return;
    var u = D.unit(unitId);
    var k = EXTRA.kind[it.kind];
    var list = vendorsFor(u, k);
    if (!list.length) {
      A.toast(u.region + ' 沒有可派的' + k.category + '廠商', 'warn', { sub: '請先到廠商管理新增服務區域' });
      return;
    }
    state.vendorPick = list[0].id;
    A.modal({
      title: '派工檢查 ' + u.id,
      body: '<p>' + esc(it.desc + '。' + it.action + '。') + '</p>' +
        A.statRow([
          { label: '檢查項目', value: k.item },
          { label: '物件', value: u.id + ' · ' + u.region },
          { label: '估計多付', value: money(extraCost(it)) }
        ], { divided: true, sm: true }) +
        '<p class="mt-16 muted small">系統已先依區域與類別篩出 ' + list.length + ' 家' + esc(k.category) + '廠商，預設選評分最高的一家。</p>' +
        '<div class="f08-vendor mt-8">' + list.map(function (v, i) { return vendorRow(v, k, i === 0); }).join('') + '</div>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '建立工單', kind: 'primary', onClick: function () { dispatch(it, state.vendorPick); } }
      ]
    });
  }

  function dispatch(it, vendorId) {
    var u = D.unit(it.unitId);
    var k = EXTRA.kind[it.kind];
    var v = D.vendorById(vendorId) || vendorsFor(u, k)[0];
    var id = 'WO-' + EXTRA.nextWo;
    var todo = 'TD-' + EXTRA.nextTodo;
    EXTRA.nextWo += 1;
    EXTRA.nextTodo += 1;
    var price = v.avgQuote[k.item];
    it.status = '處理中';
    it.wo = {
      id: id, item: k.item, title: u.id + ' ' + k.woTitle, vendorId: v.id, vendorName: v.name,
      quote: price || null, status: '已派工',
      timeline: [
        { at: D.today + ' 09:30', text: '水電異常偵測建立工單：' + it.desc, by: '系統' },
        { at: D.today + ' 09:31', text: 'AI 判斷類別：' + k.category + '，建議廠商 ' + v.name + '（同區、平均 ' + v.avgDays + ' 天完工、返修率 ' + fmt.pct(v.reworkRate) + '）', by: 'AI' },
        { at: D.today + ' 09:32', text: '派工給 ' + v.name + (price ? '，參考報價 ' + money(price) : '，費用依現場報價') , by: actor() }
      ]
    };
    A.toast('已建立工單 ' + id + '，派給 ' + v.name, 'ok', { sub: '待辦 ' + todo + ' 同步指派給修繕人員 吳○○' });
    renderAll();
  }

  function finishWo(unitId) {
    var it = itemOf(unitId);
    if (!it || !it.wo || it.wo.status === '完成') return;
    var k = EXTRA.kind[it.kind];
    it.wo.status = '完成';
    it.wo.timeline.push({ at: D.today + ' 16:20', text: it.wo.vendorName + ' 回報完工：' + k.done, by: it.wo.vendorName });
    it.wo.timeline.push({ at: D.today + ' 16:22', text: '完工照片 2 張已上傳，費用進本月修繕成本', by: '系統' });
    A.toast(it.wo.id + ' 已完工', 'ok', { sub: '可以確認 ' + unitId + ' 的異常是否解除' });
    renderAll();
  }

  function resolve(unitId) {
    var it = itemOf(unitId);
    if (!it) return;
    var k = EXTRA.kind[it.kind];
    A.confirm({
      title: '確認 ' + unitId + ' 的水電異常已解除？',
      body: '<p>確認後這件異常結案，' + esc(fmt.date(NEXT_READ)) + ' 抄表時系統會再比對一次，數字沒回來會重新警示。</p>' +
        A.statRow([
          { label: '異常類型', value: k.name },
          { label: '本月讀數', value: deg(it.value) },
          { label: '處理工單', value: it.wo ? it.wo.id : '無' }
        ], { divided: true, sm: true }),
      confirmLabel: '確認已解除'
    }).then(function (ok) {
      if (!ok) return;
      it.status = '已解除';
      it.resolved = '已由 ' + actor() + ' 於 ' + fmt.date(D.today) + ' 確認解除，' + fmt.date(NEXT_READ) + ' 抄表會再比對一次。';
      if (it.wo) it.wo.timeline.push({ at: D.today + ' 16:40', text: '確認異常已解除，工單結案', by: actor() });
      A.toast(unitId + ' 的水電異常已解除', 'ok', { sub: '本月待處理少一件' });
      renderAll();
    });
  }

  function openExclude(unitId) {
    var it = itemOf(unitId);
    if (!it) return;
    var selId = 'f08-excuse';
    var noteId = 'f08-excuse-note';
    A.modal({
      title: '標記 ' + unitId + ' 為已排除',
      size: 'sm',
      body: '<p>確定這筆用量有合理原因，就把它排除。排除後不再計入待處理，但紀錄會留著。</p>' +
        '<div class="field"><label for="' + selId + '">排除原因</label>' +
        '<select class="select" id="' + selId + '">' + EXTRA.excuse.map(function (x) {
          return '<option value="' + esc(x) + '">' + esc(x) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field mt-16"><label for="' + noteId + '">補充說明（選填）</label>' +
        '<textarea class="input textarea" id="' + noteId + '" rows="2" placeholder="例如：9 月 1 日到 11 日前租客仍在住"></textarea></div>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '標記為已排除', kind: 'primary', onClick: function () {
          var reason = document.getElementById(selId).value;
          var note = document.getElementById(noteId).value.trim();
          it.status = '已排除';
          it.excuse = reason + (note ? '（' + note + '）' : '');
          A.toast(unitId + ' 已排除', 'ok', { sub: reason });
          renderAll();
        } }
      ]
    });
  }

  function reopen(unitId) {
    var it = itemOf(unitId);
    if (!it) return;
    it.status = '待處理';
    it.excuse = null;
    A.toast(unitId + ' 已重新列入待處理', 'neutral');
    renderAll();
  }

  function openRules() {
    var pending = state.items.filter(function (it) { return it.status === '待處理'; }).length;
    var working = state.items.filter(function (it) { return it.status === '處理中'; }).length;
    A.modal({
      title: '系統怎麼抓水電異常',
      body: '<p>每個月抄表資料一進系統，103 間會全部跑過一次，兩條規則命中就跳警示。</p>' +
        '<div class="f08-evidence mt-16">' + EXTRA.rules.map(function (r) {
          return '<div class="f08-evidence-item is-' + (r.kind === 'danger' ? 'danger' : 'neutral') + '">' +
            icon(r.kind === 'danger' ? 'droplet' : 'zap') +
            '<div><strong>' + esc(r.name) + '</strong><small>' + esc(r.text) + '</small></div></div>';
        }).join('') + '</div>' +
        '<p class="mt-16">異常會同步開待辦給修繕人員，也會出現在 AI 工作中心的今日清單。</p>' +
        A.alert('目前待處理 ' + pending + ' 件、處理中 ' + working + ' 件。下次比對 ' + fmt.date(NEXT_READ) + '。',
          pending ? 'warn' : 'ok', { title: '現在的狀況' }),
      actions: [{ label: '知道了', kind: 'primary' }]
    });
  }

  /* ================================================================
   * 7. 事件
   * ================================================================ */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var pick = t.closest('[data-act="pick-vendor"]');
    if (pick) {
      state.vendorPick = pick.getAttribute('data-vendor');
      var list = pick.parentNode.querySelectorAll('.f08-vendor-item');
      Array.prototype.forEach.call(list, function (n) { n.classList.toggle('is-picked', n === pick); });
      return;
    }

    var btn = t.closest('[data-act]');
    if (btn) {
      var act = btn.getAttribute('data-act');
      var unit = btn.getAttribute('data-unit');
      if (act === 'select') { select(unit); return; }
      if (act === 'clear-filter') { state.kind = 'all'; state.region = '全部'; renderFilters(); renderTable(); return; }
      if (act === 'dispatch') { select(unit); openDispatch(unit); return; }
      if (act === 'finish-wo') { finishWo(unit); return; }
      if (act === 'resolve') { resolve(unit); return; }
      if (act === 'exclude') { openExclude(unit); return; }
      if (act === 'reopen') { reopen(unit); return; }
      return;
    }

    var tab = t.closest('#f08-kind-tabs .tab[data-tab]');
    if (tab) { state.kind = tab.getAttribute('data-tab'); renderTable(); return; }
    if (t.closest('#f08-rules')) { openRules(); return; }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var t = e.target;
    if (!(t instanceof Element)) return;
    var row = t.closest('tr[data-act="select"]');
    if (row) { e.preventDefault(); select(row.getAttribute('data-unit')); }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;
    if (t.id === 'f08-region') { state.region = t.value; renderTable(); return; }
    if (t.id === 'f08-unit') { select(t.value); }
  });

  A.onRole(function () { renderAll(); });

  renderAll();
})();
