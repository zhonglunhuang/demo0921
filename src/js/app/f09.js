/* js/app/f09.js — 鑰匙與門禁管理（f09）進系統操作頁
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）、§6.1（檔案所有權）。
 * 資料：一律讀 window.DB（units.keys、keysLog、keyItems、keyPrices、keyShortages、
 *      smartLockFlow、deposits）；基礎層沒有的欄位（保管位置、門禁主機、入住密碼、
 *      點交預約）放在本檔的 EXTRA，不動 data.js。
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
    /* 四類裝置的圖示與一句說明 */
    itemMeta: {
      key: { icon: 'key', note: '房門鑰匙，遺失需整組換鎖' },
      card: { icon: 'credit-card', note: '大門與地下室門禁，可遠端停用' },
      remote: { icon: 'wifi', note: '車庫鐵捲門遙控器' },
      mailbox: { icon: 'inbox', note: '一樓信箱鑰匙' }
    },
    /* 已裝門禁主機（密碼＋磁扣雙認證）的棟別 */
    lockBuildings: ['A', 'B'],
    lockNote: 'A、B 棟大門已改為密碼加磁扣雙認證：入住當天自動產生密碼，退租當天自動失效，磁扣遺失可遠端停用。',
    noLockNote: '這一棟還沒換裝門禁主機，退租時要把鑰匙與磁扣全數收回。',
    /* 空房鑰匙的保管位置 */
    custody: {
      A12: '辦公室保險箱 第 2 層 · A 區掛勾',
      C08: '辦公室保險箱 第 3 層 · C 區掛勾',
      C20: '辦公室保險箱 第 3 層 · C 區掛勾',
      D15: '辦公室保險箱 第 1 層 · D 區掛勾'
    },
    /* 已預約的退租點交 */
    handover: {
      B15: { at: '2026-10-14 14:00', by: 'S02', note: '租客已通知不續租，點交時間已回覆確認。' },
      E03: { at: '2026-10-31 10:00', by: 'S03', note: '租客已通知不續租，點交時間待租客回覆。' }
    },
    /* 允許執行點交與登記短少的角色（會計負責押金退款，不做現場點交） */
    handoverRoles: ['boss', 'manager', 'maintenance']
  };

  /* 入住密碼：由房號推出固定 6 位數，重整後不會變 */
  function pinOf(unitId) {
    var n = 0;
    for (var i = 0; i < unitId.length; i++) n = n * 31 + unitId.charCodeAt(i);
    return String(100000 + (Math.abs(n) * 7919) % 900000);
  }

  var ITEMS = D.keyItems;                 /* 鑰匙、門禁磁扣、車庫遙控器、信箱鑰匙 */

  /* ================================================================
   * 2. 狀態：每間物件一筆鑰匙紀錄
   * ================================================================ */
  var state = {
    scope: 'all',
    region: 'all',
    selected: 'B15',
    rooms: []
  };

  function buildRoom(u) {
    var t = u.tenantId ? D.tenant(u.tenantId) : null;
    var held = !!t;                         /* 租客手上 */
    var plan = EXTRA.handover[u.id] || null;
    var items = ITEMS.map(function (k) {
      var total = u.keys[k.key] || 0;
      return {
        key: k.key, name: k.name, total: total,
        held: held ? total : 0,             /* 租客持有 */
        returned: 0, missing: 0,
        price: D.keyPrices[k.key]
      };
    }).filter(function (r) { return r.total > 0; });

    return {
      id: u.id, unit: u, tenant: t,
      /* held 出租中、handover 待點交、office 公司保管、done 點交完成 */
      stage: plan ? 'handover' : (held ? 'held' : 'office'),
      plan: plan,
      items: items,
      counting: false,                      /* 是否已按下「開始退租點交」 */
      pinActive: hasLock(u) && held,
      pinKilledAt: null,
      log: D.keysOf(u.id).map(function (r) {
        return { at: r.at, title: '領用' + r.item + ' ' + r.qty + ' 件', text: '租客簽收，簽收人 ' + r.by, kind: 'accent' };
      }),
      deposit: D.depositOf(u.id) || null,
      extraDeduct: null                     /* 點交完成後補上的短少扣款 */
    };
  }

  function hasLock(u) { return EXTRA.lockBuildings.indexOf(u.building) >= 0; }

  state.rooms = D.units.map(buildRoom);

  function room(id) {
    var r = null;
    state.rooms.forEach(function (x) { if (x.id === id) r = x; });
    return r;
  }
  function current() { return room(state.selected) || state.rooms[0]; }

  function heldOf(r) { var n = 0; r.items.forEach(function (i) { n += i.held; }); return n; }
  function pendingOf(r) { var n = 0; r.items.forEach(function (i) { n += i.held - i.returned - i.missing; }); return n; }
  function returnedOf(r) { var n = 0; r.items.forEach(function (i) { n += i.returned; }); return n; }
  function missingOf(r) { var n = 0; r.items.forEach(function (i) { n += i.missing; }); return n; }
  function missingCost(r) { var n = 0; r.items.forEach(function (i) { n += i.missing * i.price; }); return n; }
  function officeOf(r) {
    /* 公司保管：空房全部在公司，出租中的房已回收部分也算回公司 */
    var n = 0;
    r.items.forEach(function (i) { n += (r.tenant ? 0 : i.total) + i.returned; });
    return n;
  }

  function totals() {
    var t = { stock: 0, held: 0, office: 0, missing: 0, byItem: {} };
    ITEMS.forEach(function (k) { t.byItem[k.key] = { name: k.name, stock: 0, held: 0, office: 0, missing: 0 }; });
    state.rooms.forEach(function (r) {
      r.items.forEach(function (i) {
        var b = t.byItem[i.key];
        var held = i.held - i.returned - i.missing;
        var office = (r.tenant ? 0 : i.total) + i.returned;
        b.stock += i.total; b.held += held; b.office += office; b.missing += i.missing;
        t.stock += i.total; t.held += held; t.office += office; t.missing += i.missing;
      });
    });
    return t;
  }

  function waitingHandover() {
    return state.rooms.filter(function (r) { return r.stage === 'handover'; });
  }
  function lockUnits() {
    return state.rooms.filter(function (r) { return hasLock(r.unit); }).length;
  }
  function shortRooms() {
    return state.rooms.filter(function (r) { return missingOf(r) > 0; });
  }
  function shortText(r) {
    return r.items.filter(function (i) { return i.missing > 0; })
      .map(function (i) { return i.name + '短少 ' + i.missing + ' 件'; }).join('、');
  }
  function handoverDate(r) { return r.plan ? r.plan.at.slice(0, 10) : D.today; }
  function canHandover() { return EXTRA.handoverRoles.indexOf(A.role) >= 0; }
  function canDeposit() { return A.can(A.role, 'deposit'); }

  /* ================================================================
   * 3. 畫面
   * ================================================================ */
  var $ = function (sel) { return document.querySelector(sel); };

  var SCOPES = [
    { key: 'all', label: '全部' },
    { key: 'held', label: '出租中' },
    { key: 'handover', label: '待點交' },
    { key: 'office', label: '公司保管' },
    { key: 'short', label: '短少' }
  ];

  function scopeCount(key) {
    return state.rooms.filter(function (r) { return scopeMatch(r, key); }).length;
  }
  function scopeMatch(r, key) {
    if (key === 'all') return true;
    if (key === 'short') return missingOf(r) > 0;
    if (key === 'office') return r.stage === 'office';
    return r.stage === key;
  }
  function roomMatch(r) {
    if (!scopeMatch(r, state.scope)) return false;
    if (state.region !== 'all' && r.unit.region !== state.region) return false;
    return true;
  }

  function renderKpis() {
    var t = totals();
    var wait = waitingHandover();
    var short = shortRooms();
    var shortCost = 0;
    short.forEach(function (r) { shortCost += missingCost(r); });

    $('#f09-kpis').innerHTML = [
      A.kpi({
        label: '在外鑰匙', icon: 'key', value: fmt.num(t.held), unit: '件',
        hint: state.rooms.filter(function (r) { return r.tenant; }).length + ' 戶租客持有，全社區共 ' + fmt.num(t.stock) + ' 件'
      }),
      A.kpi({
        label: '公司保管', icon: 'box', value: fmt.num(t.office), unit: '件',
        hint: '空房與已回收的鑰匙都在辦公室保險箱'
      }),
      A.kpi({
        label: '待點交', icon: 'calendar', value: fmt.num(wait.length), unit: '間',
        kind: wait.length ? 'warn' : 'ok',
        hint: wait.length
          ? wait.map(function (r) { return r.id + ' ' + fmt.date(r.plan.at.slice(0, 10)); }).join('、')
          : '目前沒有待點交的物件'
      }),
      A.kpi({
        label: '短少已賠償', icon: 'shield-check', value: fmt.num(t.missing), unit: '件',
        kind: t.missing ? 'accent' : null,
        hint: t.missing ? '賠償 ' + fmt.money(shortCost) + '，已列入押金扣款' : '目前沒有點交短少的裝置'
      })
    ].join('');
  }

  function renderStock() {
    var t = totals();
    var rows = ITEMS.map(function (k) {
      var b = t.byItem[k.key];
      return { label: b.name, html: '<span class="f09-money">' + fmt.num(b.stock) + '</span>', unit: '件' };
    });
    rows.push({ label: '在外／保管／短少', html: '<span class="f09-money">' + fmt.num(t.held) + ' ／ ' + fmt.num(t.office) + ' ／ ' + fmt.num(t.missing) + '</span>' });
    $('#f09-stock').innerHTML =
      '<div class="card card--static" style="margin-top:20px">' +
        '<div class="card-head"><h2 class="card-title">' + icon('database') + '全社區裝置總量</h2>' +
          A.badge('共 ' + fmt.num(t.stock) + ' 件', 'neutral') + '</div>' +
        '<div class="card-body">' + A.statRow(rows, { divided: true, sm: true }) + '</div>' +
      '</div>';
  }

  function renderAlerts() {
    var out = [];
    var short = shortRooms();
    short.forEach(function (r) {
      out.push(A.alert('', 'accent', {
        title: r.id + ' 點交短少已列入押金扣款',
        html: '<p>' + esc('點交清點' + shortText(r) + '，系統已依租約附件牌價 ' + fmt.money(missingCost(r)) + '加進押金扣款，不用另外追款。') + '</p>',
        action: '<a class="btn btn--secondary btn--sm" href="' + esc(A.link('f04', 'app')) + '">看押金結算</a>'
      }));
    });
    waitingHandover().forEach(function (r) {
      var days = A.daysBetween(D.today, r.plan.at.slice(0, 10));
      out.push(A.alert('', 'warn', {
        title: r.id + ' 還有 ' + days + ' 天就要點交',
        html: '<p>' + esc('點交時間 ' + fmt.dateTime(r.plan.at) + '，' + heldOf(r) + ' 件鑰匙與門禁裝置還在租客手上。點交當天逐項清點，短少的會自動算進押金扣款。') + '</p>',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-go="' + esc(r.id) + '">看這一間</button>'
      }));
    });
    $('#f09-alerts').innerHTML = out.join('');
  }

  function renderTabs() {
    /* 「全部」「出租中」兩個分頁的數量已經寫在下方的「符合條件 N 間」，不重複，讓 5 個分頁排得下 */
    $('#f09-scope-tabs').innerHTML = SCOPES.map(function (s) {
      var label = (s.key === 'all' || s.key === 'held') ? s.label : s.label + ' ' + scopeCount(s.key);
      return '<button type="button" class="tab' + (state.scope === s.key ? ' is-active' : '') + '" role="tab" ' +
        'aria-selected="' + (state.scope === s.key) + '" data-scope="' + s.key + '">' + esc(label) + '</button>';
    }).join('');
  }

  function renderRegion() {
    var opts = [{ v: 'all', l: '全部區域' }].concat(D.company.regions.map(function (r) { return { v: r, l: r }; }));
    $('#f09-region').innerHTML = opts.map(function (o) {
      return '<option value="' + esc(o.v) + '"' + (state.region === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>';
    }).join('');
  }

  function stageBadge(r) {
    if (r.stage === 'done') return A.badge('點交完成', 'ok');
    if (r.stage === 'handover') return A.badge(r.counting ? '清點中' : '待點交', r.counting ? 'accent' : 'warn');
    if (r.stage === 'office') return A.badge('公司保管', 'neutral');
    return A.badge('出租中', 'ok');
  }

  function renderRooms() {
    var list = state.rooms.filter(roomMatch);
    if (!list.length) {
      $('#f09-rooms').innerHTML = A.emptyState({
        sm: true, icon: 'key',
        title: '這個條件下沒有物件',
        text: '換一個分頁或區域看看，「短少」分頁只會列出點交時少交的物件。'
      });
      return;
    }
    $('#f09-rooms').innerHTML =
      '<p class="card-sub f09-count">符合條件 ' + list.length + ' 間</p>' +
      list.map(function (r) {
        var sub = r.tenant ? r.unit.region + ' · 租客 ' + r.tenant.name : r.unit.region + ' · ' + r.unit.type + '（空房）';
        var n = r.stage === 'office' ? officeOf(r) : heldOf(r) - returnedOf(r) - missingOf(r);
        var label = r.stage === 'office' ? '保管 ' + n + ' 件' : '在外 ' + n + ' 件';
        return '<button type="button" class="f09-room' + (r.id === state.selected ? ' is-active' : '') + '" data-room="' + esc(r.id) + '">' +
          '<span class="f09-room-id">' + esc(r.id) + '</span>' +
          '<span class="f09-room-sub">' + esc(sub) + '</span>' +
          '<span class="f09-room-right">' + stageBadge(r) +
            '<span class="f09-room-count">' + esc(label) + '</span></span>' +
          '</button>';
      }).join('');
  }

  /* ---------------------------------------------------------------- 詳情 */
  function headHTML(r) {
    var u = r.unit;
    var sub = [u.region + ' · ' + u.building + ' 棟 ' + u.floor + ' 樓', u.type + ' ' + u.ping + ' 坪'];
    if (r.tenant) {
      sub.push('租客 ' + r.tenant.name + '（' + A.mask(r.tenant.phone, 'phone') + '）');
      sub.push('入住 ' + fmt.date(u.moveIn));
    } else {
      sub.push('空房，鑰匙由公司保管');
      if (EXTRA.custody[r.id]) sub.push(EXTRA.custody[r.id]);
    }
    if (r.plan) sub.push('點交 ' + fmt.dateTime(r.plan.at));
    return '<div class="f09-detail-head">' +
      '<div><div class="f09-detail-title"><h2>' + esc(r.id) + '</h2>' + stageBadge(r) +
        (hasLock(u) ? A.badge('已裝門禁主機', 'accent') : '') + '</div>' +
        '<p class="f09-detail-sub">' + sub.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</p></div>' +
      '</div>';
  }

  function detailAlertHTML(r) {
    if (r.stage === 'done') {
      var m = missingOf(r);
      return A.alert('', 'ok', {
        title: r.id + ' 點交完成',
        html: '<p>' + esc('回收 ' + returnedOf(r) + ' 件' + (m ? '，' + shortText(r) : '') + '。' +
          (m ? '短少依牌價賠償 ' + fmt.money(missingCost(r)) + '已列入押金扣款；' : '') +
          (hasLock(r.unit) ? '大門密碼已失效，遺失的磁扣同步遠端停用。' : '鑰匙已全數歸位辦公室保險箱。')) + '</p>'
      });
    }
    if (r.stage === 'handover') {
      var days = A.daysBetween(D.today, r.plan.at.slice(0, 10));
      if (r.counting) {
        return A.alert('', 'accent', {
          title: '清點中，還有 ' + pendingOf(r) + ' 件沒登記',
          html: '<p>逐項按「收回」或「登記短少」，全部登記完才能完成點交。</p>'
        });
      }
      return A.alert('', 'warn', {
        title: '距離點交還有 ' + days + ' 天',
        html: '<p>' + esc(r.plan.note + '現在共 ' + heldOf(r) + ' 件鑰匙與門禁裝置在租客手上。') + '</p>'
      });
    }
    if (r.stage === 'office') {
      return A.alert('', 'accent', {
        title: '鑰匙全數在公司',
        html: '<p>' + esc((EXTRA.custody[r.id] || '辦公室保險箱') + '，共 ' + officeOf(r) + ' 件。帶看或整備借出時請在系統登記。') + '</p>'
      });
    }
    return '';
  }

  function itemStatus(i, r) {
    if (i.missing > 0) return A.badge('短少 ' + i.missing + ' 件', 'danger');
    if (i.returned > 0 && i.returned >= i.held) return A.badge('已回收', 'ok');
    if (r.stage === 'office') return A.badge('公司保管', 'neutral');
    if (r.counting) return A.badge('待清點 ' + (i.held - i.returned - i.missing) + ' 件', 'warn');
    return A.badge('租客持有', 'accent');
  }

  function itemActions(r, i) {
    if (!r.counting) return '';
    if (!canHandover()) return '<span class="muted small">會計視角不做現場清點</span>';
    var pending = i.held - i.returned - i.missing;
    if (pending <= 0) return '<span class="muted small">已登記</span>';
    return '<span class="f09-row-actions">' +
      '<button type="button" class="btn btn--secondary btn--sm" data-take="' + esc(i.key) + '">收回 ' + pending + ' 件</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-short="' + esc(i.key) + '">登記短少</button>' +
      '</span>';
  }

  function holdCardHTML(r) {
    var cols = [
      {
        label: '項目', primary: true, render: function (i) {
          var m = EXTRA.itemMeta[i.key] || {};
          return '<span class="f09-item-name">' + icon(m.icon || 'key') + esc(i.name) +
            '</span><span class="f09-item-note">' + esc(m.note || '') + '</span>';
        }
      },
      { label: '總數', align: 'num', render: function (i) { return fmt.num(i.total) + ' 件'; } },
      { label: '租客領用', align: 'num', render: function (i) { return i.held ? fmt.num(i.held) + ' 件' : '<span class="muted-2">—</span>'; } },
      { label: '已歸還', align: 'num', render: function (i) { return i.returned ? fmt.num(i.returned) + ' 件' : '<span class="muted-2">—</span>'; } },
      { label: '狀態', render: function (i) { return itemStatus(i, r); } }
    ];
    if (r.counting) cols.push({ label: '清點', align: 'center', render: function (i) { return itemActions(r, i); } });

    var foot = '';
    if (r.stage === 'handover') {
      var hint, btn;
      if (!canHandover()) {
        hint = '會計視角只負責押金退款，現場點交由租務管理員或修繕人員執行。';
        btn = '<button type="button" class="btn btn--primary" disabled>' + icon('clipboard') +
          '<span>' + (r.counting ? '完成點交' : '開始退租點交') + '</span></button>';
      } else if (r.counting) {
        hint = '已登記 ' + (returnedOf(r) + missingOf(r)) + ' ／ ' + heldOf(r) + ' 件' +
          (missingOf(r) ? '，短少賠償 ' + fmt.money(missingCost(r)) : '');
        btn = '<button type="button" class="btn btn--primary" id="f09-finish"' + (pendingOf(r) > 0 ? ' disabled' : '') + '>' +
          icon('check') + '<span>完成點交</span></button>';
      } else {
        hint = '點交當天現場逐項清點，短少的系統會自動算進押金扣款。';
        btn = '<button type="button" class="btn btn--primary" id="f09-start">' + icon('clipboard') +
          '<span>開始退租點交</span></button>';
      }
      foot = '<div class="card-foot f09-handover-foot"><span class="muted">' + esc(hint) + '</span>' + btn + '</div>';
    }

    return '<section class="card card--flush card--static f09-hold">' +
      '<div class="card-head"><h3 class="card-title">' + icon('key') + '鑰匙與門禁清單</h3>' +
        A.badge('共 ' + r.items.reduce(function (n, i) { return n + i.total; }, 0) + ' 件', 'neutral') + '</div>' +
      A.table({
        columns: cols, rows: r.items,
        rowClass: function (i) { return i.missing > 0 ? 'is-short' : ''; },
        empty: { title: '這間沒有登記鑰匙', text: '新物件入庫時先建立鑰匙清單。' }
      }) + foot +
      '</section>';
  }

  function logCardHTML(r) {
    return '<section class="card card--static">' +
      '<div class="card-head"><h3 class="card-title">' + icon('history') + '領用與歸還紀錄</h3></div>' +
      '<div class="card-body">' +
        A.timeline(r.log.slice().reverse(), { emptyTitle: '還沒有領用紀錄', emptyText: '租客入住簽收後就會出現在這裡。' }) +
      '</div></section>';
  }

  function depositCardHTML(r) {
    if (!r.deposit) return '';
    var d = r.deposit;
    var base = d.deductions.filter(function (x) { return x.item.indexOf('磁扣') < 0 && x.item.indexOf('鑰匙') < 0; });
    var rows = base.slice();
    if (r.extraDeduct) rows = rows.concat([r.extraDeduct]);
    else if (r.stage !== 'done') {
      /* 尚未點交：磁扣與鑰匙類扣款還沒發生，不先列出 */
    }
    var total = 0;
    rows.forEach(function (x) { total += x.amount; });
    var refund = d.amount - total;
    var money = function (n) { return canDeposit() ? fmt.money(n) : A.mask(n, 'deposit'); };

    return '<section class="card card--static">' +
      '<div class="card-head"><h3 class="card-title">' + icon('wallet') + '押金連動</h3>' + A.badge(d.status, d.status === '持有中' ? 'neutral' : 'warn') + '</div>' +
      '<div class="card-body">' +
        (canDeposit() ? '' : '<p class="muted small">修繕人員視角看不到押金金額，金額以 •••• 顯示。</p>') +
        '<div class="f09-deduct">' +
          '<div class="f09-deduct-row"><span>押金總額</span><strong class="f09-money">' + esc(money(d.amount)) + '</strong></div>' +
          (rows.length
            ? rows.map(function (x) {
                return '<div class="f09-deduct-row' + (r.extraDeduct === x ? ' is-new' : '') + '"><span>' + esc(x.item) +
                  '<span class="f09-deduct-basis">' + esc(x.basis) + '</span></span>' +
                  '<span class="f09-money">− ' + esc(money(x.amount)) + '</span></div>';
              }).join('')
            : '<div class="f09-deduct-row"><span class="muted">目前沒有扣款項目</span><span class="muted-2">—</span></div>') +
        '</div>' +
        '<div class="f09-deduct-total"><span>應退還租客</span><strong>' + esc(money(refund)) + '</strong></div>' +
        (r.stage === 'handover' && !r.extraDeduct
          ? '<p class="muted small mt-8">點交清點如果有短少，系統會依牌價自動補一筆扣款到這裡。</p>' : '') +
      '</div>' +
      '<div class="card-foot"><a class="btn btn--secondary btn--sm" href="' + esc(A.link('f04', 'app')) + '">' +
        icon('arrow-right') + '<span>到押金管理結算</span></a></div>' +
      '</section>';
  }

  function priceCardHTML() {
    return '<section class="card card--static">' +
      '<div class="card-head"><h3 class="card-title">' + icon('tag') + '短少賠償牌價</h3></div>' +
      '<div class="card-body">' +
        A.statRow(ITEMS.map(function (k) {
          return { label: k.name, value: fmt.money(D.keyPrices[k.key]) };
        }), { divided: true, sm: true }) +
        '<p class="muted small mt-8">牌價寫在租約附件，點交短少時系統照這張表算，租客與同事都不用吵金額。</p>' +
      '</div></section>';
  }

  function renderDetail() {
    var r = current();
    if (!r) { $('#f09-detail').innerHTML = A.emptyState({ title: '請先選一間物件', text: '左邊清單點一下就會顯示鑰匙明細。' }); return; }
    $('#f09-detail').innerHTML =
      headHTML(r) +
      detailAlertHTML(r) +
      holdCardHTML(r) +
      depositCardHTML(r) +
      logCardHTML(r) +
      priceCardHTML();
  }

  /* ---------------------------------------------------------------- 智慧鎖 */
  var FLOW_ICON = ['file-plus', 'lock', 'unlock', 'refresh'];

  function renderLock() {
    var r = current();
    var withLock = r && hasLock(r.unit);
    var nowIdx = !withLock ? -1 : (r.stage === 'done' ? 2 : (r.stage === 'office' ? 3 : (r.stage === 'handover' ? 1 : 1)));
    var pin = r ? pinOf(r.id) : '------';
    var pinOn = !!(r && r.pinActive);

    var status = !withLock
      ? '<p class="muted">' + esc(EXTRA.noLockNote) + '</p>'
      : '<div class="f09-pin">' +
          '<span class="f09-pin-code' + (pinOn ? '' : ' is-dead') + '" id="f09-pin">' + esc(pin) + '</span>' +
          (pinOn ? A.badge('密碼有效', 'ok', { icon: 'lock' }) : A.badge('密碼已失效', 'neutral', { icon: 'unlock' })) +
          (r.pinKilledAt ? '<span class="muted small">' + esc(fmt.date(r.pinKilledAt) + ' 自動失效') + '</span>' : '') +
        '</div>';

    $('#f09-lock').innerHTML =
      '<div class="f09-lock-top">' +
        '<div><h2 id="f09-lock-title">智慧鎖：入住自動產生密碼，退租自動失效</h2>' +
          '<p>' + esc(EXTRA.lockNote) + '目前 ' + lockUnits() + ' 間已啟用。</p></div>' +
        '<div>' + status + '</div>' +
      '</div>' +
      '<div class="f09-flow">' +
        D.smartLockFlow.map(function (s, i) {
          return '<div class="f09-flow-step' + (i === nowIdx ? ' is-now' : '') + '">' +
            '<span class="icon-circle icon-circle--neutral">' + icon(FLOW_ICON[i] || 'lock') + '</span>' +
            '<span class="f09-flow-no">第 ' + (i + 1) + ' 步</span>' +
            '<h4>' + esc(s.step) + '</h4><p>' + esc(s.text) + '</p></div>';
        }).join('') +
      '</div>';
  }

  function renderAll() {
    renderKpis(); renderStock(); renderAlerts(); renderTabs(); renderRegion(); renderRooms(); renderDetail(); renderLock();
  }

  /* ================================================================
   * 4. 互動
   * ================================================================ */
  function select(id) {
    if (!room(id)) return;
    state.selected = id;
    renderRooms(); renderDetail(); renderLock();
    var main = document.getElementById('f09-detail');
    if (main && window.innerWidth <= 1024) main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startCount(r) {
    if (!canHandover()) { A.toast('這個視角不能執行現場點交', 'warn'); return; }
    r.counting = true;
    A.toast('已開始 ' + r.id + ' 的退租點交', 'ok', { sub: '逐項按「收回」或「登記短少」' });
    renderAll();
  }

  function takeBack(r, key) {
    if (!canHandover()) { A.toast('這個視角不能執行現場點交', 'warn'); return; }
    var it = null;
    r.items.forEach(function (i) { if (i.key === key) it = i; });
    if (!it) return;
    var n = it.held - it.returned - it.missing;
    if (n <= 0) return;
    it.returned += n;
    r.log.push({ at: handoverDate(r), title: '回收' + it.name + ' ' + n + ' 件', text: '點交清點，租客當場交回', kind: 'ok', by: A.roleName() });
    A.toast('已收回' + it.name + ' ' + n + ' 件', 'ok');
    renderAll();
  }

  function markShort(r, key) {
    if (!canHandover()) { A.toast('這個視角不能執行現場點交', 'warn'); return; }
    var it = null;
    r.items.forEach(function (i) { if (i.key === key) it = i; });
    if (!it) return;
    var pending = it.held - it.returned - it.missing;
    if (pending <= 0) return;
    A.confirm({
      title: '登記' + it.name + '短少 1 件',
      body: '<p>' + esc('租客沒有交回 1 件' + it.name + '。系統會依牌價 ' + fmt.money(it.price) + '算進押金扣款，並在點交單附上清點紀錄。') + '</p>',
      confirmLabel: '登記短少 1 件',
      kind: 'danger'
    }).then(function (ok) {
      if (!ok) return;
      it.missing += 1;
      r.log.push({ at: handoverDate(r), title: it.name + '短少 1 件', text: '點交清點未交回，賠償 ' + fmt.money(it.price), kind: 'danger', by: A.roleName() });
      A.toast('已登記' + it.name + '短少 1 件', 'warn', { sub: '賠償 ' + fmt.money(it.price) + '會加進押金扣款' });
      renderAll();
    });
  }

  function finish(r) {
    if (!canHandover()) { A.toast('這個視角不能執行現場點交', 'warn'); return; }
    if (pendingOf(r) > 0) { A.toast('還有 ' + pendingOf(r) + ' 件沒登記', 'warn'); return; }
    var m = missingOf(r);
    var cost = missingCost(r);
    var names = shortText(r);
    var refund = r.deposit ? r.deposit.amount - depositBase(r) - cost : 0;

    var body = '<p>' + esc('回收 ' + returnedOf(r) + ' 件') + (m ? esc('，' + names) : '') + '。</p>' +
      (m ? '<p>' + esc('短少依牌價賠償 ' + fmt.money(cost) + '，會自動加進押金扣款。') + '</p>' : '') +
      (r.deposit && canDeposit() ? '<p>' + esc('押金 ' + fmt.money(r.deposit.amount) + '，扣款後應退還 ' + fmt.money(refund) + '。') + '</p>' : '') +
      (hasLock(r.unit) ? '<p>大門密碼會在點交當天自動失效' + (m ? '，沒交回的磁扣同步遠端停用' : '') + '。</p>' : '');

    A.confirm({
      title: '完成 ' + r.id + ' 退租點交',
      body: body,
      confirmLabel: '完成點交',
      kind: 'primary'
    }).then(function (ok) {
      if (!ok) return;
      r.counting = false;
      r.stage = 'done';
      if (m && r.deposit) {
        r.extraDeduct = { item: names, amount: cost, basis: '點交清點 ' + fmt.date(handoverDate(r)) + '，依租約附件牌價' };
        r.log.push({ at: handoverDate(r), title: '短少賠償 ' + fmt.money(cost) + '列入押金扣款', text: '押金應退還 ' + fmt.money(refund), kind: 'warn' });
      }
      if (hasLock(r.unit)) {
        r.pinActive = false;
        r.pinKilledAt = handoverDate(r);
        r.log.push({ at: r.pinKilledAt, title: '大門密碼自動失效', text: m ? '沒交回的磁扣已遠端停用，不必換鎖' : '不必回收密碼、不必換鎖', kind: 'ok' });
      }
      r.plan = null;
      renderAll();
      A.toast(r.id + ' 點交完成', 'ok', {
        sub: m ? names + '，賠償 ' + fmt.money(cost) + '已列入押金扣款' : '鑰匙全數回收，已歸位保險箱'
      });
    });
  }

  function depositBase(r) {
    if (!r.deposit) return 0;
    var n = 0;
    r.deposit.deductions.forEach(function (x) {
      if (x.item.indexOf('磁扣') < 0 && x.item.indexOf('鑰匙') < 0) n += x.amount;
    });
    return n;
  }

  function openLockGuide() {
    A.modal({
      title: '智慧鎖怎麼運作',
      size: 'lg',
      body: '<p class="muted">' + esc(EXTRA.lockNote) + '</p>' +
        A.timeline(D.smartLockFlow.map(function (s, i) {
          return { title: '第 ' + (i + 1) + ' 步：' + s.step, text: s.text, kind: i === 3 ? 'ok' : 'accent' };
        })) +
        '<p class="muted small mt-8">' + esc('尚未換裝的 C、D、E 棟照舊回收實體鑰匙，兩種做法在同一張清單上管理。') + '</p>',
      actions: [{ label: '知道了', kind: 'primary' }]
    });
  }

  /* ---------------------------------------------------------------- 事件 */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var roomBtn = t.closest('[data-room]');
    if (roomBtn) { select(roomBtn.getAttribute('data-room')); return; }

    var go = t.closest('[data-go]');
    if (go) { select(go.getAttribute('data-go')); return; }

    var tab = t.closest('#f09-scope-tabs .tab');
    if (tab) {
      state.scope = tab.getAttribute('data-scope');
      renderTabs(); renderRooms();
      return;
    }

    if (t.closest('#f09-lock-guide')) { openLockGuide(); return; }
    if (t.closest('#f09-start')) { startCount(current()); return; }
    if (t.closest('#f09-finish')) { finish(current()); return; }

    var take = t.closest('[data-take]');
    if (take) { takeBack(current(), take.getAttribute('data-take')); return; }

    var short = t.closest('[data-short]');
    if (short) { markShort(current(), short.getAttribute('data-short')); return; }
  });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'f09-region') {
      state.region = e.target.value;
      renderRooms();
    }
  });

  A.onRole(function () { renderAll(); });

  renderAll();
  A.reveal();
})();
