/* js/app/f10.js — 租客 LINE 自助中心（f10）進系統操作頁
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）、§6.1（檔案所有權）。
 * 資料：一律讀 window.DB；基礎層沒有的欄位（公告、回覆腳本、示範單號）放在本檔的 EXTRA。
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

  /* 示範主角：A01 王○○（DESIGN.md §5 故事數字） */
  var UNIT = D.unit('A01');
  var TENANT = D.tenantOf('A01');
  var BUILDING = D.company.buildings[UNIT.building];
  var HEATER = D.equipmentOf(UNIT.id).filter(function (e) { return e.kind === '熱水器'; })[0];
  var UTIL = (function () {
    var rows = (D.utilityOf(UNIT.id) || { rows: [] }).rows;
    return rows[rows.length - 1] || { water: 0, elec: 0 };
  })();

  /* ================================================================
   * 1. 基礎層沒有的資料（只在本檔補，不改 data.js）
   * ================================================================ */
  var EXTRA = {
    /* 綁定用的手機末三碼，取自租客電話（0917-***-473 → 473） */
    code: String(TENANT.phone).slice(-3),

    /* 本月 LINE 服務量：自助完成 ＋ 需人工回覆 */
    selfDone: 412,
    needHuman: 28,

    /* A 棟目前唯一一則公告 */
    notice: {
      title: BUILDING.name + ' · 水塔清洗暫停供水',
      lines: ['時間：2026/09/25 09:00 至 12:00', '期間暫停供水，請提前儲水', '電梯與門禁正常運作']
    },

    /* 報修分類（AI 判斷後對應的派工類別） */
    repairKinds: [
      { key: 'heater', label: '熱水器', category: '水電', item: '熱水器檢修', desc: '洗澡洗到一半忽冷忽熱' },
      { key: 'aircon', label: '冷氣', category: '冷氣', item: '冷氣檢修', desc: '冷氣不冷，出風有異味' },
      { key: 'water', label: '水電', category: '水電', item: '排水管疏通', desc: '浴室排水變慢' },
      { key: 'other', label: '其他', category: '水電', item: '雜項小修', desc: '門把鬆了轉不動' }
    ],

    /* 這次示範會開出的單號（接在 data.js 最後一張 WO-1053 之後） */
    woId: 'WO-1054',
    taskId: 'TD-2044',
    moveoutDocId: 'DOC-1183',

    /* 退租通知後的點交安排（比照 B15：通知後約 30 天點交） */
    moveOutAt: '2026-10-21',
    handoverAt: '2026-10-21 14:00',

    photo: '../assets/f10-photo-heater.svg',
    inviteRoles: ['boss', 'manager']
  };

  var MENU_DESC = {
    bill: '這個月要繳多少、繳到哪一天',
    paid: '已繳還是未繳，還欠多少',
    lease: '租到哪一天、還剩幾天',
    repair: '拍張照說一句，系統直接開工單',
    renew: '送出續租意願，管理員接手',
    moveout: '送出退租通知並排點交',
    handover: '點交幾點、要帶哪些東西',
    notice: '這一棟目前的公告',
    support: '問題轉給管理員回覆'
  };

  var TAB_LABEL = { all: '全部', bound: '已綁定', unbound: '待綁定', invited: '已發邀請' };

  /* ================================================================
   * 2. 狀態（記憶體；重新整理即回到初始）
   * ================================================================ */
  var state = null;

  function initState() {
    state = {
      stage: 'friend',          /* friend 未加好友 → bind 待綁定 → ready 已綁定 */
      msgs: [],
      typing: false,
      bindValue: '',
      bindError: '',
      log: [],
      docs: [],
      moveout: false,
      selfDone: EXTRA.selfDone,
      needHuman: EXTRA.needHuman,
      invited: {},
      tab: 'unbound',
      building: '全部',
      clockMin: 0,
      busy: false
    };
    state.msgs = [
      { from: 'day', text: '今天 · ' + fmt.date(D.today) },
      { from: 'them', avatar: '安', html: OA_HTML, buttons: [{ label: '加入好友', action: 'add-friend' }] }
    ];
  }

  var OA_HTML = '<div class="f10-oa">' +
    '<span class="f10-oa-logo">' + icon('building') + '</span>' +
    '<strong>' + esc(D.company.name) + '</strong>' +
    '<p>' + esc(D.company.system) + ' · 官方帳號</p>' +
    '<ul>' +
      '<li>' + icon('check') + '綁定房號後，帳單與租約自己查</li>' +
      '<li>' + icon('check') + '報修拍張照就送出，不用打電話</li>' +
      '<li>' + icon('check') + '續租、退租、點交都在這裡完成</li>' +
    '</ul></div>';

  var WELCOME = [
    '歡迎加入' + D.company.name + '。這裡可以查帳單、報修、續租與退租。',
    '請先綁定身分：輸入房號與手機末三碼，中間空一格。綁定後只看得到您自己那一間的資料。'
  ];

  /* 示範用時鐘：從 09:41 開始，每則訊息加 1 分鐘 */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clockTime() {
    var m = 9 * 60 + 41 + state.clockMin;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
  }
  function clockStamp() { return D.today + ' ' + clockTime(); }
  function tick() { state.clockMin += 1; return clockTime(); }

  /* ================================================================
   * 3. 租客綁定清單（公司端）
   * ================================================================ */
  function tenantRows() {
    return D.tenants.map(function (t) {
      var u = D.unit(t.unitId);
      return {
        tid: t.id,
        unitId: t.unitId,
        name: t.name,
        building: u ? D.company.buildings[u.building].name : '—',
        buildingCode: u ? u.building : '',
        bound: !!t.lineBound,
        paid: t.paid,
        phone: t.phone,
        rent: t.rent
      };
    });
  }
  var ALL_ROWS = tenantRows();

  function bucketOf(r) {
    if (r.bound) return 'bound';
    return state.invited[r.tid] ? 'invited' : 'unbound';
  }
  function countOf(tab) {
    return ALL_ROWS.filter(function (r) { return tab === 'all' || bucketOf(r) === tab; }).length;
  }
  function visibleRows() {
    return ALL_ROWS.filter(function (r) {
      if (state.tab !== 'all' && bucketOf(r) !== state.tab) return false;
      if (state.building !== '全部' && r.buildingCode !== state.building) return false;
      return true;
    });
  }
  function canInvite() { return EXTRA.inviteRoles.indexOf(A.role) >= 0; }

  /* ================================================================
   * 4. 渲染
   * ================================================================ */
  function renderAll() {
    renderKpis();
    renderAlerts();
    renderWho();
    renderPhone();
    renderStageHint();
    renderLog();
    renderDocs();
    renderTabs();
    renderBuildingSelect();
    renderTable();
    renderRoleNote();
    renderMenuGrid();
  }

  function renderKpis() {
    var bound = countOf('bound');
    var total = ALL_ROWS.length;
    var waiting = countOf('unbound');
    var handled = state.selfDone + state.needHuman;
    var rate = Math.round((bound / total) * 100);
    var selfRate = Math.round((state.selfDone / handled) * 100);
    document.getElementById('f10-kpis').innerHTML =
      A.kpi({ label: '已綁定 LINE', icon: 'user-check', value: bound, unit: '／ ' + total + ' 位', hint: '綁定率 ' + rate + '%' }) +
      A.kpi({ label: '待綁定', icon: 'user', value: waiting, unit: '位', kind: waiting ? 'warn' : 'ok', hint: waiting ? '發邀請請他們完成綁定' : '全部租客都綁定了' }) +
      A.kpi({ label: '本月自助完成', icon: 'sparkles', value: state.selfDone, unit: '件', kind: 'ok', hint: '佔 ' + fmt.num(handled) + ' 件的 ' + selfRate + '%' }) +
      A.kpi({ label: '需人工回覆', icon: 'message', value: state.needHuman, unit: '件', hint: '佔 ' + fmt.num(handled) + ' 件的 ' + (100 - selfRate) + '%' });
  }

  function renderAlerts() {
    var host = document.getElementById('f10-alerts');
    var out = '';
    if (state.stage !== 'ready') {
      out += A.alert('', 'accent', {
        title: '這一頁怎麼看',
        html: '<p>左邊是租客手機上的 LINE。先點「加入好友」，輸入 ' + esc(UNIT.id + ' ' + EXTRA.code) +
          ' 完成綁定，就能點圖文選單查帳單、報修。右邊會同步長出紀錄與單據。</p>'
      });
    }
    if (state.moveout) {
      out += A.alert('', 'warn', {
        title: UNIT.id + ' 已送出退租通知',
        html: '<p>系統已把 ' + esc(UNIT.id) + ' 列入即將空房，點交時間 ' + esc(fmt.dateTime(EXTRA.handoverAt)) +
          '。招租流程可以提前開始，少空一天就是少賠一天。</p>',
        action: '<a class="btn btn--secondary btn--sm" href="' + esc(A.link('f03', 'app')) + '">看空房招租漏斗</a>'
      });
    }
    host.innerHTML = out;
  }

  function renderWho() {
    var bound = state.stage === 'ready';
    document.getElementById('f10-phone-who').innerHTML =
      '<span>' + esc(BUILDING.name + ' ' + UNIT.id) + '</span>' +
      '<span>' + esc(UNIT.region + ' · ' + UNIT.type + ' ' + fmt.ping(UNIT.ping)) + '</span>' +
      '<span>月租 ' + esc(A.can(A.role, 'rent') ? fmt.money(UNIT.rent) : '•••• 元') + '</span>' +
      '<span>' + A.badge(bound ? 'LINE 已綁定' : 'LINE 待綁定', bound ? 'ok' : 'neutral') + '</span>';
  }

  function renderStageHint() {
    var hint = {
      friend: '第 1 步：點手機裡的「加入好友」',
      bind: '第 2 步：輸入 ' + UNIT.id + ' ' + EXTRA.code + ' 送出',
      ready: '第 3 步：點下方圖文選單任一項'
    }[state.stage];
    document.getElementById('f10-stage-hint').textContent = hint;
  }

  function renderPhone() {
    var host = document.getElementById('f10-phone');
    var opts = {
      title: D.company.name,
      sub: state.stage === 'ready' ? '已綁定 ' + UNIT.id : '官方帳號',
      avatar: '安',
      time: clockTime(),
      messages: state.msgs,
      typing: state.typing,
      input: false
    };
    if (state.stage === 'ready') {
      opts.menu = D.lineMenu.map(function (m) { return { label: m.name, action: m.key, icon: m.icon }; });
    }
    host.innerHTML = A.phone(opts);
    if (state.stage === 'bind') {
      var screen = host.querySelector('.phone-screen');
      screen.insertAdjacentHTML('beforeend',
        '<div class="f10-bind">' +
          '<div class="f10-bind-row">' +
            '<input class="input" type="text" id="f10-bind-input" autocomplete="off" ' +
              'placeholder="房號 手機末三碼" aria-label="房號與手機末三碼" value="' + esc(state.bindValue) + '">' +
            '<button type="button" class="f10-bind-send" id="f10-bind-send" aria-label="送出綁定"' +
              (state.bindValue.trim() ? '' : ' disabled') + '>' + icon('send') + '</button>' +
          '</div>' +
          '<p class="f10-bind-hint' + (state.bindError ? ' is-error' : '') + '" id="f10-bind-hint">' +
            esc(state.bindError || ('示範資料：' + UNIT.id + ' ' + EXTRA.code)) + '</p>' +
        '</div>');
    }
    var chat = host.querySelector('.phone-chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  function renderLog() {
    var host = document.getElementById('f10-log');
    if (!state.log.length) {
      host.innerHTML = A.emptyState({
        sm: true, icon: 'history', title: '還沒有互動',
        text: '在左邊手機完成綁定、點一個選單項目，這裡就會即時長出紀錄。'
      });
      return;
    }
    host.innerHTML = A.timeline(state.log.slice().reverse());
  }

  function renderDocs() {
    var host = document.getElementById('f10-docs');
    if (!state.docs.length) {
      host.innerHTML = A.emptyState({
        sm: true, icon: 'file-plus', title: '還沒有單據',
        text: '租客點「報修」「續租」或「退租」，系統會自動開好單，不用人再登一次。'
      });
      return;
    }
    host.innerHTML = state.docs.map(function (d) {
      return '<div class="f10-doc">' +
        '<span class="f10-doc-icon">' + icon(d.icon) + '</span>' +
        '<div class="f10-doc-head"><span class="f10-doc-title">' + esc(d.title) + '</span>' + A.badge(d.badge, d.badgeKind) + '</div>' +
        '<div class="f10-doc-sub">' + esc(d.sub) + '</div>' +
        '<div class="f10-doc-foot">' + d.foot.map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('') + '</div>' +
        '</div>';
    }).join('');
  }

  function renderTabs() {
    document.getElementById('f10-tabs').innerHTML = ['all', 'bound', 'unbound', 'invited'].map(function (k) {
      var on = state.tab === k;
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-tab="' + k + '">' +
        '<span>' + esc(TAB_LABEL[k]) + '</span>' + A.badge(countOf(k), on ? 'accent' : 'neutral') + '</button>';
    }).join('');
  }

  function renderBuildingSelect() {
    var sel = document.getElementById('f10-building');
    var codes = Object.keys(D.company.buildings);
    sel.innerHTML = ['<option value="全部">全部棟別</option>'].concat(codes.map(function (c) {
      return '<option value="' + c + '"' + (state.building === c ? ' selected' : '') + '>' + esc(D.company.buildings[c].name) + '</option>';
    })).join('');
  }

  function emptyFor() {
    if (state.building !== '全部') {
      return { icon: 'search', title: '這棟沒有符合的租客', text: '換一個棟別，或把篩選改成「全部棟別」。' };
    }
    if (state.tab === 'invited') {
      return { icon: 'send', title: '還沒有發出邀請', text: '切到「待綁定」挑租客送出邀請，或按頁面右上角的「發送綁定邀請」。' };
    }
    if (state.tab === 'unbound') {
      return { icon: 'check-circle', title: '沒有待綁定的租客', text: '邀請都發出去了，切到「已發邀請」追回覆狀況。' };
    }
    return { icon: 'inbox', title: '沒有符合的租客', text: '換一個分頁或棟別再看看。' };
  }

  function paidBadge(p) {
    return A.badge(p, p === '已繳' ? 'ok' : (p === '逾期' ? 'danger' : 'warn'));
  }

  function renderTable() {
    document.getElementById('f10-table').innerHTML = A.table({
      id: 'f10-tenants',
      sortable: true,
      sortKey: 'unitId',
      rows: visibleRows(),
      empty: emptyFor(),
      columns: [
        { key: 'unitId', label: '房號', primary: true },
        { key: 'name', label: '租客' },
        { key: 'building', label: '棟別' },
        {
          key: 'bound', label: 'LINE 狀態',
          sortValue: function (r) { return bucketOf(r); },
          render: function (r) {
            var b = bucketOf(r);
            return A.badge(b === 'bound' ? '已綁定' : (b === 'invited' ? '已發邀請' : '待綁定'),
              b === 'bound' ? 'ok' : (b === 'invited' ? 'accent' : 'neutral'));
          }
        },
        { key: 'paid', label: '本月繳費', render: function (r) { return paidBadge(r.paid); } },
        { key: 'phone', label: '聯絡電話', render: function (r) { return esc(A.mask(r.phone, 'phone')); } },
        {
          key: 'act', label: '動作', sortable: false, align: 'center',
          render: function (r) {
            if (r.bound) return '<span class="muted-2">—</span>';
            if (state.invited[r.tid]) return '<span class="muted-2">已於 09/21 送出</span>';
            return '<button type="button" class="btn btn--secondary btn--sm" data-act="invite" data-tid="' + esc(r.tid) + '"' +
              (canInvite() ? '' : ' disabled') + '>發送綁定邀請</button>';
          }
        }
      ]
    });
  }

  function renderRoleNote() {
    var parts = ['目前是「' + A.roleName() + '」視角'];
    parts.push(canInvite() ? '可以發送綁定邀請' : '只能檢視，不能發送綁定邀請');
    if (!A.can(A.role, 'phone')) parts.push('聯絡電話已依權限打碼');
    document.getElementById('f10-role-note').innerHTML = icon('shield') + '<span>' + esc(parts.join('，') + '。') + '</span>';
  }

  function renderMenuGrid() {
    var on = state.stage === 'ready';
    document.getElementById('f10-menu-grid').innerHTML = D.lineMenu.map(function (m) {
      return '<button type="button" class="f10-menu-btn" data-act="menu" data-key="' + esc(m.key) + '"' +
        (on ? '' : ' disabled title="綁定後才能使用圖文選單"') + '>' +
        '<span class="icon-circle icon-circle--neutral">' + icon(m.icon) + '</span>' +
        '<span class="f10-menu-name">' + esc(m.name) + '</span>' +
        '<span class="f10-menu-desc">' + esc(MENU_DESC[m.key]) + '</span>' +
        '</button>';
    }).join('');
  }

  /* ================================================================
   * 5. 對話流程
   * ================================================================ */
  function push(msg) {
    msg.at = tick();
    state.msgs.push(msg);
  }
  function consume(action) {
    state.msgs.forEach(function (m) {
      if (!m.buttons) return;
      var hit = m.buttons.some(function (b) { return (b.action || b.label) === action; });
      if (hit) delete m.buttons;
    });
  }
  function logAdd(title, text, kind) {
    state.log.push({ at: clockStamp(), title: title, text: text, kind: kind || 'accent' });
  }

  /* ---- 回覆訊息（handler 與示範連結共用，確保兩邊內容一致） ---- */
  function boundMsg() {
    return {
      from: 'them', avatar: '安',
      text: '綁定成功。您是 ' + UNIT.id + ' 的房客 ' + TENANT.name + '。',
      card: {
        title: BUILDING.name + ' ' + UNIT.id + ' · ' + UNIT.type,
        lines: [
          '租期 ' + fmt.date(UNIT.downstream.start) + ' 至 ' + fmt.date(UNIT.downstream.end),
          '月租 ' + fmt.money(TENANT.rent) + '　押金 ' + fmt.money(TENANT.deposit),
          '下面九個選單都可以直接點'
        ]
      }
    };
  }
  function billMsgs() {
    return [{
      text: '2026 年 9 月的帳單如下。',
      card: {
        title: UNIT.id + ' · 2026 年 9 月',
        lines: [
          '月租金 ' + fmt.money(TENANT.rent) + '　狀態：已繳',
          '繳費日 ' + fmt.date(TENANT.paidAt),
          '押金 ' + fmt.money(TENANT.deposit) + '（持有中）',
          '本月用水 ' + UTIL.water + ' 度、用電 ' + UTIL.elec + ' 度'
        ]
      }
    }, { text: '下一期請在 10 月 5 日前繳款，繳完系統會自動更新，不用傳收據。' }];
  }
  function photoMsg(k) {
    return {
      from: 'me', read: true,
      html: '<span>' + esc(k.desc) + '</span>' +
        '<img class="f10-shot" src="' + esc(EXTRA.photo) + '" alt="租客拍的' + esc(k.label) + '照片">' +
        '<span class="f10-bubble-note">已附照片 1 張</span>'
    };
  }
  function acceptMsg(k) {
    return {
      from: 'them', avatar: '安',
      text: '已收到報修，工單 ' + EXTRA.woId + ' 已建立。',
      card: {
        title: EXTRA.woId + ' · ' + k.item,
        lines: [
          'AI 判斷類別：' + k.category,
          '設備：' + HEATER.brand + ' ' + HEATER.model + '（' + fmt.month(HEATER.purchased.slice(0, 7)) + ' 購入）',
          '今天下午廠商會用這個 LINE 跟您約時間'
        ]
      }
    };
  }
  function repairDoc(k) {
    return {
      icon: 'wrench', title: EXTRA.woId + ' ' + k.item, badge: '待派工', badgeKind: 'warn',
      sub: UNIT.id + ' · 來源：租客 LINE 報修 · 附照片 1 張',
      foot: ['AI 判斷類別：' + k.category, '建立時間 ' + fmt.dateTime(clockStamp()), '設備 ' + HEATER.brand + ' ' + HEATER.model]
    };
  }
  function moveoutMsg() {
    return {
      from: 'them', avatar: '安',
      text: '已收到退租通知。',
      card: {
        title: '退租通知 ' + EXTRA.moveoutDocId,
        lines: [
          '退租日 ' + fmt.date(EXTRA.moveOutAt),
          '點交時間 ' + fmt.dateTime(EXTRA.handoverAt),
          '點交前請備齊鑰匙 ' + UNIT.keys.key + ' 支、磁扣 ' + UNIT.keys.card + ' 張',
          '押金 ' + fmt.money(TENANT.deposit) + ' 於點交後 7 天內結算退還'
        ]
      }
    };
  }
  function moveoutDoc() {
    return {
      icon: 'doc', title: EXTRA.moveoutDocId + ' 退租確認書', badge: '待簽署', badgeKind: 'accent',
      sub: UNIT.id + ' · ' + TENANT.name + ' · 來源：租客 LINE 退租',
      foot: ['退租日 ' + fmt.date(EXTRA.moveOutAt), '點交 ' + fmt.dateTime(EXTRA.handoverAt), '已同步到空房招租漏斗']
    };
  }

  /* 租客說一句 → 打字中 → 官方帳號回覆 */
  function exchange(meText, replies, after) {
    if (state.busy) return;
    state.busy = true;
    if (meText) push({ from: 'me', text: meText, read: true });
    state.typing = true;
    renderPhone();
    setTimeout(function () {
      state.typing = false;
      (replies || []).forEach(function (r) { push(Object.assign({ from: 'them', avatar: '安' }, r)); });
      state.busy = false;
      if (typeof after === 'function') after();
      renderAll();
    }, 900);
  }

  function addFriend() {
    consume('add-friend');
    state.stage = 'bind';
    exchange(null, WELCOME.map(function (t) { return { text: t }; }), function () {
      logAdd('租客加入官方帳號', '系統發出綁定引導訊息。', 'accent');
    });
  }

  function submitBind() {
    var raw = String(state.bindValue || '').replace(/\s+/g, '').toUpperCase();
    var ok = raw === (UNIT.id + EXTRA.code);
    push({ from: 'me', text: state.bindValue.trim(), read: true });
    if (!ok) {
      state.bindError = '查不到這組房號與末三碼，請再確認。示範資料是 ' + UNIT.id + ' ' + EXTRA.code;
      state.bindValue = '';
      state.typing = true;
      renderPhone();
      setTimeout(function () {
        state.typing = false;
        push({ from: 'them', avatar: '安', text: '查不到這組房號與手機末三碼。請確認後再輸入一次，或回覆「客服」由管理員協助。' });
        renderAll();
        A.toast('綁定失敗，房號與末三碼對不起來', 'danger');
      }, 800);
      return;
    }
    state.bindError = '';
    state.bindValue = '';
    state.stage = 'ready';
    state.typing = true;
    renderPhone();
    setTimeout(function () {
      state.typing = false;
      push(boundMsg());
      logAdd('綁定成功：' + UNIT.id + ' ' + TENANT.name, '系統認得這位租客，之後每一句話都對得到房號。', 'ok');
      renderAll();
      A.toast('已綁定 ' + UNIT.id + ' 的房客 ' + TENANT.name, 'ok');
    }, 900);
  }

  /* ---- 九個選單項目的回覆 ---- */
  function menuAction(key) {
    var item = D.lineMenu.filter(function (m) { return m.key === key; })[0];
    if (!item || state.stage !== 'ready' || state.busy) return;
    var handler = ANSWER[key];
    if (handler) handler(item);
  }

  function selfServed(title, text) {
    state.selfDone += 1;
    logAdd(title, text, 'ok');
  }

  var ANSWER = {
    bill: function (item) {
      exchange(item.name, billMsgs(),
      function () { selfServed('租客查本月帳單', '9 月租金 ' + fmt.money(TENANT.rent) + '，已繳，客服不用接這通電話。'); });
    },

    paid: function (item) {
      exchange(item.name, [{
        text: '本月租金已繳，目前沒有欠款。',
        card: {
          title: '繳費狀態',
          lines: [
            '2026 年 9 月　' + fmt.money(TENANT.rent) + '　已繳（' + fmt.date(TENANT.paidAt) + '）',
            '目前欠款 0 元',
            '已連續 ' + TENANT.renewals + ' 次續約，繳款紀錄正常'
          ]
        }
      }], function () { selfServed('租客查繳費狀態', '顯示已繳、欠款 0 元。'); });
    },

    lease: function (item) {
      var left = A.daysBetween(A.today, UNIT.downstream.end);
      exchange(item.name, [{
        text: '您的租約到 ' + fmt.date(UNIT.downstream.end) + '，還有 ' + fmt.num(left) + ' 天。',
        card: {
          title: '下游租約',
          lines: [
            '租期 ' + fmt.date(UNIT.downstream.start) + ' 至 ' + fmt.date(UNIT.downstream.end),
            '已續約 ' + TENANT.renewals + ' 次',
            '想續租請點選單的「續租」'
          ]
        }
      }], function () { selfServed('租客查租約到期日', '租約到 ' + fmt.date(UNIT.downstream.end) + '，還有 ' + fmt.num(left) + ' 天。'); });
    },

    repair: function (item) {
      exchange(item.name, [{
        text: '請問是哪一類問題？點一下最接近的就好。',
        buttons: EXTRA.repairKinds.map(function (k) { return { label: k.label, action: 'rk:' + k.key }; })
      }]);
    },

    renew: function (item) {
      exchange(item.name, [{
        text: '已收到續租意願，管理員會接手處理。',
        card: {
          title: '續租申請',
          lines: [
            '目前租約到 ' + fmt.date(UNIT.downstream.end),
            '租務管理員 ' + D.staffById('S02').name + ' 會在 3 個工作天內送出續約書',
            '續約書會直接發到這個 LINE 簽'
          ]
        }
      }], function () {
        addDoc({
          icon: 'refresh', title: EXTRA.taskId + ' 續約書待處理', badge: '待處理', badgeKind: 'warn',
          sub: UNIT.id + ' · ' + TENANT.name + ' · 來源：租客 LINE 續租',
          foot: ['負責人 ' + D.staffById('S02').name, '期限 ' + fmt.date(A.addDays(D.today, 3)), '租約到期 ' + fmt.date(UNIT.downstream.end)]
        });
        selfServed('租客送出續租意願', '系統自動建立續約待辦 ' + EXTRA.taskId + '，管理員不用再登一次。');
        A.toast('已建立續約待辦 ' + EXTRA.taskId, 'ok');
      });
    },

    moveout: function (item) {
      exchange(item.name, [{
        text: '退租要提前 1 個月通知。確定要送出退租通知嗎？送出後管理員會與您確認點交時間。',
        buttons: [{ label: '確定送出', action: 'mo:yes' }, { label: '再想想', action: 'mo:no' }]
      }]);
    },

    handover: function (item) {
      if (!state.moveout) {
        exchange(item.name, [
          { text: '目前沒有安排點交，您的租約還在效期內。' },
          { text: '要退租的話，點選單的「退租」送出通知，系統就會排點交時間。' }
        ], function () { selfServed('租客查點交時間', '目前沒有點交安排，系統直接說明下一步。'); });
        return;
      }
      exchange(item.name, [{
        text: '點交時間是 ' + fmt.dateTime(EXTRA.handoverAt) + '。',
        card: {
          title: '點交安排',
          lines: [
            '時間 ' + fmt.dateTime(EXTRA.handoverAt),
            '地點 ' + BUILDING.address + ' ' + UNIT.id,
            '請備齊鑰匙 ' + UNIT.keys.key + ' 支、磁扣 ' + UNIT.keys.card + ' 張、遙控器 ' + UNIT.keys.remote + ' 個',
            '押金 ' + fmt.money(TENANT.deposit) + '於點交後 7 天內結算'
          ]
        }
      }], function () { selfServed('租客查點交時間', '回覆 ' + fmt.dateTime(EXTRA.handoverAt) + ' 與要帶的物品。'); });
    },

    notice: function (item) {
      exchange(item.name, [{
        text: BUILDING.name + ' 目前有 1 則公告。',
        card: { title: EXTRA.notice.title, lines: EXTRA.notice.lines }
      }], function () { selfServed('租客查公告', '只推播這位租客所在的 ' + BUILDING.name + '，不打擾其他棟。'); });
    },

    support: function (item) {
      exchange(item.name, [{
        text: '已轉給租務管理員 ' + D.staffById('S02').name + '，今天 18:00 前會回覆您。',
        card: {
          title: '轉人工客服',
          lines: ['對象 ' + UNIT.id + ' ' + TENANT.name, '承接人 ' + D.staffById('S02').name, '回覆期限 今天 18:00']
        }
      }], function () {
        state.needHuman += 1;
        logAdd('轉人工客服', '這一題 AI 沒把握，直接轉給管理員 ' + D.staffById('S02').name + '，不讓租客空等。', 'warn');
        A.toast('已轉給租務管理員 ' + D.staffById('S02').name, 'neutral');
      });
    }
  };

  /* ---- 報修子流程：選類別 → 附照片 → 受理 ---- */
  function repairKind(key) {
    var k = EXTRA.repairKinds.filter(function (x) { return x.key === key; })[0];
    if (!k) return;
    consume('rk:' + key);
    state.repairKind = k;
    exchange(k.label, [{
      text: '了解。方便拍一張照片嗎？看得到狀況才好派對廠商，也少跑一趟。',
      buttons: [{ label: '拍照上傳', action: 'rp:photo' }]
    }]);
  }

  function repairPhoto() {
    var k = state.repairKind || EXTRA.repairKinds[0];
    if (state.busy) return;
    state.busy = true;
    consume('rp:photo');
    push(photoMsg(k));
    state.typing = true;
    renderPhone();
    setTimeout(function () {
      state.typing = false;
      push(acceptMsg(k));
      addDoc(repairDoc(k));
      selfServed('租客拍照報修', '系統自動開出工單 ' + EXTRA.woId + '，AI 判類別為' + k.category + '，管理員不用再問一輪。');
      state.busy = false;
      renderAll();
      A.toast('已建立工單 ' + EXTRA.woId, 'ok', { sub: '類別 ' + k.category + '，等待派工' });
    }, 1000);
  }

  /* ---- 退租子流程 ---- */
  function moveoutYes() {
    consume('mo:yes');
    exchange('確定送出', [moveoutMsg()], function () {
      state.moveout = true;
      addDoc(moveoutDoc());
      selfServed('租客送出退租通知', UNIT.id + ' 已列入即將空房，招租可以提前一個月開始。');
      A.toast(UNIT.id + ' 已列入即將空房', 'warn', { sub: '點交 ' + fmt.dateTime(EXTRA.handoverAt) });
    });
  }
  function moveoutNo() {
    consume('mo:no');
    exchange('再想想', [{ text: '好的，沒有送出退租通知，租約維持到 ' + fmt.date(UNIT.downstream.end) + '。' }],
      function () { selfServed('租客取消退租', '沒有送出通知，租約維持原狀。'); });
  }

  function addDoc(d) {
    if (state.docs.some(function (x) { return x.title === d.title; })) return;
    state.docs.unshift(d);
  }

  /* ================================================================
   * 6. 公司端動作
   * ================================================================ */
  function invite(tid) {
    if (!canInvite()) { A.toast('這個視角不能發送綁定邀請', 'warn'); return; }
    var row = ALL_ROWS.filter(function (r) { return r.tid === tid; })[0];
    if (!row || row.bound || state.invited[tid]) return;
    state.invited[tid] = true;
    renderKpis(); renderTabs(); renderTable();
    A.toast('已發出綁定邀請給 ' + row.unitId + ' ' + row.name, 'ok');
  }

  function inviteAll() {
    if (!canInvite()) { A.toast('這個視角不能發送綁定邀請', 'warn'); return; }
    var pending = ALL_ROWS.filter(function (r) { return bucketOf(r) === 'unbound'; });
    if (!pending.length) { A.toast('目前沒有待綁定的租客', 'neutral'); return; }
    A.confirm({
      title: '發送綁定邀請給 ' + pending.length + ' 位租客？',
      body: '<p>系統會用簡訊把綁定連結送給還沒綁定 LINE 的租客。同一位租客 7 天內只會收到一次。</p>' +
        A.statRow(['A', 'B', 'C', 'D', 'E'].map(function (c) {
          return { label: D.company.buildings[c].name, value: pending.filter(function (r) { return r.buildingCode === c; }).length, unit: '位' };
        }), { sm: true, divided: true }),
      confirmLabel: '發送邀請'
    }).then(function (yes) {
      if (!yes) return;
      pending.forEach(function (r) { state.invited[r.tid] = true; });
      state.tab = 'invited';
      renderAll();
      A.toast('已發出 ' + pending.length + ' 封綁定邀請', 'ok', { sub: '回覆狀況在「已發邀請」分頁追蹤' });
    });
  }

  function reset() {
    initState();
    renderAll();
    A.toast('已回到示範開頭', 'neutral');
  }

  /* ================================================================
   * 7. 事件
   * ================================================================ */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var bubbleBtn = t.closest('[data-bubble-action]');
    if (bubbleBtn) {
      var act = bubbleBtn.getAttribute('data-bubble-action');
      if (act === 'add-friend') { addFriend(); return; }
      if (act.indexOf('rk:') === 0) { repairKind(act.slice(3)); return; }
      if (act === 'rp:photo') { repairPhoto(); return; }
      if (act === 'mo:yes') { moveoutYes(); return; }
      if (act === 'mo:no') { moveoutNo(); return; }
      return;
    }

    var menuBtn = t.closest('[data-phone-menu]');
    if (menuBtn) { menuAction(menuBtn.getAttribute('data-phone-menu')); return; }

    var actBtn = t.closest('[data-act]');
    if (actBtn) {
      var a = actBtn.getAttribute('data-act');
      if (a === 'menu') { menuAction(actBtn.getAttribute('data-key')); return; }
      if (a === 'invite') { invite(actBtn.getAttribute('data-tid')); return; }
      return;
    }

    if (t.closest('#f10-bind-send')) { submitBind(); return; }
    if (t.closest('#f10-invite-all')) { inviteAll(); return; }
    if (t.closest('#f10-reset')) { reset(); return; }

    var tab = t.closest('#f10-tabs .tab[data-tab]');
    if (tab) { state.tab = tab.getAttribute('data-tab'); renderTable(); }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!(t instanceof Element) || t.id !== 'f10-bind-input') return;
    state.bindValue = t.value;
    var send = document.getElementById('f10-bind-send');
    if (send) send.disabled = !t.value.trim();
    var hint = document.getElementById('f10-bind-hint');
    if (hint && state.bindError) {
      state.bindError = '';
      hint.className = 'f10-bind-hint';
      hint.textContent = '示範資料：' + UNIT.id + ' ' + EXTRA.code;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target instanceof Element && e.target.id === 'f10-bind-input') {
      e.preventDefault();
      if (state.bindValue.trim()) submitBind();
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t instanceof Element && t.id === 'f10-building') { state.building = t.value; renderTable(); }
  });

  A.onRole(function () { renderWho(); renderTable(); renderRoleNote(); });

  /* 直接看某個階段：網址加 #stage=ready（已綁定）或 #stage=done（跑完一輪），供截圖與分享用 */
  function seed(level) {
    state.stage = 'ready';
    state.msgs = [
      { from: 'day', text: '今天 · ' + fmt.date(D.today) },
      { from: 'them', avatar: '安', html: OA_HTML }
    ];
    WELCOME.forEach(function (t) { push({ from: 'them', avatar: '安', text: t }); });
    push({ from: 'me', read: true, text: UNIT.id + ' ' + EXTRA.code });
    push(boundMsg());
    logAdd('租客加入官方帳號', '系統發出綁定引導訊息。', 'accent');
    logAdd('綁定成功：' + UNIT.id + ' ' + TENANT.name, '系統認得這位租客，之後每一句話都對得到房號。', 'ok');
    if (level !== 'done') return;

    var k = EXTRA.repairKinds[0];
    push({ from: 'me', read: true, text: '本月帳單' });
    billMsgs().forEach(function (r) { push(Object.assign({ from: 'them', avatar: '安' }, r)); });
    selfServed('租客查本月帳單', '9 月租金 ' + fmt.money(TENANT.rent) + '，已繳，客服不用接這通電話。');

    push({ from: 'me', read: true, text: '報修' });
    push({ from: 'them', avatar: '安', text: '請問是哪一類問題？點一下最接近的就好。' });
    push({ from: 'me', read: true, text: k.label });
    push(photoMsg(k));
    push(acceptMsg(k));
    addDoc(repairDoc(k));
    selfServed('租客拍照報修', '系統自動開出工單 ' + EXTRA.woId + '，AI 判類別為' + k.category + '，管理員不用再問一輪。');

    push({ from: 'me', read: true, text: '退租' });
    push(moveoutMsg());
    state.moveout = true;
    addDoc(moveoutDoc());
    selfServed('租客送出退租通知', UNIT.id + ' 已列入即將空房，招租可以提前一個月開始。');
  }

  initState();
  var hash = /stage=(ready|done)/.exec(window.location.hash || '');
  if (hash) seed(hash[1]);
  renderAll();
})();
