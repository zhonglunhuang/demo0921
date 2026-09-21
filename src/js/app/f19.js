/* js/app/f19.js — 通知升級機制（f19）進系統操作頁
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）、§6.1（檔案所有權）。
 * 資料：升級規則與示範案件讀 window.DB（escalationRules、escalationCase、workOrders、tenants、incidents）；
 *      基礎層沒有的欄位（各案件的層級紀錄、接手權限、本月統計）放在本檔的 EXTRA。
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
  var NOW = '2026-09-21 09:30';            /* 系統時間；DB.today 當天早上，倒數由此起算 */

  var EXTRA = {
    /* 本月通知統計（AI 自行處理 vs 升級到人工） */
    month: { notices: 68, aiOnly: 56, escalated: 12, lastEscalated: 16 },

    /* 哪些角色可以接手哪一種案件（基礎層權限矩陣只管資料遮蔽，動作權限寫在這裡） */
    handlers: {
      '一般修繕報修': { roles: ['boss', 'manager', 'maintenance'], hint: '修繕案件由租務管理員或修繕人員接手' },
      '欠租': { roles: ['boss', 'manager', 'accountant'], hint: '欠租案件由租務管理員或會計接手' },
      '重大漏水': { roles: ['boss', 'manager', 'maintenance'], hint: '漏水案件由租務管理員或修繕人員接手' },
      '退租整備逾期': { roles: ['boss', 'manager'], hint: '整備案件由租務管理員接手' }
    },

    /* 角色 → 代表這個角色操作的同事（動作紀錄要寫得出是誰做的） */
    actor: { boss: 'S01', manager: 'S02', accountant: 'S04', maintenance: 'S05' }
  };

  var ROLE_KEYWORD = { boss: '老闆', manager: '租務管理員', accountant: '會計', maintenance: '修繕人員' };

  function staffName(id) {
    var s = D.staff.filter(function (x) { return x.id === id; })[0];
    return s ? s.name : '';
  }

  /* ---------------------------------------------------------------- 五件示範案件 */
  var CASE_SEED = [
    {
      id: 'ESC-2101', event: '一般修繕報修', unitId: 'C03',
      title: '熱水器忽冷忽熱', ref: '工單 WO-1051', source: '租客 LINE 報修',
      status: '升級中', level: 3, ownerId: 'S02',
      nextAt: D.escalationCase.nextAt, nextAction: '通知老闆 ' + staffName('S01'),
      link: { featureId: 'f07', label: '看工單 WO-1051' },
      note: '租客兩次未回覆細節，AI 無法確定派工類別。',
      steps: [
        { at: '2026-09-18 10:12', level: 0, by: '租客 ' + (D.tenantOf('C03') ? D.tenantOf('C03').name : ''), text: 'LINE 報修：洗澡時水忽冷忽熱' },
        { at: '2026-09-18 10:13', level: 1, by: 'AI', text: '第 1 層：AI 詢問點火聲、其他水龍頭水壓、發生時段' },
        { at: '2026-09-19 10:15', level: 2, by: 'AI', text: '第 2 層：24 小時未回覆，AI 再問一次並附熱水器操作說明' },
        { at: '2026-09-20 10:20', level: 3, by: '系統', text: '第 3 層：48 小時未回覆，轉交租務管理員 ' + staffName('S02') },
        { at: '2026-09-21 09:05', level: 3, by: 'AI', text: 'AI 判斷可能是熱水器或水壓問題，無法確定派工類別，交由人工判斷' }
      ]
    },
    {
      id: 'ESC-2102', event: '欠租', unitId: 'B11',
      title: '9 月租金逾期未繳', ref: '租客 ' + (D.tenantOf('B11') ? D.tenantOf('B11').name : ''), source: '帳款系統',
      status: '升級中', level: 2, ownerId: 'S02',
      nextAt: '2026-09-23 09:00', nextAction: '建立事件、寄發書面催繳並留存證明',
      link: null,
      note: '欠租 ' + (D.tenantOf('B11') ? D.tenantOf('B11').arrearsDays : 0) + ' 天，通知已讀未回覆。',
      amount: D.tenantOf('B11') ? D.tenantOf('B11').arrearsAmount : 0,
      steps: [
        { at: '2026-09-12 09:00', level: 1, by: 'AI', text: '第 1 層：到期後 3 天，AI 發送第一次繳款提醒' },
        { at: '2026-09-16 09:00', level: 2, by: 'AI', text: '第 2 層：到期後 7 天，第二次提醒並副本通知租務管理員 ' + staffName('S02') },
        { at: '2026-09-16 21:04', level: 2, by: '租客', text: 'LINE 訊息已讀，未回覆' }
      ]
    },
    {
      id: 'ESC-2103', event: '欠租', unitId: 'E07',
      title: '9 月租金逾期未繳', ref: '租客 ' + (D.tenantOf('E07') ? D.tenantOf('E07').name : ''), source: '帳款系統',
      status: '升級中', level: 1, ownerId: 'S03',
      nextAt: '2026-09-23 09:00', nextAction: '第二次提醒並副本通知租務管理員 ' + staffName('S03'),
      link: null,
      note: '欠租 ' + (D.tenantOf('E07') ? D.tenantOf('E07').arrearsDays : 0) + ' 天，LINE 與簡訊都已送達，尚未讀取。',
      amount: D.tenantOf('E07') ? D.tenantOf('E07').arrearsAmount : 0,
      steps: [
        { at: '2026-09-19 09:00', level: 1, by: 'AI', text: '第 1 層：到期後 3 天，AI 以 LINE 加簡訊發送繳款提醒' }
      ]
    },
    {
      id: 'ESC-2104', event: '重大漏水', unitId: 'B04',
      title: '浴室漏水至樓下 B03', ref: '事件 INC-07', source: 'B03 租客通報',
      status: '已結束', level: 1, ownerId: 'S02',
      nextAt: null, nextAction: '值班人員 8 分鐘內回應，沒有再往上通知',
      link: { featureId: 'f07', label: '看工單 WO-1046' },
      note: '緊急事件當下就有人接，第 2、3 層沒有觸發。',
      steps: [
        { at: '2026-09-16 08:12', level: 1, by: '系統', text: '第 1 層：建立緊急事件，電話加 LINE 通知值班人員 ' + staffName('S02') },
        { at: '2026-09-16 08:20', level: 1, by: staffName('S02'), text: '值班人員回覆已在前往路上，升級流程停止' },
        { at: '2026-09-16 09:40', level: 1, by: staffName('S02'), text: '現場關閉進水總開關，派工 WO-1046 給大同水電行' }
      ]
    },
    {
      id: 'ESC-2105', event: '退租整備逾期', unitId: 'C20',
      title: '退租整備超過 7 天', ref: '整備 2026-09-10 開始', source: '整備清單',
      status: '升級中', level: 1, ownerId: 'S02',
      nextAt: '2026-09-24 09:00', nextAction: '列入工作中心，同時通知老闆 ' + staffName('S01'),
      link: { featureId: 'f05', label: '看整備進度' },
      note: '油漆工單施工中，清潔待進場。',
      steps: [
        { at: '2026-09-17 09:00', level: 1, by: '系統', text: '第 1 層：整備開始滿 7 天，提醒負責管理員 ' + staffName('S02') }
      ]
    }
  ];

  /* ================================================================
   * 2. 狀態（記憶體）
   * ================================================================ */
  var cases = CASE_SEED.map(function (c) {
    var copy = {};
    Object.keys(c).forEach(function (k) { copy[k] = c[k]; });
    copy.steps = c.steps.map(function (s) { return { at: s.at, level: s.level, by: s.by, text: s.text }; });
    return copy;
  });

  var state = {
    status: 'all',
    event: 'all',
    selected: 'ESC-2101',
    ruleOff: {}                    /* 事件類型 → true 表示規則已停用 */
  };

  var STATUS_KIND = { '升級中': 'warn', '人工處理中': 'accent', '已結束': 'ok' };
  var STATUS_TABS = ['all', '升級中', '人工處理中', '已結束'];

  function ruleOf(event) {
    return D.escalationRules.filter(function (r) { return r.event === event; })[0] || { event: event, levels: [] };
  }
  function caseById(id) { return cases.filter(function (c) { return c.id === id; })[0]; }
  function isLive(c) { return c.status === '升級中' && !state.ruleOff[c.event]; }

  /* ---------------------------------------------------------------- 時間與倒數 */
  function parseAt(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(s || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), 0);
  }
  var clockStart = Date.now();
  function simNow() { return parseAt(NOW).getTime() + (Date.now() - clockStart); }
  function remainMs(c) {
    if (!c || !c.nextAt || !isLive(c)) return null;
    return parseAt(c.nextAt).getTime() - simNow();
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function remainText(ms) {
    if (ms === null) return null;
    if (ms <= 0) return '已到時間';
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400);
    if (d >= 1) return d + ' 天 ' + Math.floor((s % 86400) / 3600) + ' 小時';
    return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60);
  }
  function isToday(at) { return String(at || '').slice(0, 10) === D.today; }
  function dueToday(c) { return isLive(c) && c.nextAt && isToday(c.nextAt); }

  /* ================================================================
   * 3. 畫面
   * ================================================================ */
  function renderKpis() {
    var host = document.getElementById('f19-kpis');
    if (!host) return;
    var escalating = cases.filter(function (c) { return c.status === '升級中'; }).length;
    var today = cases.filter(dueToday).length;
    var m = EXTRA.month;
    host.innerHTML =
      A.kpi({ label: '升級中案件', value: escalating, unit: ' 件', icon: 'activity', hint: '系統照規則盯著，逾時才找人' }) +
      A.kpi({
        label: '今天會再升級', value: today, unit: ' 件', icon: 'clock',
        kind: today ? 'warn' : 'ok',
        hint: today ? '再沒人處理就往上通知' : '今天不用再打擾任何人'
      }) +
      A.kpi({ label: 'AI 自行處理', value: fmt.pct(m.aiOnly / m.notices, 0), icon: 'bot', hint: '本月 ' + m.notices + ' 則通知，' + m.aiOnly + ' 則沒驚動任何人' }) +
      A.kpi({ label: '升級到人工', value: m.escalated, unit: ' 件', icon: 'user-check', hint: '比上月少 ' + (m.lastEscalated - m.escalated) + ' 件' });
  }

  function renderAlert() {
    var host = document.getElementById('f19-alert');
    if (!host) return;
    var list = cases.filter(dueToday).sort(function (a, b) { return parseAt(a.nextAt) - parseAt(b.nextAt); });
    if (!list.length) {
      host.innerHTML = A.alert('今天沒有要再往上通知的案件，其餘案件由 AI 繼續追。', 'ok', { title: '升級佇列清空' });
      return;
    }
    var c = list[0];
    host.innerHTML = A.alert('', 'danger', {
      title: '今天會再往上通知',
      html: '<p>' + esc(c.unitId + ' ' + c.title + '（' + c.ref + '）再過 ') +
        '<span class="f19-inline-clock" data-countdown="' + esc(c.id) + '">' + esc(remainText(remainMs(c)) || '') + '</span> 沒人處理，系統就會' + esc(c.nextAction) + '。</p>',
      action: '<button type="button" class="btn btn--secondary btn--sm" data-goto="' + esc(c.id) + '">查看案件</button>'
    });
  }

  function filtered() {
    return cases.filter(function (c) {
      if (state.status !== 'all' && c.status !== state.status) return false;
      if (state.event !== 'all' && c.event !== state.event) return false;
      return true;
    });
  }

  function renderFilters() {
    var tabsHost = document.getElementById('f19-status-tabs');
    if (tabsHost) {
      tabsHost.innerHTML = STATUS_TABS.map(function (s) {
        var label = s === 'all' ? '全部' : s;
        var n = s === 'all' ? cases.length : cases.filter(function (c) { return c.status === s; }).length;
        return '<button type="button" class="tab' + (state.status === s ? ' is-active' : '') + '" role="tab" aria-selected="' +
          (state.status === s) + '" data-status="' + esc(s) + '">' + esc(label) + '<span class="f19-tab-n">' + n + '</span></button>';
      }).join('');
    }
    var sel = document.getElementById('f19-event');
    if (sel && !sel.options.length) {
      var events = ['all'].concat(D.escalationRules.map(function (r) { return r.event; }));
      sel.innerHTML = events.map(function (e) {
        return '<option value="' + esc(e) + '">' + esc(e === 'all' ? '全部事件類型' : e) + '</option>';
      }).join('');
    }
    if (sel) sel.value = state.event;
  }

  function caseRowHTML(c) {
    var rule = ruleOf(c.event);
    var ms = remainMs(c);
    var clock = remainText(ms);
    return '<button type="button" class="f19-case' + (state.selected === c.id ? ' is-active' : '') + '" data-case="' + esc(c.id) + '">' +
      '<span class="f19-case-head">' +
        '<span class="f19-case-unit">' + esc(c.unitId) + '</span>' +
        A.badge(c.event, 'neutral') +
      '</span>' +
      '<span class="f19-case-title">' + esc(c.title) + '</span>' +
      '<span class="f19-case-meta">' + esc('第 ' + c.level + ' 層／共 ' + rule.levels.length + ' 層 · ' + c.ref) + '</span>' +
      '<span class="f19-case-right">' + A.badge(c.status, STATUS_KIND[c.status]) +
        '<span class="f19-case-clock' + (clock ? '' : ' is-off') + '" data-countdown="' + esc(c.id) + '">' +
          esc(clock || (state.ruleOff[c.event] ? '規則已停用' : '不再升級')) + '</span>' +
      '</span>' +
      '</button>';
  }

  function renderCases() {
    var host = document.getElementById('f19-cases');
    var count = document.getElementById('f19-count');
    if (!host) return;
    var rows = filtered();
    if (count) count.textContent = '顯示 ' + rows.length + ' 件，共 ' + cases.length + ' 件';
    if (!rows.length) {
      host.innerHTML = A.emptyState({
        icon: 'filter', title: '這個條件下沒有案件',
        text: '換一個狀態或事件類型再看一次。',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-reset>看全部案件</button>'
      });
      return;
    }
    host.innerHTML = rows.map(caseRowHTML).join('');
  }

  function levelState(c, i) {
    var n = i + 1;
    if (n < c.level) return 'done';
    if (n === c.level) return c.status === '升級中' ? 'current' : 'done';
    return c.status === '升級中' ? 'pending' : 'skipped';
  }
  var LEVEL_LABEL = {
    done: { text: '已完成', kind: 'ok' },
    current: { text: '進行中', kind: 'accent' },
    pending: { text: '等候中', kind: 'neutral' },
    skipped: { text: '未觸發', kind: 'neutral' }
  };

  function ladderHTML(c) {
    var rule = ruleOf(c.event);
    return '<ol class="f19-ladder">' + rule.levels.map(function (lv, i) {
      var st = levelState(c, i);
      var tag = LEVEL_LABEL[st];
      var mine = ROLE_KEYWORD[A.role] && lv.to.indexOf(ROLE_KEYWORD[A.role]) >= 0;
      return '<li class="f19-step is-' + st + '">' +
        '<span class="f19-step-no">第 ' + (i + 1) + ' 層</span>' +
        '<span class="f19-step-body">' +
          '<span class="f19-step-when">' + esc(lv.after) + '</span>' +
          '<span class="f19-step-action">' + esc(lv.action) + '</span>' +
          '<span class="f19-step-to">' + icon('send') + esc('通知 ' + lv.to) +
            (mine ? A.badge('會通知你', 'accent') : '') + '</span>' +
        '</span>' +
        '<span class="f19-step-tag">' + A.badge(tag.text, tag.kind) + '</span>' +
        '</li>';
    }).join('') + '</ol>';
  }

  function countdownCardHTML(c) {
    var off = !!state.ruleOff[c.event];
    var ms = remainMs(c);
    var live = ms !== null;
    var title = live ? '下一次升級倒數' : '升級倒數已停止';
    var big = live ? remainText(ms) : (off ? '已停用' : '已停止');
    var note = live ? ('時間到就' + c.nextAction + '。')
      : off ? ('這類事件的升級規則已停用，案件不會再往上通知。')
        : (c.nextAction + '。');
    return '<div class="f19-clock-card' + (live ? ' is-live' : '') + '">' +
      '<div class="f19-clock-label">' + icon('clock') + esc(title) + '</div>' +
      '<div class="f19-clock" data-countdown="' + esc(c.id) + '">' + esc(big) + '</div>' +
      '<p class="f19-clock-note">' + esc(note) + '</p>' +
      (live ? '<p class="f19-clock-at">預定時間 ' + esc(fmt.dateTime(c.nextAt)) + '</p>' : '') +
      '</div>';
  }

  function actionHTML(c) {
    var h = EXTRA.handlers[c.event] || { roles: ['boss'], hint: '' };
    var allowed = h.roles.indexOf(A.role) >= 0;
    var main;
    if (c.status === '升級中') main = { label: '接手處理', act: 'take', kind: 'primary' };
    else if (c.status === '人工處理中') main = { label: '標記案件結束', act: 'close', kind: 'primary' };
    else main = { label: '案件已結束', act: '', kind: 'secondary' };
    var disabled = !allowed || !main.act;
    var link = c.link && A.feature(c.link.featureId)
      ? '<a class="btn btn--secondary" href="' + esc(A.link(c.link.featureId, 'app')) + '">' + esc(c.link.label) + '</a>'
      : '';
    return '<div class="f19-actions">' +
      '<button type="button" class="btn btn--' + main.kind + '"' + (disabled ? ' disabled' : '') +
        (main.act ? ' data-act="' + main.act + '" data-case="' + esc(c.id) + '"' : '') + '>' + esc(main.label) + '</button>' +
      link +
      (allowed || !main.act ? '' : '<p class="f19-perm muted small">' + icon('lock') + esc(h.hint + '；目前是' + A.roleName() + '視角，只能查看。') + '</p>') +
      '</div>';
  }

  function detailHTML(c) {
    var rule = ruleOf(c.event);
    var unit = D.unit(c.unitId);
    var meta = [c.unitId + ' ' + (unit ? unit.region + ' ' + unit.type : ''), c.ref, '來源 ' + c.source, '負責 ' + staffName(c.ownerId)];
    if (c.amount) meta.push('欠繳 ' + fmt.money(A.mask(c.amount, 'rent')));
    var items = c.steps.map(function (s, i) {
      return {
        at: s.at, title: s.text, by: s.by,
        kind: s.level >= 3 ? 'danger' : s.level === 2 ? 'warn' : s.level === 1 ? 'accent' : null,
        current: i === c.steps.length - 1
      };
    });
    return '<div class="card card--static f19-detail-card">' +
      '<div class="f19-detail-head">' +
        '<div>' +
          '<div class="f19-detail-title"><h2>' + esc(c.unitId + ' ' + c.title) + '</h2>' +
            A.badge(c.status, STATUS_KIND[c.status]) + '</div>' +
          '<p class="f19-detail-meta">' + meta.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</p>' +
        '</div>' +
        '<div class="f19-detail-level">' +
          '<span class="f19-detail-level-n">' + c.level + '</span>' +
          '<span class="muted small">第 ' + c.level + ' 層／共 ' + rule.levels.length + ' 層</span>' +
        '</div>' +
      '</div>' +
      '<p class="f19-detail-note">' + esc(c.note) + '</p>' +
      '<div class="f19-detail-grid">' +
        '<section class="f19-block"><h3 class="f19-block-title">升級階梯</h3>' + ladderHTML(c) + '</section>' +
        '<section class="f19-block">' + countdownCardHTML(c) +
          '<h3 class="f19-block-title">通知往返</h3>' + A.timeline(items) + '</section>' +
      '</div>' +
      actionHTML(c) +
      '</div>';
  }

  function renderDetail() {
    var host = document.getElementById('f19-detail');
    if (!host) return;
    var c = caseById(state.selected);
    if (!c) {
      host.innerHTML = A.emptyState({ icon: 'inbox', title: '還沒有選案件', text: '在左邊點一件案件，看它現在升到第幾層。' });
      return;
    }
    host.innerHTML = detailHTML(c);
  }

  function ruleRowsHTML() {
    return D.escalationRules.map(function (r) {
      var off = !!state.ruleOff[r.event];
      var used = cases.filter(function (c) { return c.event === r.event; }).length;
      function lv(i, withTo) {
        var l = r.levels[i];
        if (!l) return '<span class="muted-2">—</span>';
        return '<span class="f19-rule-action">' + esc(l.action) + '</span>' +
          (withTo ? '<span class="f19-rule-to">' + esc('通知 ' + l.to) + '</span>' : '');
      }
      function after(i) {
        var l = r.levels[i];
        return l ? '<span class="f19-rule-after">' + esc(l.after) + '</span>' : '<span class="muted-2">—</span>';
      }
      return '<tr' + (off ? ' class="is-off"' : '') + '>' +
        '<td class="cell-primary" data-label="事件類型"><span class="f19-rule-event">' + esc(r.event) + '</span>' +
          '<span class="muted small">套用中 ' + used + ' 件</span></td>' +
        '<td data-label="第 1 層（自動）">' + lv(0, true) + '</td>' +
        '<td data-label="逾時後">' + after(1) + '</td>' +
        '<td data-label="第 2 層">' + lv(1, true) + '</td>' +
        '<td data-label="逾時後">' + after(2) + '</td>' +
        '<td data-label="第 3 層">' + lv(2, true) + '</td>' +
        '<td data-label="規則狀態">' + A.badge(off ? '已停用' : '啟用中', off ? 'neutral' : 'ok') +
          '<button type="button" class="btn btn--ghost btn--sm" data-rule="' + esc(r.event) + '">' + (off ? '啟用' : '停用') + '</button></td>' +
        '</tr>';
    }).join('');
  }

  function renderRules() {
    var host = document.getElementById('f19-rules-table');
    if (!host) return;
    host.innerHTML =
      '<div class="table-wrap"><table class="table table--cards table--compact f19-rules">' +
        '<thead><tr>' +
          '<th scope="col">事件類型</th><th scope="col">第 1 層（自動）</th><th scope="col">逾時後</th>' +
          '<th scope="col">第 2 層</th><th scope="col">逾時後</th><th scope="col">第 3 層</th><th scope="col">規則狀態</th>' +
        '</tr></thead><tbody>' + ruleRowsHTML() + '</tbody></table></div>';
  }

  function renderAll() {
    renderKpis();
    renderAlert();
    renderFilters();
    renderCases();
    renderDetail();
    renderRules();
  }

  /* ---------------------------------------------------------------- 每秒更新倒數 */
  function tick() {
    var nodes = document.querySelectorAll('[data-countdown]');
    Array.prototype.forEach.call(nodes, function (n) {
      var c = caseById(n.getAttribute('data-countdown'));
      if (!c) return;
      var t = remainText(remainMs(c));
      if (t) n.textContent = t;
    });
  }
  setInterval(tick, 1000);

  /* ================================================================
   * 4. 操作
   * ================================================================ */
  function select(id) {
    state.selected = id;
    renderCases();
    renderDetail();
  }

  function takeOver(c) {
    var who = staffName(EXTRA.actor[A.role] || 'S02');
    c.status = '人工處理中';
    c.ownerId = EXTRA.actor[A.role] || c.ownerId;
    c.steps.push({ at: NOW, level: c.level, by: who, text: who + ' 接手處理，升級倒數停止' });
    c.nextAt = null;
    c.nextAction = '已有人接手，不會再往上通知';
    renderAll();
    A.toast(who + ' 已接手 ' + c.unitId + ' ' + c.title + '，升級倒數停止', 'ok');
  }

  function closeCase(c) {
    var who = staffName(EXTRA.actor[A.role] || 'S02');
    A.confirm({
      title: '標記案件結束？',
      text: '結束後系統不會再為這件案子發升級通知，紀錄仍然保留。',
      confirmLabel: '結束案件'
    }).then(function (ok) {
      if (!ok) return;
      c.status = '已結束';
      c.steps.push({
        at: '2026-09-21 10:40', level: c.level, by: who,
        text: c.id === 'ESC-2101' ? '到場確認為熱水器出水不穩，已派工給大同水電行，案件結束' : '案件處理完成，升級流程結束'
      });
      c.nextAction = '案件已結束，升級流程停止';
      renderAll();
      A.toast(c.unitId + ' ' + c.title + ' 已結束，升級佇列少一件', 'ok');
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var tab = t.closest('#f19-status-tabs [data-status]');
    if (tab) { state.status = tab.getAttribute('data-status'); renderFilters(); renderCases(); return; }

    var row = t.closest('.f19-case[data-case]');
    if (row && !t.closest('[data-act]')) { select(row.getAttribute('data-case')); return; }

    var goto = t.closest('[data-goto]');
    if (goto) {
      var id = goto.getAttribute('data-goto');
      state.status = 'all'; state.event = 'all';
      renderFilters(); renderCases(); select(id);
      var host = document.getElementById('f19-detail');
      if (host) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (t.closest('[data-reset]')) {
      state.status = 'all'; state.event = 'all';
      renderFilters(); renderCases();
      A.toast('已清除篩選條件', 'neutral', { ms: 1800 });
      return;
    }

    var act = t.closest('[data-act]');
    if (act) {
      var c = caseById(act.getAttribute('data-case'));
      if (!c) return;
      if (act.getAttribute('data-act') === 'take') takeOver(c);
      else closeCase(c);
      return;
    }

    var rule = t.closest('[data-rule]');
    if (rule) {
      var ev = rule.getAttribute('data-rule');
      state.ruleOff[ev] = !state.ruleOff[ev];
      renderAll();
      A.toast(state.ruleOff[ev] ? ('「' + ev + '」的升級規則已停用，這類案件不會再往上通知') : ('「' + ev + '」的升級規則已啟用'),
        state.ruleOff[ev] ? 'warn' : 'ok');
      return;
    }
  });

  document.addEventListener('change', function (e) {
    var sel = e.target;
    if (sel instanceof Element && sel.id === 'f19-event') {
      state.event = sel.value;
      renderCases();
    }
  });

  A.onRole(function () { renderAll(); });

  renderAll();
})();
