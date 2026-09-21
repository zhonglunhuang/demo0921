/* js/tours/f19.js — 通知升級機制（f19）功能導覽 8 步
 * 契約：docs/DESIGN.md §4（播放器與 api）、§5（假資料）、§6（文案）。
 * 主角：WO-1051（C03 熱水器忽冷忽熱）——報修 24 小時沒回 → AI 再問 → 48 小時 → 升級管理員
 *      → 管理員接手 → 當場派工 → 案件結束。每一步都把「當下的系統畫面」重組出來，
 *      再用 api 讓畫面真的動：對話逐字出現、倒數跳動、標籤變色、游標示意點擊、數字歸零。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  var TP = window.TourPlayer;
  if (!A || !D || !TP) return;

  var esc = A.esc;
  var icon = A.icon;

  var WO = D.workOrder('WO-1051');
  var UNIT = D.unit('C03');
  var TENANT = D.tenantOf('C03');
  var MANAGER = D.staff.filter(function (s) { return s.id === 'S02'; })[0];
  var BOSS = D.staff.filter(function (s) { return s.id === 'S01'; })[0];
  var VENDOR = D.vendorById('V01');
  var RULE = D.escalationRules.filter(function (r) { return r.event === '一般修繕報修'; })[0];
  var HEAD = '第 1 層（自動）';

  /* 對話腳本（預先寫好，不接真實 AI） */
  var SAY = {
    tenant: '洗澡洗到一半水忽冷忽熱，已經兩天了',
    ai1: '收到報修。請問洗澡時有聽到熱水器點火的聲音嗎？其他水龍頭水壓正常嗎？大概都在什麼時段發生？',
    ai2: '提醒您 9/18 的報修還缺一點資訊。附上熱水器操作說明，若已照做仍然異常，回覆「仍然異常」就幫您安排師傅。'
  };

  /* ================================================================
   * 小工具：讓 count／type 的動畫結束後一定停在正確的字
   * ================================================================ */
  function settle(el, text) {
    var fresh = el.cloneNode(false);
    fresh.textContent = text;
    if (el.parentNode) el.parentNode.replaceChild(fresh, el);
    return fresh;
  }
  function countTo(api, el, from, to, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? 800 : ms;
    api.count(el, from, to, dur);
    return api.wait(dur + 80).then(function () { settle(el, String(to)); });
  }
  function typeTo(api, el, text, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? Math.min(2200, Math.max(500, text.length * 55)) : ms;
    api.type(el, text, dur);
    return api.wait(dur + 120).then(function () { settle(el, text); });
  }

  /* ================================================================
   * 舞台元件（960 × 600）
   * ================================================================ */
  function ladder(states) {
    return '<div class="f19s-card" data-card="ladder"><h4>' + icon('layers') + ' 升級階梯</h4>' +
      '<ol class="f19s-ladder">' + RULE.levels.map(function (lv, i) {
        var st = states[i] || { cls: 'pending', text: '等候中', kind: 'neutral' };
        return '<li class="f19s-step is-' + st.cls + '" data-level="' + (i + 1) + '">' +
          '<span class="f19s-step-no">第 ' + (i + 1) + ' 層</span>' +
          '<span class="f19s-step-body">' +
            '<span class="f19s-step-when">' + esc(lv.after) + '</span>' +
            '<span class="f19s-step-action">' + esc(lv.action) + '</span>' +
            '<span class="f19s-step-to">' + esc('通知 ' + lv.to) + '</span>' +
          '</span>' +
          '<span class="badge badge--' + st.kind + '" data-level-tag="' + (i + 1) + '">' + esc(st.text) + '</span>' +
          '</li>';
      }).join('') + '</ol></div>';
  }
  var L_DONE = { cls: 'done', text: '已完成', kind: 'ok' };
  var L_WAIT = { cls: 'current', text: '等待回覆', kind: 'accent' };
  var L_PEND = { cls: 'pending', text: '等候中', kind: 'neutral' };
  var L_SKIP = { cls: 'skipped', text: '未觸發', kind: 'neutral' };

  function clockCard(cfg) {
    if (cfg.off) {
      return '<div class="f19s-clock-card is-off" data-card="clock">' +
        '<div class="f19s-clock-label">升級倒數</div>' +
        '<div class="f19s-clock" data-clock>' + esc(cfg.big || '已停止') + '</div>' +
        '<p class="f19s-clock-note" data-clock-note>' + esc(cfg.note) + '</p></div>';
    }
    return '<div class="f19s-clock-card" data-card="clock">' +
      '<div class="f19s-clock-label">' + esc(cfg.label || '下一次升級倒數') + '</div>' +
      '<div class="f19s-clock">剩 <span data-clock-h>' + esc(String(cfg.hours)) + '</span> 小時</div>' +
      '<p class="f19s-clock-note" data-clock-note>' + esc(cfg.note) + '</p></div>';
  }

  function chat(lines) {
    return '<div class="f19s-chat phone-chat" data-card="chat">' +
      '<div class="phone-day">2026/09/18</div>' +
      lines.map(function (m) { return A.bubble(m); }).join('') + '</div>';
  }
  var MSG_TENANT = { from: 'me', text: SAY.tenant, at: '10:12' };
  function msgAi(n, text) {
    return { from: 'them', avatar: 'AI', html: '<span data-line="' + n + '">' + esc(text || '') + '</span>', at: n === 1 ? '10:13' : '10:15' };
  }

  function notifyCard() {
    return '<div class="f19s-card" data-card="notify"><h4>' + icon('bell') + ' 管理員收到的通知</h4>' +
      '<div class="f19s-notify">' +
        '<span class="icon-circle icon-circle--danger">' + icon('alert') + '</span>' +
        '<span><span class="f19s-notify-title">' + esc(WO.id + ' 逾時未處理，已轉給你') + '</span>' +
        '<span class="f19s-notify-text">' + esc(UNIT.id + ' ' + WO.title + '：租客兩次未回覆，AI 無法確定派工類別。') + '</span>' +
        '<span class="f19s-notify-at">2026/09/20 10:20 · LINE 加系統待辦 · ' + esc(MANAGER.name) + '</span></span>' +
      '</div></div>';
  }

  function actionCard(label, done) {
    return '<div class="f19s-card" data-card="action"><h4>' + icon('user-check') + ' 管理員畫面</h4>' +
      '<p class="f19s-note">' + esc(done ? '接手後倒數停止，這件案子不會再往上通知老闆。' : '接手就代表有人負責，系統立刻停掉升級倒數。') + '</p>' +
      '<div class="f19s-btn-row" style="margin-top:10px">' +
        '<button type="button" class="btn btn--primary btn--sm" data-take>' + esc(label) + '</button>' +
        '<button type="button" class="btn btn--ghost btn--sm">看工單</button>' +
      '</div></div>';
  }

  function tlCard(items, hidden) {
    return '<div class="f19s-card" data-card="tl"><h4>' + icon('history') + ' 處理紀錄</h4>' +
      '<ol class="f19s-tl">' + items.map(function (it, i) {
        return '<li data-tl="' + i + '"' + (hidden && i >= hidden ? ' style="visibility:hidden"' : '') + '>' +
          '<time>' + esc(it.at) + '</time><span>' + esc(it.text) +
          '<span class="f19s-tl-by">' + esc(it.by) + '</span></span></li>';
      }).join('') + '</ol></div>';
  }

  function kpis(waiting) {
    function one(key, label, value, unit) {
      return '<div class="f19s-kpi"><div class="f19s-kpi-label">' + esc(label) + '</div>' +
        '<div class="f19s-kpi-value"><span data-kpi="' + key + '">' + esc(String(value)) + '</span><small>' + esc(unit) + '</small></div></div>';
    }
    return '<div class="f19s-kpis">' +
      one('wait', '等待人工處理', waiting, ' 件') +
      one('ai', 'AI 自行處理', 82, '%') +
      one('month', '本月通知', 68, ' 則') +
      '</div>';
  }

  function rulesTable() {
    return '<div class="f19s-card" data-card="rules" style="flex:1;overflow:hidden">' +
      '<h4>' + icon('shield-check') + ' 升級規則</h4>' +
      '<table class="f19s-rules"><thead><tr>' +
        '<th>事件類型</th><th>' + HEAD + '</th><th>逾時後</th><th>第 2 層</th><th>逾時後</th><th>第 3 層</th>' +
      '</tr></thead><tbody>' + D.escalationRules.map(function (r) {
        function lv(i) {
          var l = r.levels[i];
          if (!l) return '—';
          return esc(l.action) + '<span class="f19s-rule-to">' + esc('通知 ' + l.to) + '</span>';
        }
        function af(i) { return r.levels[i] ? '<span class="f19s-rule-after">' + esc(r.levels[i].after) + '</span>' : '—'; }
        return '<tr data-rule="' + esc(r.event) + '"><td class="f19s-rule-event">' + esc(r.event) + '</td>' +
          '<td>' + lv(0) + '</td><td>' + af(1) + '</td><td>' + lv(1) + '</td><td>' + af(2) + '</td><td>' + lv(2) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* cfg: status, statusKind, alert{kind,text}|null, left[], right[] */
  function screen(cfg) {
    var alert = cfg.alert
      ? '<div class="f19s-alert f19s-alert--' + cfg.alert.kind + '" data-alert>' +
          icon(cfg.alert.kind === 'ok' ? 'check-circle' : cfg.alert.kind === 'muted' ? 'info' : 'alert') +
          '<span data-alert-text>' + esc(cfg.alert.text) + '</span></div>'
      : '';
    return '<div class="f19s">' +
      '<div class="f19s-top">' +
        '<h3>' + esc(WO.id + ' · ' + UNIT.id + ' ' + WO.title) + '</h3>' +
        '<span class="badge badge--' + cfg.statusKind + '" data-status>' + esc(cfg.status) + '</span>' +
        '<span class="f19s-meta">' + esc(UNIT.region + ' ' + UNIT.type + '　｜　租客 ' + TENANT.name + '　｜　' + WO.source) + '</span>' +
      '</div>' + alert +
      '<div class="f19s-grid">' +
        '<div class="f19s-col">' + cfg.left.join('') + '</div>' +
        '<div class="f19s-col">' + cfg.right.join('') + '</div>' +
      '</div></div>';
  }

  function fullScreen(cfg) {
    return '<div class="f19s">' +
      '<div class="f19s-top"><h3>' + esc(cfg.title) + '</h3>' +
        '<span class="f19s-meta">' + esc(cfg.meta) + '</span></div>' +
      cfg.body + '</div>';
  }

  var TL_ITEMS = [
    { at: '09/21 09:30', text: MANAGER.name + ' 接手處理，升級倒數停止', by: MANAGER.name },
    { at: '09/21 10:05', text: '到場確認：熱水器出水不穩，非整棟水壓問題', by: MANAGER.name },
    { at: '09/21 10:40', text: '派工給 ' + VENDOR.name + '，預計 ' + VENDOR.avgDays + ' 天內完工', by: '系統' }
  ];

  /* ================================================================
   * 8 步
   * ================================================================ */
  var steps = [
    {
      title: '升級規則先設定好',
      text: '哪一種事件、隔多久、找誰，設定一次。之後系統照表跑，不用有人記得。',
      render: function (stage) {
        stage.innerHTML = fullScreen({
          title: '通知升級機制',
          meta: '4 種事件類型 · 全部啟用中',
          body: rulesTable()
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('.f19s-rules tbody tr'))
          .then(function () { return api.highlight(stage.querySelector('[data-rule="一般修繕報修"]')); });
      },
      autoplayMs: 6500
    },
    {
      title: '租客報修，AI 先接手',
      text: '9/18 早上租客用 LINE 報修，AI 立刻判斷類別並問細節，沒有人被打擾。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '第 1 層處理中', statusKind: 'accent',
          alert: { kind: 'muted', text: '報修進來，AI 依規則先處理第 1 層' },
          left: [ladder([L_WAIT, L_PEND, L_PEND]), clockCard({ hours: 24, note: '租客 24 小時內沒回，AI 會再問一次。' })],
          right: [chat([MSG_TENANT, msgAi(1, '')])]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('[data-card]'))
          .then(function () { return typeTo(api, stage.querySelector('[data-line="1"]'), SAY.ai1); });
      },
      autoplayMs: 7000
    },
    {
      title: '沒人回，倒數自己走',
      text: '租客一直沒回。倒數歸零就自動進下一層，沒有人需要記在腦袋裡。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '第 1 層處理中', statusKind: 'accent',
          alert: { kind: 'muted', text: '等待租客回覆中，倒數 24 小時' },
          left: [ladder([L_WAIT, L_PEND, L_PEND]), clockCard({ hours: 24, note: '時間到就進第 2 層，AI 再問一次。' })],
          right: [chat([MSG_TENANT, msgAi(1, SAY.ai1)])]
        });
      },
      after: function (stage, api) {
        return countTo(api, stage.querySelector('[data-clock-h]'), 24, 0, 1800)
          .then(function () { return api.badge(stage.querySelector('[data-level-tag="1"]'), '未回覆', 'warn'); })
          .then(function () {
            var al = stage.querySelector('[data-alert]');
            al.className = 'f19s-alert f19s-alert--warn';
            settle(al.querySelector('[data-alert-text]'), '24 小時到，租客仍未回覆');
            return api.enter(al);
          });
      },
      autoplayMs: 6500
    },
    {
      title: '24 小時到，AI 再問一次',
      text: '第 2 層自動發動：AI 再問一次，並附上這間房的熱水器操作說明。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '第 2 層處理中', statusKind: 'accent',
          alert: { kind: 'warn', text: '第 1 層逾時，已自動進入第 2 層' },
          left: [ladder([L_DONE, L_WAIT, L_PEND]), clockCard({ hours: 24, note: '再 24 小時沒回覆，就轉給租務管理員。' })],
          right: [chat([MSG_TENANT, msgAi(1, SAY.ai1), msgAi(2, '')])]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="chat"] .bubble-row:last-child'))
          .then(function () { return typeTo(api, stage.querySelector('[data-line="2"]'), SAY.ai2); });
      },
      autoplayMs: 7500
    },
    {
      title: '48 小時到，升級管理員',
      text: '兩次都沒回，系統把案子連同紀錄整包轉給管理員 ' + MANAGER.name + '。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '已升級管理員', statusKind: 'danger',
          alert: { kind: 'danger', text: '第 2 層逾時，已轉交租務管理員 ' + MANAGER.name },
          left: [ladder([L_DONE, L_DONE, { cls: 'current', text: '已通知', kind: 'danger' }]),
            clockCard({ hours: 24, label: '今天內未處理就通知老闆', note: '最後一道：管理員今天內沒處理，系統會通知老闆 ' + BOSS.name + '。' })],
          right: [notifyCard(), kpis(0)]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="notify"]'))
          .then(function () { return api.highlight(stage.querySelector('.f19s-notify')); })
          .then(function () { return countTo(api, stage.querySelector('[data-kpi="wait"]'), 0, 1, 600); });
      },
      autoplayMs: 7000
    },
    {
      title: '管理員接手，倒數停止',
      text: MANAGER.name + ' 按下接手，倒數立刻停住。案子有人負責了，老闆不會被叫。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '已升級管理員', statusKind: 'danger',
          alert: { kind: 'danger', text: '等待管理員處理中，倒數仍在走' },
          left: [ladder([L_DONE, L_DONE, { cls: 'current', text: '已通知', kind: 'danger' }]),
            clockCard({ hours: 24, label: '今天內未處理就通知老闆', note: '按下「接手處理」就會停止倒數。' })],
          right: [actionCard('接手處理', false), kpis(1)]
        });
      },
      after: function (stage, api) {
        var btn = stage.querySelector('[data-take]');
        return api.cursor(btn)
          .then(function () { return api.highlight(btn); })
          .then(function () {
            var card = stage.querySelector('[data-card="clock"]');
            card.classList.add('is-off');
            card.querySelector('.f19s-clock').innerHTML = '已停止';
            settle(card.querySelector('[data-clock-note]'), '已有人接手，不會再往上通知老闆 ' + BOSS.name + '。');
            return api.enter(card);
          })
          .then(function () { return api.badge(stage.querySelector('[data-status]'), '人工處理中', 'accent'); });
      },
      autoplayMs: 7000
    },
    {
      title: '到場處理，當場派工',
      text: '管理員到場確認是熱水器本身的問題，直接派工給 ' + VENDOR.name + '。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '人工處理中', statusKind: 'accent',
          alert: { kind: 'muted', text: '升級已停止，案件由 ' + MANAGER.name + ' 負責' },
          left: [ladder([L_DONE, L_DONE, { cls: 'done', text: '已接手', kind: 'ok' }]),
            clockCard({ off: true, big: '已停止', note: '從報修到有人到場，總共 3 天，全程有紀錄。' })],
          right: [tlCard(TL_ITEMS, 1), kpis(1)]
        });
      },
      after: function (stage, api) {
        var items = Array.prototype.slice.call(stage.querySelectorAll('[data-tl]')).slice(1);
        items.forEach(function (li) { li.style.visibility = 'visible'; });
        return api.enter(stage.querySelector('[data-card="tl"]'))
          .then(function () { return api.enter(items); });
      },
      autoplayMs: 6500
    },
    {
      title: '案件結束，升級停止',
      text: '案子在管理員這一層收尾，警示消失、待處理歸零，老闆整條流程都沒被打擾。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '人工處理中', statusKind: 'accent',
          alert: { kind: 'warn', text: '案件尚未結案，仍佔著一件待處理' },
          left: [ladder([L_DONE, L_DONE, { cls: 'done', text: '已接手', kind: 'ok' }]),
            clockCard({ off: true, big: '已停止', note: '第 3 層之後的通知老闆這一步，沒有發生。' })],
          right: [tlCard(TL_ITEMS, 0), kpis(1), actionCard('標記案件結束', true)]
        });
      },
      after: function (stage, api) {
        var btn = stage.querySelector('[data-take]');
        return api.cursor(btn)
          .then(function () { return api.highlight(btn); })
          .then(function () { return api.badge(stage.querySelector('[data-status]'), '已結束', 'ok'); })
          .then(function () { return api.badge(stage.querySelector('[data-level-tag="3"]'), '已完成', 'ok'); })
          .then(function () { return countTo(api, stage.querySelector('[data-kpi="wait"]'), 1, 0, 700); })
          .then(function () {
            var al = stage.querySelector('[data-alert]');
            al.className = 'f19s-alert f19s-alert--ok';
            al.innerHTML = icon('check-circle') + '<span data-alert-text>' + esc('案件結束，今天沒有待升級的案件') + '</span>';
            return api.enter(al);
          });
      },
      autoplayMs: 8000
    }
  ];

  /* ------------------------------------------------------------------ 掛載 */
  var start = 0;
  var autoplay = true;
  var hash = /(?:^|[#&])step=(last|\d+)/.exec(window.location.hash || '');
  if (hash) {
    start = hash[1] === 'last' ? steps.length - 1 : Math.max(0, Math.min(steps.length - 1, (+hash[1] || 1) - 1));
    autoplay = false;                       /* 指定步驟時不自動播放，停在那一步 */
  }

  TP.mount(document.getElementById('player'), {
    feature: 'f19',
    autoplayMs: 6500,
    start: start,
    autoplay: autoplay,
    steps: steps
  });
})();
