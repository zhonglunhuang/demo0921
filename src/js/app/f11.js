/* js/app/f11.js — AI 客服與知識庫（f11）進系統操作頁
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）、§6.1（檔案所有權）。
 * 資料：問答條目以 DB.kb（8 類 × 5 棟）為底，加上本檔 EXTRA 的「冷氣」一類與房間層級補充；
 *      本月提問量、轉人工紀錄等基礎層沒有的欄位一律放在 EXTRA，不動 data.js。
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
  var BUILDINGS = ['A', 'B', 'C', 'D', 'E'];
  var CAN_EDIT = ['boss', 'manager'];

  /* ================================================================
   * 1. 基礎層沒有的資料（只在本檔補，不動 data.js）
   * ================================================================ */
  var EXTRA = {
    /* 本月客服量（提問 = AI 直接回答 + 轉人工） */
    month: D.currentMonth,
    asked: 412,
    answered: 344,
    escalated: 68,
    avgSeconds: 8,

    /* 九類問題：前八類的答案來自 DB.kb，「冷氣」為本功能自行補上 */
    topics: [
      { topic: '垃圾', label: '垃圾怎麼丟', icon: 'trash', weight: 5 },
      { topic: '停車', label: '可以停車嗎', icon: 'truck', weight: 3 },
      { topic: '網路', label: '網路壞了', icon: 'wifi', weight: 4 },
      { topic: '熱水器', label: '熱水器怎麼用', icon: 'thermometer', weight: 4 },
      { topic: '冷氣', label: '冷氣怎麼開', icon: 'wind', weight: 3, own: true, q: '冷氣怎麼開？',
        a: '冷氣遙控器放在房內抽屜，按電源後選冷氣模式，溫度建議 26 至 28 度，出門請關機。' +
           '若不冷或有異音，請回覆「冷氣報修」，我們會安排廠商到場。' },
      { topic: '磁扣', label: '磁扣怎麼用', icon: 'key', weight: 3 },
      { topic: '報修', label: '東西壞了報修', icon: 'wrench', weight: 5 },
      { topic: '繳費', label: '租金怎麼繳', icon: 'dollar', weight: 4 },
      { topic: '公共區域', label: '公共區域規定', icon: 'users', weight: 2 }
    ],

    /* 知識庫裡故意沒有的一題，用來示範「答不出來就轉人工」 */
    unknown: { topic: '寵物', label: '可以養貓嗎', icon: 'help-circle', q: '可以養貓嗎？' },

    /* 對話模擬用的三位租客（都已綁定 LINE） */
    simUnits: ['A01', 'B12', 'C05'],

    /* 最近轉人工的案件（WO-1051 與工作中心、修繕工單同一件事） */
    escalations: [
      { id: 'ESC-241', at: '2026-09-20 21:08', unitId: 'D07', q: '腳踏車可以停哪裡？',
        state: 'pending', note: '知識庫沒有這題，已轉租務管理員' },
      { id: 'ESC-238', at: '2026-09-18 10:12', unitId: 'C03', q: '熱水器忽冷忽熱，要怎麼處理？',
        state: 'workorder', note: 'AI 問了兩次細節都沒回覆，無法判斷派工類別，已開工單 WO-1051' }
    ]
  };

  /* ================================================================
   * 2. 知識庫：DB.kb ＋ 本檔補的「冷氣」，並攤出本月引用次數
   * ================================================================ */
  function buildingUnits(code) { return D.unitsBy({ building: code }).length; }
  function monthText() { return (+D.currentMonth.slice(5)) + ' 月'; }

  function buildEntries() {
    var list = [];
    BUILDINGS.forEach(function (code) {
      var b = D.company.buildings[code];
      EXTRA.topics.forEach(function (t) {
        var src = t.own ? null : D.kbFor(code, t.topic)[0];
        list.push({
          id: code + '-' + t.topic,
          building: code,
          buildingName: b.name,
          topic: t.topic,
          icon: t.icon,
          q: src ? src.q : t.q,
          a: src ? src.a : t.a,
          weight: t.weight,
          units: buildingUnits(code),
          uses: 0,
          updatedAt: '2026-08-28',
          own: !!t.own
        });
      });
    });
    spreadUses(list, EXTRA.answered);
    return list;
  }

  /* 把「本月 AI 直接回答 344 則」照題型權重與棟別間數攤到每一條，總和必須剛好等於 344 */
  function spreadUses(list, total) {
    var raw = list.map(function (e) { return e.weight * e.units; });
    var sumRaw = 0;
    raw.forEach(function (r) { sumRaw += r; });
    list.forEach(function (e, i) { e.uses = Math.max(1, Math.round(raw[i] * total / sumRaw)); });
    var got = 0;
    list.forEach(function (e) { got += e.uses; });
    var order = list.slice().sort(function (a, b) { return b.uses - a.uses; });
    var i = 0;
    while (got !== total && order.length) {
      var e = order[i % order.length];
      if (got > total) { if (e.uses > 1) { e.uses -= 1; got -= 1; } }
      else { e.uses += 1; got += 1; }
      i += 1;
    }
  }

  /* 房間層級的補充：同一棟裡，這一間的設備、鑰匙、繳費狀態各自不同 */
  function roomNote(topic, unitId) {
    var u = D.unit(unitId);
    if (!u) return '';
    if (topic === '熱水器' || topic === '冷氣') {
      var eq = D.equipmentOf(unitId).filter(function (e) { return e.kind === topic; })[0];
      if (!eq) return '';
      return '您這間（' + unitId + '）的' + topic + '是 ' + eq.brand + ' ' + eq.model + '，' +
        fmt.date(eq.purchased) + ' 安裝，保固' +
        (eq.warrantyEnd >= D.today ? '到 ' + fmt.date(eq.warrantyEnd) : '已於 ' + fmt.date(eq.warrantyEnd) + ' 到期') + '。';
    }
    if (topic === '磁扣') {
      return '您這間登記的是磁扣 ' + u.keys.card + ' 張、鑰匙 ' + u.keys.key + ' 把，退租點交時要一起歸還。';
    }
    if (topic === '繳費') {
      var t = D.tenantOf(unitId);
      if (!t) return '';
      return t.paid === '已繳'
        ? '您 ' + monthText() + '的租金已在 ' + fmt.date(t.paidAt) + ' 入帳，本月不用再繳。'
        : '系統顯示您 ' + monthText() + '的租金還沒入帳，繳完會自動更新，不用傳收據。';
    }
    return '';
  }

  /* ================================================================
   * 3. 狀態（記憶體）
   * ================================================================ */
  var state = {
    entries: buildEntries(),
    escalations: EXTRA.escalations.map(function (e) {
      var t = D.tenantOf(e.unitId);
      return {
        id: e.id, at: e.at, unitId: e.unitId, building: D.unit(e.unitId).building,
        tenantName: t ? t.name : '租客', q: e.q, topic: e.topic || '其他',
        state: e.state, note: e.note, isNew: false
      };
    }),
    asked: EXTRA.asked,
    answered: EXTRA.answered,
    escalated: EXTRA.escalated,
    unitId: EXTRA.simUnits[0],
    building: 'A',
    search: '',
    cited: null,
    busy: false,
    clock: 612,          /* 對話時鐘，10:12 起算（分鐘） */
    seq: 241
  };

  function canEdit() { return CAN_EDIT.indexOf(A.role) >= 0; }
  function pendingList() { return state.escalations.filter(function (e) { return e.state === 'pending'; }); }
  function entryOf(building, topic) {
    for (var i = 0; i < state.entries.length; i++) {
      if (state.entries[i].building === building && state.entries[i].topic === topic) return state.entries[i];
    }
    return null;
  }
  function entryById(id) {
    for (var i = 0; i < state.entries.length; i++) if (state.entries[i].id === id) return state.entries[i];
    return null;
  }
  function tenantOfSim() { return D.tenantOf(state.unitId); }
  function clockText() {
    var h = Math.floor(state.clock / 60) % 24;
    var m = state.clock % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function tick() { state.clock += 1; return clockText(); }

  /* ================================================================
   * 4. 渲染
   * ================================================================ */
  var $ = function (sel) { return document.querySelector(sel); };

  function renderKpis() {
    var rate = state.asked ? (state.answered / state.asked * 100) : 0;
    var pending = pendingList().length;
    $('#f11-kpis').innerHTML = [
      A.kpi({
        label: '本月租客提問', icon: 'message', value: fmt.num(state.asked), unit: ' 則',
        hint: '平均 ' + EXTRA.avgSeconds + ' 秒回覆，' + monthText() + '累計'
      }),
      A.kpi({
        label: 'AI 直接解決', icon: 'bot', value: fmt.pct(rate / 100, 1), kind: 'ok',
        hint: fmt.num(state.answered) + ' 則由知識庫回答，沒人接電話也答得出來'
      }),
      A.kpi({
        label: '轉人工', icon: 'user-check', value: fmt.num(state.escalated), unit: ' 則',
        kind: pending ? 'warn' : undefined,
        hint: pending ? '其中 ' + pending + ' 題還沒補上答案' : '每一題都補上答案了'
      }),
      A.kpi({
        label: '知識庫條目', icon: 'database', value: state.entries.length, unit: ' 條',
        hint: EXTRA.topics.length + ' 類問題 × 5 棟，涵蓋 ' + D.stats.totalUnits + ' 間物件'
      })
    ].join('');
  }

  function renderAlerts() {
    var pending = pendingList();
    if (pending.length) {
      $('#f11-alerts').innerHTML = A.alert('', 'warn', {
        title: '有 ' + pending.length + ' 題租客問過、知識庫還答不出來',
        html: '<p>最新一題是「' + esc(pending[0].q) + '」（' + esc(pending[0].unitId) + '）。補上答案之後，' +
          '同一棟的租客再問就由 AI 直接回。</p>',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="go-pending">去補答案</button>'
      });
    } else {
      $('#f11-alerts').innerHTML = A.alert('租客問過的每一題，AI 現在都答得出來，沒有等人回覆的問題。', 'ok', {
        title: '待補問答已清空'
      });
    }
  }

  function renderTenantTabs() {
    $('#f11-tenant-tabs').innerHTML = EXTRA.simUnits.map(function (id) {
      var t = D.tenantOf(id);
      var on = id === state.unitId;
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-sim="' + esc(id) + '">' +
        '<span>' + esc(id + ' ' + t.name) + '</span></button>';
    }).join('');
  }

  function renderIdentity() {
    var u = D.unit(state.unitId);
    var t = tenantOfSim();
    var b = D.company.buildings[u.building];
    $('#f11-identity').innerHTML =
      '<span class="icon-circle icon-circle--ok">' + icon('user-check') + '</span>' +
      '<div class="f11-identity-name">' + esc(t.name) +
        A.badge(t.lineBound ? 'LINE 已綁定' : 'LINE 未綁定', t.lineBound ? 'ok' : 'neutral') + '</div>' +
      '<div class="f11-identity-meta">' +
        '<span>' + esc(u.id + '　' + b.name + '　' + u.type) + '</span>' +
        '<span>月租 ' + esc(A.can(A.role, 'rent') ? fmt.money(t.rent) : A.mask(t.rent, 'rent') + ' 元') + '</span>' +
        '<span>租約到 ' + esc(fmt.date(t.contractEnd)) + '</span>' +
        '<span>' + esc(String(A.mask(t.phone, 'phone'))) + '</span>' +
      '</div>';
  }

  function greeting() {
    var u = D.unit(state.unitId);
    var t = tenantOfSim();
    var b = D.company.buildings[u.building];
    return [
      { from: 'day', text: fmt.date(D.today) },
      { from: 'system', text: '已綁定身分：' + u.id + '　' + t.name },
      { from: 'them', avatar: '中', at: clockText(),
        text: '您好，' + t.name + '。這裡是安居的 AI 客服，我只照公司知識庫回答，' +
          '而且是照您住的 ' + b.name + ' ' + u.id + ' 回答。' }
    ];
  }

  function renderPhone() {
    var u = D.unit(state.unitId);
    var t = tenantOfSim();
    $('#f11-phone').innerHTML = A.phone({
      title: '租務中樞 AI 客服',
      sub: u.id + '　' + t.name,
      avatar: '中',
      time: clockText(),
      placeholder: '輸入訊息',
      messages: greeting()
    });
  }

  function renderAsks() {
    var html = EXTRA.topics.map(function (t) {
      return '<button type="button" class="btn btn--secondary btn--sm" data-ask="' + esc(t.topic) + '">' +
        icon(t.icon) + esc(t.label) + '</button>';
    }).join('');
    html += '<button type="button" class="btn btn--ghost btn--sm" data-ask="' + esc(EXTRA.unknown.topic) + '">' +
      icon(EXTRA.unknown.icon) + esc(EXTRA.unknown.label) + '</button>';
    $('#f11-asks').innerHTML = html;
    $('#f11-sim-note').textContent = '答案直接取自右側知識庫與 ' + state.unitId + ' 的設備資料';
    syncBusy();
  }

  function syncBusy() {
    var btns = document.querySelectorAll('#f11-asks .btn');
    Array.prototype.forEach.call(btns, function (b) { b.disabled = state.busy; });
  }

  function renderBuildingTabs() {
    var tabs = [{ id: 'all', label: '全部' }].concat(BUILDINGS.map(function (c) {
      return { id: c, label: D.company.buildings[c].name };
    }));
    $('#f11-building-tabs').innerHTML = tabs.map(function (t) {
      var on = (state.building === t.id) || (state.building === null && t.id === 'all');
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-building="' + esc(t.id) + '">' +
        '<span>' + esc(t.label) + '</span></button>';
    }).join('');
  }

  function visibleEntries() {
    var kw = state.search.trim();
    return state.entries.filter(function (e) {
      if (state.building !== 'all' && e.building !== state.building) return false;
      if (!kw) return true;
      return (e.q + e.a + e.topic + e.buildingName).indexOf(kw) >= 0;
    });
  }

  function renderKbNote() {
    var html = A.alert('', 'accent', {
      title: 'AI 只依這 ' + state.entries.length + ' 條回答',
      html: '<p>找不到條目就轉人工，不會上網亂猜，也不會自己編一個答案。條目一改，下一通問答立刻照新的回。</p>'
    });
    if (!canEdit()) {
      html += A.alert('目前是「' + A.roleName() + '」視角，可以看條目但不能修改。要改請切換為老闆或租務管理員。', 'warn', { className: 'mt-8' });
    }
    $('#f11-kb-note').innerHTML = html;
    $('#f11-kb-sub').textContent = state.entries.length + ' 條問答，依棟別分組；本月被引用 ' + fmt.num(state.answered) + ' 次';
    var add = $('#f11-add');
    add.disabled = !canEdit();
    add.title = canEdit() ? '' : '目前視角不能修改知識庫';
  }

  function renderKb() {
    var rows = visibleEntries();
    var host = $('#f11-kb-list');
    if (!rows.length) {
      host.innerHTML = A.emptyState({
        icon: 'search',
        title: '找不到符合的條目',
        text: '換個關鍵字，或把這一題新增成問答條目',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="clear-search">清除搜尋</button>'
      });
      return;
    }
    host.innerHTML = rows.map(function (e) {
      return '<article class="f11-entry' + (state.cited === e.id ? ' is-cited' : '') + (e.isNew ? ' is-new' : '') + '" data-entry="' + esc(e.id) + '">' +
        '<h3 class="f11-entry-q">' + A.badge(e.buildingName, 'neutral') + esc(e.q) + '</h3>' +
        '<div class="f11-entry-actions">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-act="edit" data-entry="' + esc(e.id) + '"' + (canEdit() ? '' : ' disabled') + '>' +
          icon('edit') + '編輯</button></div>' +
        '<p class="f11-entry-a">' + esc(e.a) + '</p>' +
        '<div class="f11-entry-meta">' +
          '<span>' + esc(e.topic) + '</span>' +
          '<span>本月引用 ' + fmt.num(e.uses) + ' 次</span>' +
          '<span>更新於 ' + esc(fmt.date(e.updatedAt)) + '</span>' +
          (state.cited === e.id ? '<span>' + esc('剛剛回答就是引用這條') + '</span>' : '') +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderPending() {
    var host = $('#f11-pending');
    if (!state.escalations.length) {
      host.innerHTML = A.emptyState({ sm: true, icon: 'check-circle', title: '沒有轉人工的問題', text: '租客問的每一題，AI 都答得出來' });
      return;
    }
    var order = state.escalations.slice().sort(function (a, b) {
      var rank = { pending: 0, workorder: 1, done: 2 };
      if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
      return a.at < b.at ? 1 : -1;
    });
    var html = order.map(function (e) {
      var badge = e.state === 'pending' ? A.badge('待補答案', 'warn')
        : e.state === 'workorder' ? A.badge('已開工單', 'accent')
        : A.badge('已補上答案', 'ok');
      var action = '';
      if (e.state === 'pending') {
        action = '<button type="button" class="btn btn--secondary btn--sm" data-act="fill" data-esc="' + esc(e.id) + '"' + (canEdit() ? '' : ' disabled') + '>補上答案</button>';
      } else if (e.state === 'workorder') {
        action = '<a class="btn btn--ghost btn--sm" href="' + A.link('f07', 'app') + '">看工單</a>';
      }
      return '<article class="f11-pending-item' + (e.isNew ? ' is-new' : '') + '">' +
        '<div class="f11-pending-q">' + esc(e.q) + '</div>' +
        '<div>' + badge + '</div>' +
        '<div class="f11-pending-meta">' +
          '<span>' + esc(e.unitId + '　' + D.company.buildings[e.building].name) + '</span>' +
          '<span>' + esc(fmt.dateTime(e.at)) + '</span>' +
          '<span>' + esc(e.note) + '</span>' +
        '</div>' +
        (action ? '<div class="f11-pending-act">' + action + '</div>' : '') +
      '</article>';
    }).join('');
    if (!pendingList().length) {
      html += A.alert('沒有等著補答案的問題，租客不用等人回。', 'ok');
    }
    host.innerHTML = html;
  }

  function renderAll() {
    renderKpis();
    renderAlerts();
    renderTenantTabs();
    renderIdentity();
    renderAsks();
    renderBuildingTabs();
    renderKbNote();
    renderKb();
    renderPending();
  }

  /* ================================================================
   * 5. 對話模擬
   * ================================================================ */
  function phoneEl() { return document.querySelector('#f11-phone .phone'); }

  function typeInto(node, text, done) {
    var chars = Array.from(String(text));
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var chat = node.closest('.phone-chat');
    if (reduce || !chars.length) {
      node.textContent = text;
      if (chat) chat.scrollTop = chat.scrollHeight;
      if (done) done();
      return;
    }
    var step = Math.max(1, Math.ceil(chars.length / 46));
    var i = 0;
    var timer = setInterval(function () {
      i = Math.min(chars.length, i + step);
      node.textContent = chars.slice(0, i).join('');
      if (chat) chat.scrollTop = chat.scrollHeight;
      if (i >= chars.length) {
        clearInterval(timer);
        if (done) done();
      }
    }, 28);
  }

  function aiSay(text, done) {
    var phone = phoneEl();
    A.phoneTyping(phone, true);
    setTimeout(function () {
      A.phoneTyping(phone, false);
      var row = A.phoneAppend(phone, { from: 'them', avatar: '中', at: clockText(), html: '<span class="f11-typed"></span>' });
      typeInto(row.querySelector('.f11-typed'), text, done);
    }, 850);
  }

  function ask(topic) {
    if (state.busy) return;
    var unknown = topic === EXTRA.unknown.topic;
    var entry = unknown ? entryOf(D.unit(state.unitId).building, EXTRA.unknown.topic) : entryOf(D.unit(state.unitId).building, topic);
    var meta = unknown ? EXTRA.unknown : EXTRA.topics.filter(function (t) { return t.topic === topic; })[0];
    var question = entry ? entry.q : meta.q;
    var phone = phoneEl();

    state.busy = true;
    syncBusy();
    A.phoneAppend(phone, { from: 'me', text: question, at: tick() });
    state.asked += 1;
    renderKpis();

    if (!entry) {
      aiSay('這題公司知識庫裡還沒有答案。我不會上網亂猜，已經把問題轉給管理員，補好答案會回頭通知您。', function () {
        escalate(question);
        state.busy = false;
        syncBusy();
      });
      return;
    }

    var note = roomNote(entry.topic, state.unitId);
    aiSay(entry.a, function () {
      if (!note) { finishAnswer(entry); return; }
      setTimeout(function () {
        var row = A.phoneAppend(phoneEl(), { from: 'them', avatar: '中', at: clockText(), html: '<span class="f11-typed"></span>' });
        typeInto(row.querySelector('.f11-typed'), note, function () { finishAnswer(entry); });
      }, 350);
    });
  }

  function finishAnswer(entry) {
    A.phoneAppend(phoneEl(), { from: 'system', text: '引用知識庫：' + entry.buildingName + ' · ' + entry.topic });
    entry.uses += 1;
    state.answered += 1;
    state.cited = entry.id;
    state.busy = false;
    renderKpis();
    renderKbNote();
    renderKb();
    syncBusy();
    var node = document.querySelector('.f11-entry[data-entry="' + entry.id + '"]');
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function escalate(question) {
    var u = D.unit(state.unitId);
    state.seq += 1;
    state.escalated += 1;
    state.escalations.forEach(function (e) { e.isNew = false; });
    state.escalations.unshift({
      id: 'ESC-' + state.seq,
      at: D.today + ' ' + clockText(),
      unitId: u.id,
      building: u.building,
      tenantName: tenantOfSim().name,
      q: question,
      topic: EXTRA.unknown.topic,
      state: 'pending',
      note: '知識庫沒有這題，已轉租務管理員',
      isNew: true
    });
    A.toast('已轉人工，待補問答 ' + pendingList().length + ' 題', 'warn', { sub: '補上答案之後，AI 下次就自己回' });
    renderKpis();
    renderAlerts();
    renderPending();
  }

  function resetChat(silent) {
    state.busy = false;
    state.cited = null;
    state.clock = 612;
    renderPhone();
    renderIdentity();
    renderAsks();
    renderKb();
    if (!silent) A.toast('對話已重來', 'neutral');
  }

  function selectTenant(id) {
    if (id === state.unitId) return;
    state.unitId = id;
    state.building = D.unit(id).building;
    state.search = '';
    var box = $('#f11-search');
    if (box) box.value = '';
    renderTenantTabs();
    renderBuildingTabs();
    resetChat(true);
    renderPending();
    A.toast('已切換到 ' + id + ' ' + D.tenantOf(id).name + ' 的對話', 'neutral', { ms: 2000 });
  }

  /* ================================================================
   * 6. 知識庫編輯
   * ================================================================ */
  function answerField(id, label, value, hint) {
    return '<div class="field" data-field="' + esc(id) + '">' +
      '<label for="' + esc(id) + '">' + esc(label) + '</label>' +
      '<textarea class="input textarea" id="' + esc(id) + '" rows="4">' + esc(value || '') + '</textarea>' +
      '<span class="field-hint">' + esc(hint) + '</span></div>';
  }

  function invalid(id, msg) {
    var wrap = document.querySelector('[data-field="' + id + '"]');
    if (!wrap) return;
    wrap.classList.add('is-invalid');
    wrap.querySelector('.field-hint').textContent = msg;
    var input = document.getElementById(id);
    if (input) input.focus();
  }

  function openEdit(entryId) {
    var e = entryById(entryId);
    if (!e || !canEdit()) return;
    var id = 'f11-edit-a';
    A.modal({
      title: '編輯答案',
      body: '<p class="muted small">' + esc(e.buildingName + ' · ' + e.topic + '　本月引用 ' + e.uses + ' 次') + '</p>' +
        answerField(id, e.q, e.a, 'AI 會照這段文字回答，寫得越具體越好'),
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '儲存答案', kind: 'primary', onClick: function () {
          var v = document.getElementById(id).value.trim();
          if (!v) { invalid(id, '答案不能空白，AI 沒有內容可以回'); return false; }
          e.a = v;
          e.updatedAt = D.today;
          A.toast('已更新 ' + e.buildingName + '「' + e.topic + '」的答案', 'ok', { sub: '同一棟的租客下次問就是這個答案' });
          renderKb();
        } }
      ]
    });
  }

  function openAdd(seed) {
    if (!canEdit()) return;
    var qId = 'f11-new-q';
    var aId = 'f11-new-a';
    var bId = 'f11-new-b';
    var building = (seed && seed.building) || state.unitId.charAt(0);
    var question = (seed && seed.q) || '';
    A.modal({
      title: seed ? '補上這題的答案' : '新增問答條目',
      body: (seed ? '<p class="muted small">' + esc(seed.unitId + ' ' + seed.tenantName + ' 於 ' + fmt.dateTime(seed.at) + ' 問的') + '</p>' : '') +
        '<div class="field"><label for="' + bId + '">適用棟別</label>' +
          '<select class="select" id="' + bId + '">' + BUILDINGS.map(function (c) {
            return '<option value="' + c + '"' + (c === building ? ' selected' : '') + '>' + esc(D.company.buildings[c].name) + '</option>';
          }).join('') + '</select>' +
          '<span class="field-hint">每一棟的規定不同，答案分棟存</span></div>' +
        '<div class="field" data-field="' + qId + '"><label for="' + qId + '">租客會怎麼問</label>' +
          '<input class="input" id="' + qId + '" value="' + esc(question) + '" placeholder="例如：可以養貓嗎？">' +
          '<span class="field-hint">寫租客的原話，AI 比對得比較準</span></div>' +
        answerField(aId, '標準答案', '', 'AI 只會照這段文字回答'),
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '加入知識庫', kind: 'primary', onClick: function () {
          var q = document.getElementById(qId).value.trim();
          var a = document.getElementById(aId).value.trim();
          if (!q) { invalid(qId, '請先寫租客會怎麼問'); return false; }
          if (!a) { invalid(aId, '答案不能空白，AI 沒有內容可以回'); return false; }
          var code = document.getElementById(bId).value;
          addEntry(code, seed ? EXTRA.unknown.topic : '其他', q, a);
          if (seed) {
            seed.state = 'done';
            seed.isNew = false;
            seed.note = '已補上答案，' + D.company.buildings[code].name + ' 的租客再問就由 AI 回';
            renderAlerts();
            renderPending();
          }
          A.toast('已加入知識庫，共 ' + state.entries.length + ' 條', 'ok', { sub: D.company.buildings[code].name + ' 的租客再問就由 AI 直接回' });
        } }
      ]
    });
  }

  function addEntry(code, topic, q, a) {
    state.entries.forEach(function (e) { e.isNew = false; });
    var entry = {
      id: code + '-' + topic + '-' + state.entries.length,
      building: code,
      buildingName: D.company.buildings[code].name,
      topic: topic,
      icon: 'help-circle',
      q: q, a: a,
      weight: 1, units: buildingUnits(code),
      uses: 0, updatedAt: D.today, own: true, isNew: true
    };
    state.entries.unshift(entry);
    state.building = code;
    state.search = '';
    var box = $('#f11-search');
    if (box) box.value = '';
    renderBuildingTabs();
    renderKpis();
    renderKbNote();
    renderKb();
    return entry;
  }

  /* ================================================================
   * 7. 事件
   * ================================================================ */
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!(t instanceof Element)) return;

    var simTab = t.closest('#f11-tenant-tabs .tab[data-sim]');
    if (simTab) { selectTenant(simTab.getAttribute('data-sim')); return; }

    var bTab = t.closest('#f11-building-tabs .tab[data-building]');
    if (bTab) { state.building = bTab.getAttribute('data-building'); renderBuildingTabs(); renderKb(); return; }

    var askBtn = t.closest('#f11-asks .btn[data-ask]');
    if (askBtn) { ask(askBtn.getAttribute('data-ask')); return; }

    if (t.closest('#f11-reset')) { resetChat(false); return; }
    if (t.closest('#f11-add')) { openAdd(null); return; }

    var act = t.closest('[data-act]');
    if (!act) return;
    var name = act.getAttribute('data-act');
    if (name === 'edit') { openEdit(act.getAttribute('data-entry')); return; }
    if (name === 'clear-search') {
      state.search = '';
      var box = $('#f11-search');
      if (box) box.value = '';
      renderKb();
      return;
    }
    if (name === 'go-pending') {
      var card = document.getElementById('f11-escalation');
      if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (name === 'fill') {
      var id = act.getAttribute('data-esc');
      var esc2 = null;
      state.escalations.forEach(function (e) { if (e.id === id) esc2 = e; });
      if (esc2) openAdd(esc2);
      return;
    }
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t instanceof Element && t.id === 'f11-search') { state.search = t.value; renderKb(); }
    if (t instanceof Element && t.closest('.field.is-invalid')) { t.closest('.field').classList.remove('is-invalid'); }
  });

  A.onRole(function () { renderAll(); });

  renderAll();
  renderPhone();
})();
