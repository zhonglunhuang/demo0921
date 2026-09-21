/* js/app/f06.js — 設備履歷（f06）進系統操作頁
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）、§6.1（檔案所有權）。
 * 資料：一律讀 window.DB；基礎層沒有的欄位（工單 ↔ 設備對照、新機參考價、留意規則）放在本檔的 EXTRA。
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
    /* 設備類別 → 圖示、新機參考價（冷氣 22,000 與 DB 的汰換建議同一個數字） */
    kinds: {
      冷氣: { icon: 'wind', newPrice: 22000 },
      冰箱: { icon: 'box', newPrice: 15000 },
      洗衣機: { icon: 'refresh', newPrice: 13000 },
      熱水器: { icon: 'thermometer', newPrice: 6500 },
      電視: { icon: 'image', newPrice: 11000 }
    },

    /* 修繕工單掛回它修的那台設備（基礎層只在 WO-1028、WO-1038 寫了 equipmentId，其餘在這裡補）。
     * 只收「修」的工單；整台更換（例如 WO-1019 熱水器更換）不算在舊機的維修履歷上。 */
    woKind: {
      'WO-1021': '冷氣', 'WO-1033': '熱水器', 'WO-1042': '熱水器',
      'WO-1047': '洗衣機', 'WO-1050': '冰箱'
    },

    /* 「留意」規則：單次維修金額達新機參考價四成以上，雖然還沒到汰換門檻也要盯著 */
    watchRatio: 0.4,

    /* 汰換建議規則說明（給規則對話框用，與 data.js 的判斷邏輯一致） */
    rules: [
      { label: '建議汰換', kind: 'danger', text: '近 5 年維修 4 次以上，或累計維修費達 12,000 元以上。' },
      { label: '留意', kind: 'warn', text: '單次維修金額達新機參考價四成以上，機器已經在燒錢。' },
      { label: '保固將到期', kind: 'warn', text: '原廠保固剩 30 天以內，之後的維修要自付。' },
      { label: '狀況正常', kind: 'ok', text: '維修次數與金額都在合理範圍，繼續使用。' }
    ],

    /* 建立採購待辦的預設內容 */
    purchase: {
      assigneeId: 'S02',
      due: '2026-09-26',
      note: '汰換後保固重新起算 2 年，維修費回到 0 元'
    }
  };

  var CAN_PURCHASE = ['boss', 'manager'];
  var TABS = [
    { id: 'all', label: '全部' },
    { id: 'replace', label: '建議汰換' },
    { id: 'warranty', label: '保固將到期' },
    { id: 'repaired', label: '有維修紀錄' }
  ];
  var STATUS_NAME = { rented: '出租中', leaving: '即將空房', prep: '整備中', listing: '招租中', vacant: '空置' };
  var STATUS_KIND = { rented: 'ok', leaving: 'warn', prep: 'accent', listing: 'warn', vacant: 'neutral' };

  /* ================================================================
   * 2. 設備視圖（在 DB 之上算出維修紀錄、機齡、建議）
   * ================================================================ */
  function kindMeta(kind) { return EXTRA.kinds[kind] || { icon: 'box', newPrice: 15000 }; }

  /* 把工單掛回設備：回傳 { 設備 id: [工單…] } */
  var woByEquip = (function () {
    var map = {};
    D.workOrders.forEach(function (w) {
      var kind = w.equipmentId ? null : EXTRA.woKind[w.id];
      var eq = null;
      if (w.equipmentId) eq = D.equipmentById(w.equipmentId);
      else if (kind) {
        eq = D.equipmentOf(w.unitId).filter(function (e) { return e.kind === kind; })[0] || null;
      }
      if (!eq) return;   /* 物件沒有這類設備（例如套房沒有洗衣機）就不硬掛 */
      (map[eq.id] = map[eq.id] || []).push(w);
    });
    return map;
  })();

  function monthsBetween(from, to) {
    var a = A.parseDate(from), b = A.parseDate(to);
    if (!a || !b) return 0;
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  }

  function buildEquip(e) {
    var meta = kindMeta(e.kind);
    var repairs = e.repairs.map(function (r) {
      return {
        date: r.date, desc: r.desc, cost: r.cost, vendorId: r.vendorId,
        workOrderId: r.workOrderId, done: true
      };
    });
    /* 工單補進履歷：已完工的計入累計金額，還在跑的只顯示狀態、不計金額 */
    (woByEquip[e.id] || []).forEach(function (w) {
      if (repairs.some(function (r) { return r.workOrderId === w.id; })) return;
      repairs.push({
        date: w.completedAt || w.createdAt, desc: w.title, cost: w.quote, vendorId: w.vendorId,
        workOrderId: w.id, done: !!w.completedAt, status: w.status
      });
    });
    repairs.sort(function (a, b) { return a.date < b.date ? 1 : -1; });   /* 新的在上 */

    var doneRepairs = repairs.filter(function (r) { return r.done; });
    var total = doneRepairs.reduce(function (s, r) { return s + (r.cost || 0); }, 0);
    var maxOnce = doneRepairs.reduce(function (m, r) { return Math.max(m, r.cost || 0); }, 0);
    var warrantyDays = A.daysBetween(A.today, e.warrantyEnd);
    var advice = e.advice;
    if (!advice && maxOnce >= meta.newPrice * EXTRA.watchRatio) {
      advice = {
        level: 'watch',
        text: '單次維修就花了 ' + fmt.money(maxOnce) + '，達新機參考價的 ' +
          Math.round(maxOnce / meta.newPrice * 100) + '%，下次再壞建議直接換。'
      };
    }
    return {
      id: e.id, unitId: e.unitId, kind: e.kind, brand: e.brand, model: e.model,
      icon: meta.icon, newPrice: (e.advice && e.advice.suggestCost) || meta.newPrice,
      purchased: e.purchased, warrantyEnd: e.warrantyEnd,
      inWarranty: warrantyDays >= 0,
      warrantySoon: warrantyDays >= 0 && warrantyDays <= 30,
      warrantyDays: warrantyDays,
      ageMonths: monthsBetween(e.purchased, A.today),
      repairs: repairs, repairCount: doneRepairs.length, entryCount: repairs.length,
      totalRepairCost: total, maxOnce: maxOnce,
      advice: advice
    };
  }

  var EQUIPS = D.equipment.map(buildEquip);
  var BY_ID = {};
  var BY_UNIT = {};
  EQUIPS.forEach(function (e) {
    BY_ID[e.id] = e;
    (BY_UNIT[e.unitId] = BY_UNIT[e.unitId] || []).push(e);
  });

  var UNITS = D.units.filter(function (u) { return BY_UNIT[u.id] && BY_UNIT[u.id].length; }).map(function (u) {
    var list = BY_UNIT[u.id];
    return {
      id: u.id, building: u.building, region: u.region, floor: u.floor, type: u.type, ping: u.ping,
      status: u.status, tenant: D.tenantOf(u.id),
      equips: list,
      replaceCount: list.filter(function (e) { return e.advice && e.advice.level === 'replace'; }).length,
      watchCount: list.filter(function (e) { return e.advice && e.advice.level === 'watch'; }).length,
      warrantySoon: list.filter(function (e) { return e.warrantySoon; }).length,
      repairCount: list.reduce(function (s, e) { return s + e.repairCount; }, 0),
      entryCount: list.reduce(function (s, e) { return s + e.entryCount; }, 0),
      repairCost: list.reduce(function (s, e) { return s + e.totalRepairCost; }, 0)
    };
  });

  var SUMMARY = {
    equipCount: EQUIPS.length,
    unitCount: UNITS.length,
    inWarranty: EQUIPS.filter(function (e) { return e.inWarranty; }).length,
    warrantySoon: EQUIPS.filter(function (e) { return e.warrantySoon; }).length,
    replace: EQUIPS.filter(function (e) { return e.advice && e.advice.level === 'replace'; }).length,
    watch: EQUIPS.filter(function (e) { return e.advice && e.advice.level === 'watch'; }).length,
    repairCount: EQUIPS.reduce(function (s, e) { return s + e.repairCount; }, 0),
    repairCost: EQUIPS.reduce(function (s, e) { return s + e.totalRepairCost; }, 0)
  };

  /* 建議汰換的那台（故事數字：A07 日立冷氣，5 年 4 次、13,000 元） */
  var FLAGGED = EQUIPS.filter(function (e) { return e.advice && e.advice.level === 'replace'; })[0] || null;

  /* ================================================================
   * 3. 狀態（記憶體，重新整理即回到初始）
   * ================================================================ */
  var state = {
    tab: 'all',
    building: '全部',
    keyword: '',
    unitId: FLAGGED ? FLAGGED.unitId : (UNITS[0] && UNITS[0].id),
    equipId: FLAGGED ? FLAGGED.id : null,
    purchases: {},          /* 設備 id → 採購待辦 */
    poSeq: 0
  };

  function unit(id) { return UNITS.filter(function (u) { return u.id === id; })[0] || null; }
  function canPurchase() { return CAN_PURCHASE.indexOf(A.role) >= 0; }

  function matchTab(u) {
    if (state.tab === 'replace') return u.replaceCount > 0;
    if (state.tab === 'warranty') return u.warrantySoon > 0;
    if (state.tab === 'repaired') return u.entryCount > 0;
    return true;
  }
  function matchKeyword(u) {
    var k = state.keyword.trim().toLowerCase();
    if (!k) return true;
    if (u.id.toLowerCase().indexOf(k) >= 0) return true;
    return u.equips.some(function (e) {
      return (e.brand + ' ' + e.model + ' ' + e.kind).toLowerCase().indexOf(k) >= 0;
    });
  }
  function filtered() {
    return UNITS.filter(function (u) {
      if (state.building !== '全部' && u.building !== state.building) return false;
      return matchTab(u) && matchKeyword(u);
    });
  }

  /* ================================================================
   * 4. 畫面：KPI 與警示
   * ================================================================ */
  function renderKpis() {
    var open = SUMMARY.replace - Object.keys(state.purchases).length;
    document.getElementById('f06-kpis').innerHTML =
      A.kpi({ label: '列管設備', value: fmt.num(SUMMARY.equipCount), unit: ' 台', icon: 'layers', hint: SUMMARY.unitCount + ' 間物件，逐台記錄品牌與保固' }) +
      A.kpi({ label: '保固中', value: fmt.num(SUMMARY.inWarranty), unit: ' 台', icon: 'shield-check', hint: '維修由原廠負責，不算公司成本' }) +
      A.kpi({ label: '保固 30 天內到期', value: fmt.num(SUMMARY.warrantySoon), unit: ' 台', kind: 'warn', icon: 'clock', hint: '到期後維修改由公司支付' }) +
      A.kpi({ label: '建議汰換', value: fmt.num(Math.max(0, open)), unit: ' 台', kind: open > 0 ? 'danger' : 'ok', icon: 'alert', hint: open > 0 ? '維修費已接近一台新機' : '建議汰換的設備都已排入採購' });
  }

  function renderAlerts() {
    var host = document.getElementById('f06-alerts');
    if (!FLAGGED) { host.innerHTML = ''; return; }
    var po = state.purchases[FLAGGED.id];
    if (po) {
      host.innerHTML = A.alert('', 'ok', {
        title: FLAGGED.unitId + ' ' + FLAGGED.brand + FLAGGED.kind + '已排入採購',
        html: '<p>採購待辦 ' + esc(po.id) + ' 已指派給' + esc(po.assignee.name) + '（' + esc(po.assignee.roleName) + '），期限 ' + esc(fmt.date(po.due)) + '。汰換後這台的維修費歸零。</p>'
      });
      return;
    }
    host.innerHTML = A.alert('', 'danger', {
      title: FLAGGED.unitId + ' ' + FLAGGED.brand + FLAGGED.kind + '建議汰換',
      html: '<p>近 5 年維修 ' + FLAGGED.repairCount + ' 次、累計 ' + esc(fmt.money(FLAGGED.totalRepairCost)) +
        '，已經是一台新機的 ' + Math.round(FLAGGED.totalRepairCost / FLAGGED.newPrice * 100) + '%。再修下去不划算，建議直接換新。</p>',
      action: '<button type="button" class="btn btn--secondary btn--sm" data-act="focus" data-equip="' + esc(FLAGGED.id) + '">查看這台冷氣</button>'
    });
  }

  /* ================================================================
   * 5. 畫面：左側物件清單
   * ================================================================ */
  function renderFilters() {
    document.getElementById('f06-tabs').innerHTML = TABS.map(function (t) {
      var on = t.id === state.tab;
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-tab="' + t.id + '">' +
        '<span>' + esc(t.label) + '</span></button>';
    }).join('');

    var sel = document.getElementById('f06-building');
    sel.innerHTML = ['全部'].concat(Object.keys(D.company.buildings)).map(function (b) {
      return '<option value="' + esc(b) + '"' + (b === state.building ? ' selected' : '') + '>' + esc(b === '全部' ? '全部棟別' : b + ' 棟') + '</option>';
    }).join('');

    var search = document.querySelector('#f06-search');
    if (search && search.parentNode && !search.parentNode.querySelector('.icon')) {
      search.insertAdjacentHTML('beforebegin', icon('search'));
    }
  }

  function unitBadge(u) {
    if (u.replaceCount) {
      var open = u.equips.filter(function (e) { return e.advice && e.advice.level === 'replace' && !state.purchases[e.id]; }).length;
      return open ? A.badge('建議汰換 ' + open, 'danger') : A.badge('已排採購', 'accent');
    }
    if (u.warrantySoon) return A.badge('保固將到期', 'warn');
    if (u.watchCount) return A.badge('留意', 'warn');
    if (u.repairCount) return A.badge('修過 ' + u.repairCount + ' 次', 'neutral');
    if (u.entryCount) return A.badge('工單進行中', 'accent');
    return A.badge('正常', 'ok');
  }

  function renderUnits() {
    var host = document.getElementById('f06-units');
    var list = filtered();
    document.getElementById('f06-count').textContent =
      list.length ? '共 ' + list.length + ' 間物件、' + list.reduce(function (s, u) { return s + u.equips.length; }, 0) + ' 台設備' : '';

    if (!list.length) {
      host.innerHTML = A.emptyState({
        icon: 'search',
        title: '這個條件下沒有設備',
        text: '換一個狀態或棟別再看看，也可以直接清除篩選回到全部 ' + SUMMARY.equipCount + ' 台。',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="clear-filter">清除篩選</button>'
      });
      return;
    }
    host.innerHTML = list.map(function (u) {
      return '<button type="button" class="f06-unit' + (u.id === state.unitId ? ' is-active' : '') + '" data-act="select" data-unit="' + esc(u.id) + '" aria-pressed="' + (u.id === state.unitId) + '">' +
        '<span class="f06-unit-id">' + esc(u.id) + '</span>' +
        '<span class="f06-unit-sub">' + esc(u.region + ' · ' + u.type) + '</span>' +
        '<span class="f06-unit-right">' + unitBadge(u) +
          '<span class="f06-unit-count">' + u.equips.length + ' 台設備</span></span>' +
        '</button>';
    }).join('');
  }

  /* ================================================================
   * 6. 畫面：右側設備詳情
   * ================================================================ */
  function warrantyBadge(e) {
    if (e.warrantySoon) return A.badge('保固剩 ' + e.warrantyDays + ' 天', 'warn');
    if (e.inWarranty) return A.badge('保固中', 'ok');
    return A.badge('已過保固', 'neutral');
  }

  function equipCard(e) {
    var po = state.purchases[e.id];
    var flagged = !po && e.advice && e.advice.level === 'replace';
    var costCls = e.totalRepairCost >= e.newPrice * 0.5 ? ' is-high' : '';
    return '<button type="button" class="f06-eq-card' + (e.id === state.equipId ? ' is-active' : '') + (flagged ? ' is-flagged' : '') +
      '" data-act="pick" data-equip="' + esc(e.id) + '" aria-pressed="' + (e.id === state.equipId) + '">' +
      '<span class="f06-eq-top">' +
        '<span class="icon-circle' + (flagged ? ' icon-circle--danger' : ' icon-circle--neutral') + '">' + icon(e.icon) + '</span>' +
        '<span class="f06-eq-name"><span class="f06-eq-kind">' + esc(e.kind) + '</span>' +
        '<span class="f06-eq-model">' + esc(e.brand + ' ' + e.model) + '</span></span>' +
      '</span>' +
      '<span class="f06-eq-foot">' +
        (po ? A.badge('採購待辦已建立', 'accent') : flagged ? A.badge('建議汰換', 'danger') : e.advice ? A.badge('留意', 'warn') : warrantyBadge(e)) +
        '<span class="f06-eq-repair' + costCls + '">' + esc(e.repairCount
          ? '修過 ' + e.repairCount + ' 次 · ' + fmt.money(e.totalRepairCost)
          : (e.entryCount ? '有 ' + e.entryCount + ' 張工單進行中' : '沒有維修紀錄')) + '</span>' +
      '</span></button>';
  }

  function repairTable(e) {
    var rows = e.repairs.map(function (r) {
      var v = r.vendorId ? D.vendorById(r.vendorId) : null;
      return {
        date: fmt.date(r.date),
        desc: r.desc,
        cost: r.done ? fmt.money(A.mask(r.cost, 'repairCost')) : '報價中',
        vendor: v ? v.name : '未指派',
        wo: r.workOrderId,
        done: r.done,
        status: r.status
      };
    });
    return A.table({
      id: 'f06-repairs',
      columns: [
        { key: 'date', label: '日期', width: '116px' },
        { key: 'desc', label: '維修內容', primary: true, render: function (r) {
          return esc(r.desc) + (r.done ? '' : ' ' + A.badge(r.status || '進行中', 'accent'));
        } },
        { key: 'cost', label: '金額', align: 'num', width: '110px' },
        { key: 'vendor', label: '廠商', width: '130px' },
        { key: 'wo', label: '工單', width: '120px', render: function (r) {
          if (!r.wo) return '<span class="muted-2">現場處理</span>';
          return '<button type="button" class="btn btn--ghost btn--sm f06-wo-link" data-act="wo" data-wo="' + esc(r.wo) + '">' + esc(r.wo) + '</button>';
        } }
      ],
      rows: rows,
      empty: { icon: 'check-circle', title: '這台還沒有修過', text: '從買進來到現在都沒出過狀況，維修費 0 元。' }
    });
  }

  function adviceBlock(e) {
    var po = state.purchases[e.id];
    var level = po ? 'ok' : (e.advice ? e.advice.level : 'ok');
    var ratio = e.newPrice ? Math.round(e.totalRepairCost / e.newPrice * 100) : 0;

    if (po) {
      return '<div class="f06-advice f06-advice--ok">' +
        '<div class="f06-advice-top">' + icon('check-circle') + '<span class="f06-advice-title">已排入採購，等待報價</span></div>' +
        '<p>' + esc('採購待辦 ' + po.id + ' 已指派給' + po.assignee.name + '，期限 ' + fmt.date(po.due) + '。' + EXTRA.purchase.note + '。') + '</p></div>';
    }
    if (level === 'replace') {
      return '<div class="f06-advice f06-advice--replace">' +
        '<div class="f06-advice-top">' + icon('sparkles') + '<span class="f06-advice-title">AI 建議汰換，不要再修</span></div>' +
        '<p>' + esc(e.advice.text) + '</p>' +
        '<div class="f06-compare">' +
          A.statRow([
            { label: '累計維修費', value: fmt.money(A.mask(e.totalRepairCost, 'repairCost')), kind: 'danger' },
            { label: '新機參考價', value: fmt.money(e.newPrice) },
            { label: '已花掉新機的', value: ratio + '%', kind: 'danger' }
          ], { divided: true }) +
          A.progress(e.totalRepairCost, { max: e.newPrice, kind: 'danger', label: '維修費 ÷ 新機參考價', valueLabel: ratio + '%' }) +
        '</div>' +
        '<div class="f06-advice-actions">' +
          '<button type="button" class="btn btn--primary" data-act="purchase" data-equip="' + esc(e.id) + '"' + (canPurchase() ? '' : ' disabled') + '>建立採購待辦</button>' +
          '<span class="f06-advice-note">' + esc(canPurchase()
            ? '建立後會指派給租務管理員，並排進待辦清單。'
            : '採購待辦由老闆或租務管理員建立，目前是' + A.roleName() + '視角。') + '</span>' +
        '</div></div>';
    }
    if (level === 'watch') {
      return '<div class="f06-advice f06-advice--watch">' +
        '<div class="f06-advice-top">' + icon('alert-circle') + '<span class="f06-advice-title">留意這台，再壞就換</span></div>' +
        '<p>' + esc(e.advice.text) + '</p>' +
        '<div class="f06-compare">' + A.statRow([
          { label: '累計維修費', value: fmt.money(A.mask(e.totalRepairCost, 'repairCost')) },
          { label: '新機參考價', value: fmt.money(e.newPrice) },
          { label: '已花掉新機的', value: ratio + '%', kind: 'danger' }
        ], { divided: true }) + '</div></div>';
    }
    return '<div class="f06-advice f06-advice--ok">' +
      '<div class="f06-advice-top">' + icon('check-circle') + '<span class="f06-advice-title">狀況正常，繼續使用</span></div>' +
      '<p>' + esc(e.repairCount
        ? '近 5 年維修 ' + e.repairCount + ' 次、累計 ' + fmt.money(e.totalRepairCost) + '，離汰換門檻還很遠。'
        : '到目前為止沒有維修紀錄，' + (e.inWarranty ? '而且還在保固內。' : '保固已過，之後的維修由公司支付。')) + '</p></div>';
  }

  function purchaseBlock(e) {
    var po = state.purchases[e.id];
    if (!po) return '';
    return '<div class="f06-po">' +
      '<div class="f06-po-top">' + icon('clipboard') + '<span class="f06-po-title">採購待辦 ' + esc(po.id) + '</span>' + A.badge('待處理', 'accent') + '</div>' +
      '<dl class="kv">' +
        '<dt>採購項目</dt><dd>' + esc(po.item) + '</dd>' +
        '<dt>參考預算</dt><dd>' + esc(fmt.money(po.budget)) + '</dd>' +
        '<dt>負責人</dt><dd>' + esc(po.assignee.name + '（' + po.assignee.roleName + '）') + '</dd>' +
        '<dt>期限</dt><dd>' + esc(fmt.date(po.due)) + '</dd>' +
        '<dt>建立依據</dt><dd>' + esc(po.basis) + '</dd>' +
      '</dl></div>';
  }

  function renderDetail() {
    var host = document.getElementById('f06-detail');
    var u = unit(state.unitId);
    if (!u) {
      host.innerHTML = A.emptyState({ title: '先從左邊選一間物件', text: '選一間房，右邊會列出它所有設備的品牌、保固與維修紀錄。' });
      return;
    }
    var list = u.equips;
    if (!list.some(function (e) { return e.id === state.equipId; })) state.equipId = list[0].id;
    var e = BY_ID[state.equipId];

    host.innerHTML =
      '<div class="f06-detail-head">' +
        '<div>' +
          '<div class="f06-detail-title"><h2>' + esc(u.id) + '</h2>' +
            A.badge(u.type, 'neutral') + A.badge(STATUS_NAME[u.status] || u.status, STATUS_KIND[u.status] || 'neutral') + '</div>' +
          '<div class="f06-detail-sub">' +
            '<span>' + esc(u.region + ' · ' + u.building + ' 棟 ' + u.floor + ' 樓 · ' + u.ping + ' 坪') + '</span>' +
            '<span>' + esc(u.tenant ? '租客 ' + u.tenant.name : '目前沒有租客') + '</span>' +
            '<span>' + esc('列管 ' + list.length + ' 台 · 累計維修 ' + fmt.money(A.mask(u.repairCost, 'repairCost'))) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="f06-eq-grid">' + list.map(equipCard).join('') + '</div>' +

      '<section class="card card--static" aria-labelledby="f06-eq-title">' +
        '<div class="f06-eq-head">' +
          '<div><h3 id="f06-eq-title">' + esc(e.kind + '　' + e.brand + ' ' + e.model) + '</h3>' +
            '<p class="f06-eq-model">' + esc('設備編號 ' + e.id) + '</p></div>' +
          '<div class="row">' + warrantyBadge(e) + '</div>' +
        '</div>' +
        '<dl class="kv f06-kv">' +
          '<dt>購入日期</dt><dd>' + esc(fmt.date(e.purchased)) + '</dd>' +
          '<dt>機齡</dt><dd>' + esc(Math.floor(e.ageMonths / 12) + ' 年 ' + (e.ageMonths % 12) + ' 個月') + '</dd>' +
          '<dt>保固到期</dt><dd class="' + (e.warrantySoon ? 'is-warn' : '') + '">' + esc(fmt.date(e.warrantyEnd)) + esc(e.inWarranty ? '（剩 ' + e.warrantyDays + ' 天）' : '（已過保）') + '</dd>' +
          '<dt>維修次數</dt><dd>' + esc(e.repairCount + ' 次') + '</dd>' +
          '<dt>累計維修費</dt><dd class="' + (e.totalRepairCost >= e.newPrice * 0.5 ? 'is-danger' : '') + '">' + esc(fmt.money(A.mask(e.totalRepairCost, 'repairCost'))) + '</dd>' +
          '<dt>新機參考價</dt><dd>' + esc(fmt.money(e.newPrice)) + '</dd>' +
        '</dl>' +
      '</section>' +

      adviceBlock(e) +
      purchaseBlock(e) +

      '<section class="card card--flush card--static" aria-labelledby="f06-repair-title">' +
        '<div class="card-head"><div><h3 class="card-title" id="f06-repair-title">維修履歷</h3>' +
          '<p class="card-sub">每一次維修的日期、內容、金額與廠商都留著，換人接手也查得到。</p></div></div>' +
        repairTable(e) +
      '</section>';
  }

  function renderAll() {
    renderKpis();
    renderAlerts();
    renderFilters();
    renderUnits();
    renderDetail();
  }

  /* ================================================================
   * 7. 操作
   * ================================================================ */
  function selectUnit(id, equipId) {
    state.unitId = id;
    state.equipId = equipId || null;
    renderUnits();
    renderDetail();
  }

  function focusEquip(equipId) {
    var e = BY_ID[equipId];
    if (!e) return;
    state.tab = 'all';
    state.building = '全部';
    state.keyword = '';
    var search = document.getElementById('f06-search');
    if (search) search.value = '';
    renderFilters();
    selectUnit(e.unitId, e.id);
    var host = document.getElementById('f06-detail');
    if (host) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openPurchase(e) {
    if (!canPurchase()) {
      A.toast('採購待辦由老闆或租務管理員建立', 'warn');
      return;
    }
    var staff = D.staffById(EXTRA.purchase.assigneeId);
    var item = e.kind + '汰換（' + e.unitId + '　原機：' + e.brand + ' ' + e.model + '）';
    var existing = D.todos.filter(function (t) { return t.kind === 'equipment' && t.unitId === e.unitId; })[0];
    A.modal({
      title: '建立採購待辦',
      size: 'sm',
      body:
        '<p>這台' + esc(e.kind) + '近 5 年維修 ' + e.repairCount + ' 次、累計 ' + esc(fmt.money(e.totalRepairCost)) +
          '，接近一台新機的價格。建立後會排進待辦清單並指派負責人。</p>' +
        '<dl class="kv mt-16">' +
          '<dt>採購項目</dt><dd>' + esc(item) + '</dd>' +
          '<dt>參考預算</dt><dd>' + esc(fmt.money(e.newPrice)) + '</dd>' +
          '<dt>負責人</dt><dd>' + esc(staff.name + '（' + staff.roleName + '）') + '</dd>' +
          '<dt>期限</dt><dd>' + esc(fmt.date(EXTRA.purchase.due)) + '</dd>' +
          (existing ? '<dt>建立依據</dt><dd>' + esc('待辦 ' + existing.id + '（' + existing.title + '）') + '</dd>' : '') +
        '</dl>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '建立採購待辦', kind: 'primary', onClick: function () { createPurchase(e, staff, item, existing); } }
      ]
    });
  }

  function createPurchase(e, staff, item, existing) {
    state.poSeq += 1;
    state.purchases[e.id] = {
      id: 'PO-2609-' + (state.poSeq < 10 ? '0' : '') + state.poSeq,
      item: item,
      budget: e.newPrice,
      assignee: staff,
      due: EXTRA.purchase.due,
      basis: existing ? '待辦 ' + existing.id + '（' + existing.title + '）' : '設備履歷 ' + e.id + ' 汰換建議'
    };
    renderAll();
    A.toast('已建立採購待辦，指派給' + staff.name, 'ok', { sub: '期限 ' + fmt.date(EXTRA.purchase.due) });
  }

  function openWorkOrder(id) {
    var w = D.workOrder(id);
    if (!w) return;
    var v = w.vendorId ? D.vendorById(w.vendorId) : null;
    A.modal({
      title: '工單 ' + w.id,
      body:
        '<dl class="kv">' +
          '<dt>物件</dt><dd>' + esc(w.unitId) + '</dd>' +
          '<dt>項目</dt><dd>' + esc(w.title) + '</dd>' +
          '<dt>狀態</dt><dd>' + esc(w.status) + '</dd>' +
          '<dt>廠商</dt><dd>' + esc(v ? v.name + '（平均 ' + v.avgDays + ' 天完工）' : '未指派') + '</dd>' +
          '<dt>金額</dt><dd>' + esc(w.quote != null ? fmt.money(A.mask(w.quote, 'repairCost')) : '尚未報價') + '</dd>' +
        '</dl>' +
        '<h4 class="card-title mt-24">工單時間軸</h4>' +
        A.timeline((w.timeline || []).map(function (t) { return { at: t.at, text: t.text, by: t.by }; }), { rawTime: true }),
      actions: [{ label: '關閉', kind: 'secondary' }]
    });
  }

  function openRules() {
    A.modal({
      title: '汰換建議規則',
      body: '<p>系統每天重算每一台設備的維修次數與金額，對照新機參考價給出建議。四種結果：</p>' +
        '<div class="stack stack--sm mt-16">' + EXTRA.rules.map(function (r) {
          return '<div class="row" style="align-items:flex-start;gap:10px">' + A.badge(r.label, r.kind) +
            '<span class="small muted" style="flex:1 1 200px">' + esc(r.text) + '</span></div>';
        }).join('') + '</div>' +
        '<p class="small muted mt-16">' + esc('目前 ' + SUMMARY.equipCount + ' 台設備裡，建議汰換 ' + SUMMARY.replace + ' 台、留意 ' + SUMMARY.watch +
          ' 台、保固 30 天內到期 ' + SUMMARY.warrantySoon + ' 台，累計維修 ' + SUMMARY.repairCount + ' 次、' + fmt.money(SUMMARY.repairCost) + '。') + '</p>',
      actions: [{ label: '關閉', kind: 'secondary' }]
    });
  }

  /* ================================================================
   * 8. 事件
   * ================================================================ */
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!(t instanceof Element)) return;
    var btn = t.closest('[data-act]');
    if (btn) {
      var act = btn.getAttribute('data-act');
      if (act === 'select') { selectUnit(btn.getAttribute('data-unit')); return; }
      if (act === 'pick') { state.equipId = btn.getAttribute('data-equip'); renderDetail(); return; }
      if (act === 'focus') { focusEquip(btn.getAttribute('data-equip')); return; }
      if (act === 'clear-filter') {
        state.tab = 'all'; state.building = '全部'; state.keyword = '';
        var s = document.getElementById('f06-search'); if (s) s.value = '';
        renderFilters(); renderUnits(); return;
      }
      if (act === 'purchase') { openPurchase(BY_ID[btn.getAttribute('data-equip')]); return; }
      if (act === 'wo') { openWorkOrder(btn.getAttribute('data-wo')); return; }
      return;
    }
    var tab = t.closest('#f06-tabs .tab[data-tab]');
    if (tab) { state.tab = tab.getAttribute('data-tab'); renderUnits(); return; }
    if (t.closest('#f06-rules')) { openRules(); }
  });

  document.addEventListener('input', function (ev) {
    if (ev.target && ev.target.id === 'f06-search') { state.keyword = ev.target.value; renderUnits(); }
  });
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'f06-building') { state.building = ev.target.value; renderUnits(); }
  });

  /* 角色換了：能不能建採購待辦、金額怎麼顯示都要跟著變 */
  A.onRole(function () { renderAll(); });

  renderAll();
})();
