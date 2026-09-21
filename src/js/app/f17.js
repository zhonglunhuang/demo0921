/* f17.js — 自動產生文件（f17）操作頁邏輯。
 * 契約：docs/DESIGN.md §3（app 外殼、共用元件）、票 DEMO-02 需求 #17。
 * 只讀 window.DB，不改 data.js／common.js；基礎層沒有的設定與規則放在 EXTRA。
 * 流程：選文件類型 → 選租客與物件 → 產生文件 → 下載 PDF／以 LINE 傳送 → 進文件歷史。 */
(function () {
  'use strict';

  var A = window.App, D = window.DB;
  if (!A || !D) return;
  var esc = A.esc, fmt = A.fmt, icon = A.icon;

  /* ------------------------------------------------------------------ EXTRA：本功能自有的規則與設定 */
  var EXTRA = {
    payDay: 5,                       /* 下游租金每月 5 日前繳（公司收款規則） */
    renewMonths: 12,                 /* 續約一次一年 */
    adjustRate: 0.03,                /* 租金調整通知的示範調幅，未超過上游條款的 5% 上限 */
    dueDays: 3,                      /* 催繳通知給的繳納期限 */
    handoverTime: '上午 10:00',
    warrantyMonths: 3,               /* 修繕保固 */
    maxRows: 10,                     /* 租客清單一次顯示幾列 */
    keyUnit: { key: '把', card: '張', remote: '支', mailbox: '把' },
    typeIcon: {
      lease: 'doc', renew: 'refresh', adjust: 'dollar', dun: 'bell',
      moveout: 'logout', handover: 'clipboard', deposit: 'wallet', repair: 'wrench'
    },
    featured: ['A01', 'B11', 'E07', 'B15', 'E03', 'D11', 'C20', 'A07', 'B02']
  };

  /* ------------------------------------------------------------------ 小工具 */
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function addMonths(iso, n) {
    var d = A.parseDate(iso);
    if (!d) return '';
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return toISO(d);
  }
  function range(a, b) { return fmt.date(a) + ' 至 ' + fmt.date(b); }
  function money(n, perm) { return fmt.money(perm ? A.mask(n, perm) : n); }
  function nowTime() {                                  /* 只取時鐘的時分，日期一律用 DB.today */
    var d = new Date();
    return p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function addrOf(u) {
    var b = D.company.buildings[u.building];
    return (b ? b.address + ' ' : '') + u.id + ' 室';
  }
  function tenantNameOf(u) {
    var t = D.tenantOf(u.id);
    if (t) return t.name;
    var dep = settledDeposit(u.id);
    return dep ? dep.tenantName : '';
  }
  function depositFor(unitId) {
    var order = { '逾期未結算': 0, '結算中': 1, '已退還': 2, '持有中': 3 };
    var list = D.deposits.filter(function (d) { return d.unitId === unitId; }).slice();
    list.sort(function (a, b) {
      var x = order[a.status] === undefined ? 9 : order[a.status];
      var y = order[b.status] === undefined ? 9 : order[b.status];
      return x - y;
    });
    return list[0] || null;
  }
  function settledDeposit(unitId) {
    var d = depositFor(unitId);
    return d && d.status !== '持有中' ? d : null;
  }
  function repairOf(unitId) {
    var list = D.workOrders.filter(function (w) {
      return w.unitId === unitId && (w.status === '完成' || w.status === '待付款');
    }).slice();
    list.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    return list[0] || null;
  }
  function ctxOf(unitId) {
    var u = D.unit(unitId);
    if (!u) return null;
    return {
      unit: u,
      tenant: D.tenantOf(unitId),
      deposit: depositFor(unitId),
      settled: settledDeposit(unitId),
      order: repairOf(unitId),
      utility: D.utilityOf(unitId)
    };
  }
  function f(label, value, src, wide) {
    return { label: label, value: value, src: src, wide: !!wide };
  }

  /* ------------------------------------------------------------------ 8 種文件的適用條件與欄位帶入規則 */
  var TYPES = {
    lease: {
      fix: 'A01',
      need: function (c) { return c.tenant ? null : '這間目前沒有租客，租賃契約要先有簽約對象。'; },
      fields: function (c) {
        var u = c.unit, d = u.downstream;
        return [
          f('租客姓名', c.tenant.name, '租客資料'),
          f('身分證字號', A.mask(c.tenant.idNo, 'idNo'), '租客資料'),
          f('物件地址', addrOf(u), '物件資料', true),
          f('租期', range(d.start, d.end), '下游租約'),
          f('月租金', money(u.rent, 'rent'), '下游租約'),
          f('押金', money(d.deposit, 'deposit'), '下游租約'),
          f('付款日', '每月 ' + EXTRA.payDay + ' 日前', '公司收款規則')
        ];
      },
      note: function (c) {
        return '修繕責任依上游租約：' + c.unit.upstream.repairResp + '。房屋稅由' + c.unit.upstream.taxBy +
          '負擔、管理費由' + c.unit.upstream.mgmtFeeBy + '負擔、水電由' + c.unit.upstream.utilitiesBy + '負擔。';
      }
    },
    renew: {
      fix: 'A01',
      need: function (c) {
        if (!c.tenant) return '這間目前沒有租客，續約書要先有在租的租客。';
        if (c.unit.status === 'leaving') return '這位租客已通知不續租，續約書不適用。';
        return null;
      },
      fields: function (c) {
        var u = c.unit, d = u.downstream;
        var newStart = A.addDays(d.end, 1);
        var newEnd = A.addDays(addMonths(newStart, EXTRA.renewMonths), -1);
        return [
          f('租客姓名', c.tenant.name, '租客資料'),
          f('物件地址', addrOf(u), '物件資料', true),
          f('原租期', range(d.start, d.end), '下游租約'),
          f('新租期', range(newStart, newEnd), '系統自動推算'),
          f('新月租金', money(u.rent, 'rent'), '下游租約'),
          f('調整幅度', '0 元（維持原租金）', '續約條件')
        ];
      },
      note: function (c) {
        return '上游租約調租條款：' + c.unit.upstream.adjustClause + '。本次續約維持原租金，日後要調整再另發租金調整通知。';
      }
    },
    adjust: {
      fix: 'A01',
      need: function (c) { return c.tenant ? null : '這間目前沒有租客，租金調整通知要先有在租的租客。'; },
      fields: function (c) {
        var u = c.unit;
        var next = Math.round(u.rent * (1 + EXTRA.adjustRate) / 100) * 100;
        return [
          f('租客姓名', c.tenant.name, '租客資料'),
          f('物件地址', addrOf(u), '物件資料', true),
          f('原租金', money(u.rent, 'rent'), '下游租約'),
          f('新租金', money(next, 'rent'), '行情試算'),
          f('生效日', fmt.date(A.addDays(u.downstream.end, 1)), '系統自動推算'),
          f('調整依據', '周邊同型物件行情與上游租約調租條款', '上游租約', true)
        ];
      },
      note: function (c) {
        var u = c.unit;
        var next = Math.round(u.rent * (1 + EXTRA.adjustRate) / 100) * 100;
        return '調幅 ' + fmt.pct((next - u.rent) / u.rent) + '，未超過上游租約 5% 的上限；生效日與新租期同一天開始。';
      }
    },
    dun: {
      fix: 'B11',
      need: function (c) {
        if (!c.tenant) return '這間目前沒有租客，沒有要催的款項。';
        if (c.tenant.paid === '已繳') return '這位租客本月已繳，沒有要催的款項。';
        return null;
      },
      fields: function (c) {
        var u = c.unit, t = c.tenant;
        var due = A.today.slice(0, 8) + p2(EXTRA.payDay);
        var overdue = t.arrearsDays > 0 ? t.arrearsDays : Math.max(0, A.daysBetween(due, A.today));
        var amount = t.arrearsAmount > 0 ? t.arrearsAmount : t.rent;
        return [
          f('租客姓名', t.name, '租客資料'),
          f('物件地址', addrOf(u), '物件資料', true),
          f('欠繳月份', A.today.slice(0, 4) + ' 年 ' + Number(A.today.slice(5, 7)) + ' 月', '帳款紀錄'),
          f('欠繳金額', money(amount, 'rent'), '帳款紀錄'),
          f('逾期天數', fmt.days(overdue), '帳款紀錄'),
          f('繳納期限', fmt.date(A.addDays(A.today, EXTRA.dueDays)), '系統自動推算')
        ];
      },
      note: function (c) {
        var sent = D.notifications.filter(function (n) { return n.unitId === c.unit.id && n.type === '催租'; });
        if (!sent.length) return '這是第 1 次催繳通知，送出後系統會記錄送達與回覆時間。';
        var last = sent[sent.length - 1];
        return '已發出 ' + sent.length + ' 次催繳通知，最近一次 ' + fmt.dateTime(last.sentAt) + '；再無回應會依通知升級機制交管理員處理。';
      }
    },
    moveout: {
      fix: 'B15',
      need: function (c) {
        if (c.unit.status !== 'leaving') return '這間目前不是即將空房，退租確認書要在租客通知不續租後才用得到。';
        return null;
      },
      fields: function (c) {
        var u = c.unit, dep = c.deposit || {};
        var refund = dep.refundAmount != null ? dep.refundAmount : dep.expectedRefund;
        return [
          f('租客姓名', tenantNameOf(u), '租客資料'),
          f('物件地址', addrOf(u), '物件資料', true),
          f('退租日', fmt.date(u.moveOut), '退租通知'),
          f('點交時間', fmt.date(u.moveOut) + ' ' + EXTRA.handoverTime, '點交排程'),
          f('應退押金', money(refund, 'deposit'), '押金紀錄')
        ];
      },
      note: function (c) {
        var dep = c.deposit || { deductions: [] };
        var n = (dep.deductions || []).length;
        if (!n) return '目前沒有扣款項目，點交後如有缺損會自動補進押金結算單。';
        return '扣款項目 ' + n + ' 項、共 ' + fmt.money(dep.deductTotal) + '，由退租整備與點交紀錄自動帶入。';
      }
    },
    handover: {
      fix: 'B15',
      need: function (c) {
        if (['leaving', 'prep', 'listing'].indexOf(c.unit.status) < 0) return '這間還在出租中，點交表要到退租或重新入住時才用得到。';
        return null;
      },
      fields: function (c) {
        var u = c.unit;
        var rows = c.utility && c.utility.rows ? c.utility.rows : [];
        var last = rows[rows.length - 1] || { elec: null, water: null };
        var keys = D.keySummary(u.id).map(function (k) {
          return k.item + ' ' + k.total + ' ' + (EXTRA.keyUnit[k.itemKey] || '份');
        }).join('、');
        var eq = D.equipmentOf(u.id).map(function (e) { return e.kind + '（' + e.brand + '）'; }).join('、');
        var short = D.keyShortages.filter(function (s) { return s.unitId === u.id; }).map(function (s) {
          return s.item + '短少 ' + s.missing + ' ' + (EXTRA.keyUnit[s.itemKey] || '份') + '，已列入押金扣款';
        }).join('、');
        return [
          f('物件地址', addrOf(u), '物件資料', true),
          f('點交日期', fmt.date(u.moveOut || A.today), '點交排程'),
          f('電表度數', last.elec != null ? fmt.num(last.elec) + ' 度' : '點交當日抄錄', '水電度數'),
          f('水表度數', last.water != null ? fmt.num(last.water) + ' 度' : '點交當日抄錄', '水電度數'),
          f('鑰匙數量', keys || '無', '鑰匙紀錄', true),
          f('設備清單', eq || '無', '設備履歷', true),
          f('缺損紀錄', short || '無', '點交清點', true)
        ];
      },
      note: function () {
        return '點交當天現場核對後簽名，缺損與短少會自動帶進押金結算單，不必再打一次。';
      }
    },
    deposit: {
      fix: 'D11',
      need: function (c) {
        if (!c.settled) return '這間的押金還在持有中，要開始結算後才會有押金結算單。';
        return null;
      },
      fields: function (c) {
        var dep = c.settled;
        var refund = dep.refundAmount != null ? dep.refundAmount : dep.expectedRefund;
        var items = (dep.deductions || []).map(function (x) { return x.item + ' ' + fmt.money(x.amount); }).join('、');
        return [
          f('租客姓名', dep.tenantName, '押金紀錄'),
          f('物件地址', addrOf(c.unit), '物件資料', true),
          f('押金金額', money(dep.amount, 'deposit'), '押金紀錄'),
          f('扣除項目', items || '無', '退租整備與點交', true),
          f('應退金額', money(refund, 'deposit'), '系統自動試算'),
          f('退款日期', dep.refundAt ? fmt.date(dep.refundAt) : '結算確認後 7 日內', '押金紀錄')
        ];
      },
      note: function (c) {
        var dep = c.settled;
        var basis = (dep.deductions || []).map(function (x) { return x.item + '（' + x.basis + '）'; }).join('、');
        return basis ? '每筆扣款都附依據：' + basis + '。' : '本次沒有扣款，押金全額退還。';
      }
    },
    repair: {
      fix: 'A07',
      need: function (c) { return c.order ? null : '這間目前沒有完成的修繕工單，修繕確認書要等施工完成才用得到。'; },
      fields: function (c) {
        var w = c.order;
        var v = D.vendorById(w.vendorId);
        var done = w.completedAt || w.createdAt;
        return [
          f('物件地址', addrOf(c.unit), '物件資料', true),
          f('修繕項目', w.item + '（工單 ' + w.id + '）', '修繕工單'),
          f('廠商名稱', v ? v.name : '尚未指定', '廠商資料'),
          f('施工日期', fmt.date(done), '修繕工單'),
          f('金額', money(w.quote, 'repairCost'), '修繕工單'),
          f('保固期間', range(done, addMonths(done, EXTRA.warrantyMonths)), '公司保固規則')
        ];
      },
      note: function (c) {
        var w = c.order;
        if (!w.marketAvg) return '保固期內同一項目再故障不另收費。';
        return '本次報價 ' + fmt.money(w.quote) + '，同項目市場平均 ' + fmt.money(w.marketAvg) + '；保固期內再故障不另收費。';
      }
    }
  };

  var ROLE_TYPES = { maintenance: ['handover', 'repair'] };

  /* ------------------------------------------------------------------ 狀態 */
  var docs = D.docHistory.map(function (h) {
    return {
      id: h.id, type: h.type, typeName: h.typeName, unitId: h.unitId, tenantName: h.tenantName,
      createdAt: h.createdAt, by: h.by, sentVia: h.sentVia, signed: h.signed
    };
  });
  var seq = 1182;                                   /* DB.docHistory 最大編號，之後往上加 */

  var state = {
    typeId: 'renew',
    unitId: 'A01',
    query: '',
    building: 'all',
    scope: 'fit',
    historyScope: 'all',
    docId: null,
    sent: false
  };

  function docType(id) {
    return D.docTypes.filter(function (t) { return t.id === id; })[0];
  }
  function allowedTypes() {
    return ROLE_TYPES[A.role] || D.docTypes.map(function (t) { return t.id; });
  }
  function typeAllowed(id) { return allowedTypes().indexOf(id) >= 0; }
  function reasonFor(typeId, unitId) {
    var c = ctxOf(unitId);
    if (!c) return '找不到這間物件。';
    return TYPES[typeId].need(c);
  }
  function fits(typeId, unitId) { return !reasonFor(typeId, unitId); }
  function currentFields() {
    var c = ctxOf(state.unitId);
    return TYPES[state.typeId].fields(c);
  }
  function operatorName() {
    var s = D.staff.filter(function (x) { return x.role === A.role; })[0];
    return s ? s.name : '陳○○';
  }

  /* ------------------------------------------------------------------ KPI */
  function monthPrefix() { return A.today.slice(0, 7); }
  function renderKpis() {
    var host = document.getElementById('f17-kpis');
    if (!host) return;
    var thisMonth = docs.filter(function (d) { return String(d.createdAt).slice(0, 7) === monthPrefix(); }).length;
    var waiting = docs.filter(function (d) { return d.sentVia && !d.signed; }).length;
    var fields = D.docTypes.reduce(function (n, t) { return n + t.fields.length; }, 0);
    host.innerHTML =
      A.kpi({ label: '文件範本', value: D.docTypes.length, unit: ' 種', icon: 'doc', hint: '選一種就自動帶欄位' }) +
      A.kpi({ label: '本月已產生', value: thisMonth, unit: ' 份', icon: 'file-plus', hint: fmt.month(monthPrefix()) + ' 的文件' }) +
      A.kpi({ label: '自動帶入欄位', value: fields, unit: ' 個', icon: 'sparkles', hint: '8 種文件加起來原本要手打的欄位' }) +
      A.kpi({ label: '待租客簽回', value: waiting, unit: ' 份', icon: 'clock', kind: waiting ? 'warn' : 'ok', hint: waiting ? '已送出但還沒簽回' : '全部都簽回了' });
  }

  /* ------------------------------------------------------------------ 第 1 步：文件類型 */
  function renderRoleNote() {
    var host = document.getElementById('f17-role-note');
    if (!host) return;
    if (A.role === 'maintenance') {
      host.innerHTML = A.alert('修繕人員看不到租金與押金，只能產生點交表與修繕確認書。', 'accent', { icon: 'lock' });
    } else if (!A.can(A.role, 'idNo')) {
      host.innerHTML = A.alert('目前角色看不到身分證字號，文件裡這一欄會自動遮蔽。', 'accent', { icon: 'lock' });
    } else {
      host.innerHTML = '';
    }
  }
  function renderTypes() {
    var host = document.getElementById('f17-types');
    if (!host) return;
    host.innerHTML = D.docTypes.map(function (t) {
      var on = t.id === state.typeId;
      var ok = typeAllowed(t.id);
      return '<button type="button" class="f17-type' + (on ? ' is-selected' : '') + '" data-type="' + esc(t.id) + '"' +
        (ok ? '' : ' disabled') + ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="icon-circle' + (on ? '' : ' icon-circle--neutral') + '">' + icon(EXTRA.typeIcon[t.id] || 'doc') + '</span>' +
        '<span class="f17-type__name">' + esc(t.name) + '</span>' +
        '<span class="f17-type__meta"><span class="hide-mobile">' + t.fields.length + ' 個欄位自動帶入</span>' +
        '<span class="hide-desktop">' + t.fields.length + ' 欄自動帶入</span></span>' +
        '<span class="f17-type__check">' + icon('check') + '</span>' +
        '</button>';
    }).join('');
  }

  /* ------------------------------------------------------------------ 第 2 步：租客與物件 */
  function buildingOptions() {
    var sel = document.getElementById('f17-building');
    if (!sel) return;
    var codes = Object.keys(D.company.buildings);
    sel.innerHTML = '<option value="all">全部棟別</option>' + codes.map(function (c) {
      var b = D.company.buildings[c];
      return '<option value="' + esc(c) + '">' + esc(b.name + '（' + b.region + '）') + '</option>';
    }).join('');
    sel.value = state.building;
  }
  function matchedUnits() {
    var q = state.query.trim().toLowerCase();
    var list = D.units.filter(function (u) {
      if (state.building !== 'all' && u.building !== state.building) return false;
      if (state.scope === 'fit' && !fits(state.typeId, u.id)) return false;
      if (q) {
        var name = tenantNameOf(u).toLowerCase();
        if (u.id.toLowerCase().indexOf(q) < 0 && name.indexOf(q) < 0) return false;
      }
      return true;
    });
    list.sort(function (a, b) {
      var x = EXTRA.featured.indexOf(a.id), y = EXTRA.featured.indexOf(b.id);
      if (x < 0) x = 99;
      if (y < 0) y = 99;
      if (x !== y) return x - y;
      return a.id < b.id ? -1 : 1;
    });
    return list;
  }
  function statusBadge(u) {
    var t = D.tenantOf(u.id);
    var out = [];
    if (t && t.paid === '逾期') out.push(A.badge('租金逾期 ' + t.arrearsDays + ' 天', 'danger'));
    else if (t && t.paid === '未繳') out.push(A.badge('本月未繳', 'warn'));
    var dep = settledDeposit(u.id);
    if (dep && dep.status === '逾期未結算') out.push(A.badge('押金逾期未結算', 'danger'));
    if (!out.length) out.push(A.badge(D.statusName(u.status), u.status === 'rented' ? 'ok' : (u.status === 'leaving' ? 'warn' : 'neutral')));
    return out.slice(0, 2).join(' ');
  }
  function renderTenants() {
    var host = document.getElementById('f17-tenants');
    if (!host) return;
    var all = matchedUnits();
    var rows = all.slice(0, EXTRA.maxRows);
    var count = document.getElementById('f17-tenant-count');
    if (count) count.textContent = '符合 ' + fmt.num(all.length) + ' 間';

    host.innerHTML = A.table({
      id: 'f17-tenant-table',
      rows: rows,
      rowClass: function (u) { return 'is-clickable' + (u.id === state.unitId ? ' is-selected' : ''); },
      rowAttrs: function (u) { return 'data-unit="' + esc(u.id) + '"'; },
      empty: { title: '找不到符合的物件', text: '換一個關鍵字，或把篩選改成「全部物件」。', icon: 'search' },
      columns: [
        {
          label: '物件', primary: true, render: function (u) {
            var b = D.company.buildings[u.building];
            return '<span class="cell-strong">' + esc(u.id) + '</span><span class="cell-sub">' + esc((b ? b.name : '') + ' ' + u.floor + ' 樓 ' + u.type) + '</span>';
          }
        },
        {
          label: '租客', render: function (u) {
            var name = tenantNameOf(u);
            return name ? esc(name) : '<span class="muted-2">目前無租客</span>';
          }
        },
        {
          label: '租約到期', render: function (u) {
            return u.tenantId ? fmt.date(u.downstream.end) : '<span class="muted-2">—</span>';
          }
        },
        {
          label: '月租', align: 'num', render: function (u) {
            return u.tenantId ? esc(money(u.rent, 'rent')) : '<span class="muted-2">—</span>';
          }
        },
        { label: '狀態', render: function (u) { return statusBadge(u); } },
        {
          label: '動作', align: 'center', noLabel: true, render: function (u) {
            if (u.id === state.unitId) return A.badge('已選取', 'accent', { icon: 'check' });
            return '<button type="button" class="btn btn--secondary btn--sm" data-unit-pick="' + esc(u.id) + '">選這間</button>';
          }
        }
      ]
    }) + (all.length > rows.length
      ? '<p class="small muted-2 mt-8">顯示前 ' + rows.length + ' 間，共 ' + fmt.num(all.length) + ' 間。用上方搜尋縮小範圍。</p>'
      : '');
  }

  /* ------------------------------------------------------------------ 第 3 步：預覽與送出 */
  function fieldHTML(x) {
    var masked = typeof x.value === 'string' && x.value.indexOf('••••') === 0;
    return '<div class="f17-field' + (x.wide ? ' f17-field--wide' : '') + (masked ? ' f17-field--manual' : '') + '">' +
      '<div class="f17-field__label">' + esc(x.label) + '</div>' +
      '<div class="f17-field__value" data-field="' + esc(x.label) + '">' + esc(x.value) + '</div>' +
      '<div class="f17-field__src">' + icon(masked ? 'lock' : 'sparkles') + esc(masked ? '依角色遮蔽' : '自動帶入・' + x.src) + '</div>' +
      '</div>';
  }
  function docHTML() {
    var t = docType(state.typeId);
    var c = ctxOf(state.unitId);
    var fields = currentFields();
    var metaParts = [
      state.docId ? '文件編號 ' + state.docId : '尚未建檔',
      '產生日期 ' + fmt.date(A.today),
      '製作人 ' + operatorName()
    ];
    var meta = metaParts.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('');
    return '<article class="f17-doc" aria-label="' + esc(t.name) + '預覽">' +
      '<header class="f17-doc__head">' +
        '<div class="f17-doc__org">' + esc(D.company.name) + '</div>' +
        '<h3 class="f17-doc__title">' + esc(t.name) + '</h3>' +
        '<p class="f17-doc__meta">' + meta + '</p>' +
      '</header>' +
      '<div class="f17-fields">' + fields.map(fieldHTML).join('') + '</div>' +
      '<p class="f17-doc__note">' + esc(TYPES[state.typeId].note(c)) + '</p>' +
      '<div class="f17-doc__sign"><span>出租方：' + esc(D.company.name) + '</span><span>承租方簽名</span></div>' +
      '</article>';
  }
  function sendPanelHTML() {
    var t = docType(state.typeId);
    var fields = currentFields();
    var manual = fields.filter(function (x) { return !x.value || x.value === '—'; }).length;
    var doc = state.docId ? docs.filter(function (d) { return d.id === state.docId; })[0] : null;
    var status = !doc ? A.badge('尚未建檔', 'neutral')
      : (doc.sentVia ? A.badge('待租客簽回', 'warn') : A.badge('待傳送', 'accent'));
    var hint = !doc
      ? '按上方「產生文件」建檔，之後就能下載或用 LINE 傳給租客。'
      : (doc.sentVia
        ? '已用 LINE 傳給' + esc(doc.tenantName || '租客') + '，簽回後狀態會自動變成已簽回。'
        : '文件已建檔，可以下載 PDF 或用 LINE 傳給租客。');
    var disabled = doc ? '' : ' disabled';
    return '<div class="f17-send stack">' +
      A.statRow([
        { label: '自動帶入', value: fields.length, unit: '欄' },
        { label: '要手打', value: manual, unit: '欄' }
      ], { divided: true }) +
      '<div class="row row--between"><span class="small muted">目前狀態</span>' + status + '</div>' +
      '<button type="button" class="btn btn--secondary" data-act="download"' + disabled + '>' + icon('download') + '下載 PDF</button>' +
      '<button type="button" class="btn btn--secondary" data-act="send"' + disabled + '>' + icon('send') + '以 LINE 傳送</button>' +
      '<p class="f17-send__hint">' + hint + '</p>' +
      '<p class="f17-send__hint">提案示範畫面，不會真的產生檔案或送出。</p>' +
      '</div>';
  }
  function previewHTML() {
    var why = reasonFor(state.typeId, state.unitId);
    var t = docType(state.typeId);
    if (why) {
      var fix = TYPES[state.typeId].fix;
      var fixUnit = D.unit(fix);
      var fixName = fixUnit ? tenantNameOf(fixUnit) : '';
      return A.alert(why, 'warn', {
        title: t.name + '不適用 ' + state.unitId,
        action: '<button type="button" class="btn btn--secondary btn--sm" data-fix="' + esc(fix) + '">改選 ' + esc(fix + (fixName ? ' ' + fixName : '')) + '</button>'
      }) + A.emptyState({
        icon: 'file',
        title: '還沒有可以預覽的內容',
        text: '換一間適用的物件，或在上面改選其他文件類型。'
      });
    }
    return '<div class="f17-preview">' + docHTML() + sendPanelHTML() + '</div>';
  }
  function setPreviewBadge() {
    var el = document.getElementById('f17-preview-state');
    if (!el) return;
    var doc = state.docId ? docs.filter(function (d) { return d.id === state.docId; })[0] : null;
    if (doc && doc.sentVia) { el.className = 'badge badge--ok'; el.textContent = '已傳送'; }
    else if (doc) { el.className = 'badge badge--ok'; el.textContent = '已產生'; }
    else if (reasonFor(state.typeId, state.unitId)) { el.className = 'badge badge--warn'; el.textContent = '不適用'; }
    else { el.className = 'badge badge--accent'; el.textContent = '預覽'; }
  }
  function renderPreview() {
    var host = document.getElementById('f17-preview');
    if (!host) return;
    host.innerHTML = previewHTML();
    setPreviewBadge();
    updateGenerateBtn();
  }
  function updateGenerateBtn() {
    var btn = document.getElementById('f17-generate');
    if (!btn) return;
    var blocked = !!reasonFor(state.typeId, state.unitId);
    var done = !!state.docId;
    btn.disabled = blocked || done;
    btn.textContent = done ? '已產生文件' : '產生文件';
  }

  /* ------------------------------------------------------------------ 文件歷史 */
  function renderHistoryScope() {
    var host = document.getElementById('f17-history-scope');
    if (!host) return;
    var u = D.unit(state.unitId);
    var name = u ? tenantNameOf(u) : '';
    host.innerHTML = [
      { id: 'all', label: '全部' },
      { id: 'unit', label: '只看 ' + state.unitId + (name ? ' ' + name : '') }
    ].map(function (it) {
      var on = it.id === state.historyScope;
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-history="' + it.id + '">' + esc(it.label) + '</button>';
    }).join('');
  }
  function renderHistory() {
    var host = document.getElementById('f17-history');
    if (!host) return;
    renderHistoryScope();
    var rows = docs.filter(function (d) {
      return state.historyScope === 'all' || d.unitId === state.unitId;
    });
    host.innerHTML = A.table({
      id: 'f17-history-table',
      rows: rows,
      empty: {
        title: '這間還沒有產生過文件',
        text: '選好文件類型後按「產生文件」，紀錄就會留在這裡。',
        icon: 'file'
      },
      columns: [
        { label: '文件編號', primary: true, render: function (d) { return '<span class="cell-strong">' + esc(d.id) + '</span>'; } },
        { label: '類型', render: function (d) { return esc(d.typeName); } },
        { label: '物件', render: function (d) { return esc(d.unitId); } },
        { label: '租客', render: function (d) { return esc(d.tenantName || '—'); } },
        { label: '產生時間', render: function (d) { return esc(fmt.dateTime(d.createdAt)); } },
        { label: '製作人', render: function (d) { return esc(d.by); } },
        {
          label: '送出方式', render: function (d) {
            return d.sentVia ? esc(d.sentVia) : '<span class="muted-2">尚未送出</span>';
          }
        },
        {
          label: '狀態', render: function (d) {
            if (d.signed) return A.badge('已簽回', 'ok');
            if (d.sentVia) return A.badge('待簽回', 'warn');
            return A.badge('待傳送', 'accent');
          }
        }
      ]
    });
  }

  /* ------------------------------------------------------------------ 動作 */
  function resetDoc() {
    state.docId = null;
    state.sent = false;
  }
  function selectType(id) {
    if (!TYPES[id] || !typeAllowed(id) || id === state.typeId) return;
    state.typeId = id;
    resetDoc();
    renderTypes();
    renderTenants();
    renderPreview();
  }
  function selectUnit(id) {
    if (!D.unit(id) || id === state.unitId) return;
    state.unitId = id;
    resetDoc();
    renderTenants();
    renderPreview();
    renderHistory();
  }
  function generate() {
    var why = reasonFor(state.typeId, state.unitId);
    if (why) { A.toast(why, 'warn'); return; }
    if (state.docId) return;
    var t = docType(state.typeId);
    var u = D.unit(state.unitId);
    var fields = currentFields();
    seq += 1;
    state.docId = 'DOC-' + seq;
    docs.unshift({
      id: state.docId, type: t.id, typeName: t.name, unitId: u.id,
      tenantName: tenantNameOf(u) || '—',
      createdAt: A.today + ' ' + nowTime(), by: operatorName(), sentVia: null, signed: false
    });
    var host = document.getElementById('f17-preview');
    var btn = document.getElementById('f17-generate');
    if (btn) { btn.disabled = true; btn.textContent = '產生中⋯'; }
    A.simulateLoad(host, previewHTML, 520).then(function () {
      setPreviewBadge();
      updateGenerateBtn();
      renderKpis();
      renderHistory();
      A.toast('已產生' + t.name + '　' + fields.length + ' 個欄位自動帶入', 'ok', { sub: '文件編號 ' + state.docId });
    });
  }
  function currentDoc() {
    return state.docId ? docs.filter(function (d) { return d.id === state.docId; })[0] : null;
  }
  function download() {
    var doc = currentDoc();
    if (!doc) return;
    A.toast('已下載' + doc.typeName + ' PDF', 'ok', { sub: '提案示範，不會真的產生檔案' });
  }
  function sendLine() {
    var doc = currentDoc();
    if (!doc) return;
    if (doc.sentVia) { A.toast('這份文件已經傳送過了', 'neutral'); return; }
    var u = D.unit(state.unitId);
    var t = D.tenantOf(state.unitId);
    if (t && t.lineBound === false) {
      A.toast(t.name + '還沒綁定 LINE，請改用簡訊或現場簽署', 'warn');
      return;
    }
    doc.sentVia = 'LINE';
    state.sent = true;
    renderPreview();
    renderKpis();
    renderHistory();
    A.toast(doc.typeName + '已用 LINE 傳給' + (doc.tenantName || '租客'), 'ok', { sub: '物件 ' + u.id + '・提案示範，不會真的送出' });
  }

  /* ------------------------------------------------------------------ 綁定與啟動 */
  function bind() {
    var main = document.getElementById('main');
    if (!main) return;

    main.addEventListener('click', function (e) {
      var type = e.target.closest('.f17-type');
      if (type && !type.disabled) { selectType(type.getAttribute('data-type')); return; }

      var pick = e.target.closest('[data-unit-pick]');
      if (pick) { selectUnit(pick.getAttribute('data-unit-pick')); return; }

      var row = e.target.closest('tr[data-unit]');
      if (row) { selectUnit(row.getAttribute('data-unit')); return; }

      var fix = e.target.closest('[data-fix]');
      if (fix) { selectUnit(fix.getAttribute('data-fix')); return; }

      var hist = e.target.closest('[data-history]');
      if (hist) {
        state.historyScope = hist.getAttribute('data-history');
        renderHistory();
        return;
      }

      var act = e.target.closest('[data-act]');
      if (act) {
        if (act.getAttribute('data-act') === 'download') download();
        else sendLine();
      }
    });

    var gen = document.getElementById('f17-generate');
    if (gen) gen.addEventListener('click', generate);

    var search = document.getElementById('f17-search');
    if (search) {
      search.addEventListener('input', function () {
        state.query = search.value;
        renderTenants();
      });
    }
    var building = document.getElementById('f17-building');
    if (building) {
      building.addEventListener('change', function () {
        state.building = building.value;
        renderTenants();
      });
    }
    var scope = document.getElementById('f17-scope');
    if (scope) {
      scope.addEventListener('change', function () {
        state.scope = scope.value;
        renderTenants();
      });
    }

    A.onRole(function () {
      if (!typeAllowed(state.typeId)) {
        state.typeId = allowedTypes()[0];
        resetDoc();
        A.toast('修繕人員只能產生點交表與修繕確認書，已切換文件類型', 'warn');
      }
      renderRoleNote();
      renderTypes();
      renderTenants();
      renderPreview();
      renderHistory();
    });
  }

  function start() {
    var si = document.getElementById('f17-search-icon');
    if (si) si.outerHTML = icon('search');
    buildingOptions();
    renderKpis();
    renderRoleNote();
    renderTypes();
    renderTenants();
    renderPreview();
    renderHistory();
    bind();
    A.reveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
