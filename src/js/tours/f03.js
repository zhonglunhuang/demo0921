/* f03.js（tours）— 空房招租漏斗 功能導覽
 * 契約：docs/DESIGN.md §4（TourPlayer）；票：tickets/DEMO-04 需求 #3 的功能導覽流程 1。
 *
 * 八步：LINE 不續租 → 自動切即將空房 → 待辦自動產生 → 刊登文案產生 →
 *       帶看排進日曆 → 收訂 → 簽約文件 → 入住、警示解除。
 * 每一步都用共用元件（.kpi / .badge / .checklist / phone / .alert）組出「當下的系統畫面」，
 * 再用 api（enter / highlight / count / type / check / badge / cursor / wait）讓畫面真的動。
 *
 * 網址加 #step=3 或 #step=last 可以直接停在某一步（驗收與截圖用）。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB, TP = window.TourPlayer;
  var host = document.getElementById('player');
  if (!A || !D || !TP || !host) return;

  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  /* ---------------------------------------------------------------- 這條導覽的主角 */
  var UID = 'A08';
  var unit = D.unit(UID);
  var tenant = D.tenantOf(UID);                 /* 要搬走的租客 */
  var REGION = unit.region, TYPE = unit.type, PING = unit.ping, RENT = unit.rent;
  var BLD = D.company.buildings[unit.building];
  var NEW_TENANT = '何○○';                      /* 新房客（本導覽專用，data.js 沒有） */
  var DEPOSIT = 5000;
  var DAYS_THIS = 12;                            /* 這次的空置天數 */
  var AVG = D.stats.avgVacantDays;               /* 全部平均 14 天 */

  /* 看板上其他房間（全部取自 data.js 的故事數字） */
  var BASE = [
    { stage: '即將空房', id: 'B15', note: '10/14 退租' },
    { stage: '即將空房', id: 'E03', note: '10/31 退租' },
    { stage: '整備中', id: 'C20', note: '整備 9／14' },
    { stage: '招租中', id: 'A12', note: '空置 21 天' },
    { stage: '招租中', id: 'C08', note: '空置 33 天' },
    { stage: '帶看預約', id: 'D15', note: '2 組帶看' },
    { stage: '已收訂', id: 'C14', note: '訂金 5,000' },
    { stage: '已簽約', id: 'B09', note: '9/28 入住' },
    { stage: '已入住', id: 'A20', note: '9/05 入住' }
  ];
  var STAGES = D.funnelStages.slice();

  /* ---------------------------------------------------------------- 畫面小工具 */
  function shell(title, badgeHtml, body, bodyCls) {
    return '<div class="f03-stage">' +
      '<div class="f03-stage-head">' + icon('door') +
        '<span class="f03-stage-title">' + esc(title) + '</span>' + (badgeHtml || '') + '</div>' +
      '<div class="f03-stage-body' + (bodyCls ? ' ' + bodyCls : '') + '">' + body + '</div>' +
      '</div>';
  }
  function panel(title, inner, cls) {
    return '<div class="f03-stage-panel' + (cls ? ' ' + cls : '') + '">' +
      (title ? '<h4>' + esc(title) + '</h4>' : '') + inner + '</div>';
  }

  /* 七欄看板（stage 用的精簡版）。focusStage 指定 A08 目前在哪一欄，null 表示還沒進看板。 */
  function board(focusStage, opts) {
    opts = opts || {};
    return '<div class="f03-sb">' + STAGES.map(function (s) {
      var cards = BASE.filter(function (r) { return r.stage === s; });
      var n = cards.length + (focusStage === s ? 1 : 0);
      var inner = cards.map(function (r) {
        return '<div class="f03-sb-card"><b>' + esc(r.id) + '</b><span>' + esc(r.note) + '</span></div>';
      }).join('');
      if (focusStage === s) inner = focusCard(opts.note) + inner;
      return '<div class="f03-sb-col" data-stage="' + esc(s) + '">' +
        '<div class="f03-sb-head"><span>' + esc(s) + '</span>' +
          '<b data-count="' + esc(s) + '">' + n + '</b></div>' +
        '<div class="f03-sb-cards">' + inner + '</div></div>';
    }).join('') + '</div>';
  }

  function focusCard(note) {
    return '<div class="f03-sb-card is-focus" data-focus><b>' + esc(UID) + '</b>' +
      '<span data-focus-note>' + esc(note || '') + '</span></div>';
  }

  function unitFacts() {
    return '<dl class="kv kv--stack">' +
      '<dt>房間</dt><dd>' + esc(UID) + '　' + esc(REGION) + '　' + esc(TYPE) + ' ' + PING + ' 坪</dd>' +
      '<dt>租客</dt><dd>' + esc(tenant ? tenant.name : '—') + '</dd>' +
      '<dt>退租日</dt><dd>2026/10/21</dd>' +
      '<dt>目前月租</dt><dd>' + esc(fmt.money(RENT)) + '</dd>' +
      '</dl>';
  }

  var TASKS = [
    { label: '拍攝招租照片', hint: '客廳、房間、衛浴各一組' },
    { label: '確認租金建議', hint: '比對同區同房型行情' },
    { label: '準備刊登資料', hint: '坪數、設備、交通與生活機能' },
    { label: '排定清潔時間', hint: '點交後三天內完成' }
  ];

  var COPY = [
    '【' + REGION + '｜' + TYPE + '】' + PING + ' 坪，含全套家電家具，月租 ' + fmt.num(RENT) + ' 元',
    '地址：' + BLD.address + '（' + unit.floor + ' 樓）',
    '設備：冷氣、冰箱、熱水器、床組、衣櫃、書桌，網路吃到飽',
    '交通：' + BLD.parkingRule,
    '押金兩個月，專人管理，報修 24 小時內回覆。'
  ].join('\n');

  var CAL = [
    { d: 22, dow: '二', n: 0 },
    { d: 23, dow: '三', n: 0 },
    { d: 24, dow: '四', n: 0, target: true },
    { d: 25, dow: '五', n: 0 },
    { d: 26, dow: '六', n: 1 },
    { d: 27, dow: '日', n: 0 },
    { d: 28, dow: '一', n: 0 }
  ];

  /* ---------------------------------------------------------------- 步驟 */
  var steps = [
    {
      title: '租客在 LINE 說不續租',
      text: '租客在 LINE 說下個月不續租，系統自己讀懂，不用人工轉單。' + UID + ' 從這一刻開始倒數。',
      render: function (stage, api) {
        stage.innerHTML = shell('租客訊息', A.badge('今天 10:12', 'neutral'),
          '<div class="f03-stage-phone">' + A.phone({
            sm: true, title: tenant ? tenant.name : '租客', sub: UID + '・' + REGION, input: false,
            messages: [{ from: 'day', text: '今天' }]
          }) + '</div>' +
          panel('系統讀到的重點', '<p class="muted small" data-read>等待訊息</p>' + unitFacts()));
        api.enter(stage.querySelectorAll('.f03-stage-phone, .f03-stage-panel'));
      },
      after: function (stage, api) {
        var chat = stage.querySelector('.phone-chat');
        A.phoneTyping(chat, true);
        return api.wait(900).then(function () {
          A.phoneAppend(chat, { from: 'them', text: '您好，我工作調到新竹，下個月租約到期就不續租了', at: '10:12' });
          A.phoneTyping(chat, true);
          return api.wait(1000);
        }).then(function () {
          A.phoneAppend(chat, { from: 'them', text: '10/21 可以點交嗎？押金再麻煩您', at: '10:12', read: true });
          return api.type(stage.querySelector('[data-read]'), '判讀：不續租，退租日 2026/10/21', 900);
        }).then(function () {
          return api.highlight(stage.querySelector('.f03-stage-panel'));
        });
      }
    },

    {
      title: '自動切成即將空房',
      text: UID + ' 立刻出現在看板第一欄，退租日也一起帶進去。哪幾間要空了，老闆隨時看得到。',
      render: function (stage, api) {
        stage.innerHTML = shell('招租看板', A.badge('即將空房 ＋1', 'warn'),
          board(null) +
          panel('', '<p class="muted small">卡片自己長出來，不必有人記得去建檔。</p>', 'f03-stage-foot'),
          'f03-stage-body--one');
        api.enter(stage.querySelector('.f03-sb'));
      },
      after: function (stage, api) {
        var col = stage.querySelector('[data-stage="即將空房"] .f03-sb-cards');
        col.insertAdjacentHTML('afterbegin', focusCard('10/21 退租'));
        var card = col.firstElementChild;
        return api.enter(card).then(function () {
          return api.count(stage.querySelector('[data-count="即將空房"]'), 2, 3, 600);
        }).then(function () {
          return api.highlight(card);
        });
      }
    },

    {
      title: '四件待辦自動產生',
      text: '拍照、租金建議、刊登資料、清潔排程一次開好，不會有人忘記，空窗期就短。',
      render: function (stage, api) {
        stage.innerHTML = shell(UID + ' 空房流程', A.badge('即將空房', 'warn'),
          panel('房間資料', unitFacts()) +
          panel('自動產生的待辦', '<p class="muted small">目前 <span data-task-count>0</span> 件</p>' +
            A.checklist(TASKS.map(function (t, i) { return { id: 'tw' + i, label: t.label, hint: t.hint }; }), null, { id: 'f03-tour-task' })));
        api.enter(stage.querySelectorAll('.f03-stage-panel'));
      },
      after: function (stage, api) {
        var items = stage.querySelectorAll('.checklist-item');
        return api.enter(items).then(function () {
          return api.count(stage.querySelector('[data-task-count]'), 0, 4, 500);
        }).then(function () {
          return api.check(items[0]);
        });
      }
    },

    {
      title: '刊登文案一鍵產生',
      text: '按一下就照坪數、設備與交通組好文案，貼到 591 或社群，當天就能上架。',
      render: function (stage, api) {
        stage.innerHTML = shell('招租頁', A.badge('招租中', 'accent'),
          panel('租金建議', A.statRow([
            { label: '同區最低', value: fmt.money(6500) },
            { label: '同區中位', value: fmt.money(7000) },
            { label: '同區最高', value: fmt.money(7500) }
          ], { sm: true }) +
            '<p class="muted small mt-8">' + esc(REGION + ' ' + TYPE) + ' 出租中的 22 間行情，建議刊登 ' + esc(fmt.money(RENT)) + '。</p>') +
          panel('刊登文案', '<div class="f03-copy-box f03-stage-copy" data-copy></div>' +
            '<div class="row mt-8"><span class="btn btn--secondary btn--sm" data-gen>' + icon('refresh') + '<span>產生刊登文案</span></span>' +
            '<span class="btn btn--ghost btn--sm">' + icon('copy') + '<span>複製文案</span></span></div>'));
        api.enter(stage.querySelectorAll('.f03-stage-panel'));
      },
      after: function (stage, api) {
        return api.cursor(stage.querySelector('[data-gen]')).then(function () {
          return api.type(stage.querySelector('[data-copy]'), COPY, 2000);
        });
      }
    },

    {
      title: '帶看直接排進日曆',
      text: '詢問進來直接排進日曆，哪一天有幾組帶看一眼看到，不用在對話裡翻。',
      render: function (stage, api) {
        stage.innerHTML = shell('帶看預約', '<span class="badge badge--accent" data-sh-badge>待帶看 1 組</span>',
          panel('詢問紀錄', '<div class="f03-lead"><b>' + esc(NEW_TENANT) + '</b><span>591・2026/09/23 20:31</span><span class="muted">想看週末</span></div>' +
            '<div class="f03-lead"><b>呂○○</b><span>LINE 社群・2026/09/22 13:02</span><span class="muted">詢問可否養貓</span></div>') +
          panel('本週日曆', '<div class="f03-cal f03-stage-cal">' + CAL.map(function (c) {
            var dots = '';
            for (var i = 0; i < c.n; i++) dots += '<span class="f03-cal-dot"></span>';
            return '<span class="f03-cal-day"' + (c.target ? ' data-day' : '') + '>' +
              '<span class="f03-cal-dow">' + c.dow + '</span>' +
              '<span class="f03-cal-date">' + c.d + '</span>' +
              '<span class="f03-cal-dots">' + dots + '</span></span>';
          }).join('') + '</div>' +
            '<div class="mt-8" data-showings>' +
            '<div class="f03-showing"><span class="f03-showing-when">09/26 14:00</span>' +
            '<span class="f03-showing-who">呂○○<span class="muted">　帶看 劉○○</span></span>' +
            '<span class="badge badge--neutral">已預約</span></div></div>'));
        api.enter(stage.querySelectorAll('.f03-stage-panel'));
      },
      after: function (stage, api) {
        var day = stage.querySelector('[data-day]');
        return api.cursor(day).then(function () {
          day.querySelector('.f03-cal-dots').innerHTML = '<span class="f03-cal-dot"></span>';
          day.classList.add('is-picked');
          var box = stage.querySelector('[data-showings]');
          box.insertAdjacentHTML('beforeend', '<div class="f03-showing">' +
            '<span class="f03-showing-when">09/24 19:00</span>' +
            '<span class="f03-showing-who">' + esc(NEW_TENANT) + '<span class="muted">　帶看 陳○○</span></span>' +
            '<span class="badge badge--accent">已預約</span></div>');
          return api.enter(box.lastElementChild);
        }).then(function () {
          return api.badge(stage.querySelector('[data-sh-badge]'), '待帶看 2 組', 'accent');
        });
      }
    },

    {
      title: '收訂金就換一欄',
      text: '登記 ' + fmt.num(DEPOSIT) + ' 元訂金，' + UID + ' 立刻換到已收訂。每一間走到哪一步都有紀錄。',
      render: function (stage, api) {
        stage.innerHTML = shell('招租看板', A.badge('共 10 間在流程中', 'neutral'),
          board('帶看預約', { note: '2 組帶看' }) +
          panel('', '<div class="row row--between"><span>' + esc(UID) + '　訂金 <b class="f03-stage-num" data-deposit>0</b> 元　' +
            esc(NEW_TENANT) + '</span><span class="badge badge--accent" data-deal>帶看預約</span></div>', 'f03-stage-foot'),
          'f03-stage-body--one');
        api.enter(stage.querySelector('.f03-sb'));
      },
      after: function (stage, api) {
        var card = stage.querySelector('[data-focus]');
        return api.count(stage.querySelector('[data-deposit]'), 0, DEPOSIT, 900).then(function () {
          return api.badge(stage.querySelector('[data-deal]'), '已收訂', 'ok');
        }).then(function () {
          stage.querySelector('[data-stage="已收訂"] .f03-sb-cards').insertBefore(card, stage.querySelector('[data-stage="已收訂"] .f03-sb-cards').firstChild);
          card.querySelector('[data-focus-note]').textContent = '訂金 5,000';
          api.count(stage.querySelector('[data-count="帶看預約"]'), 2, 1, 400);
          api.count(stage.querySelector('[data-count="已收訂"]'), 1, 2, 400);
          return api.enter(card);
        });
      }
    },

    {
      title: '租約與點交表備好',
      text: '租約與點交表照這間的租金、押金自動帶入，不用再打一次，也不會打錯。',
      render: function (stage, api) {
        stage.innerHTML = shell('自動產生文件', A.badge('已收訂', 'ok'),
          panel('這次簽約的資料', '<dl class="kv kv--stack">' +
            '<dt>新房客</dt><dd>' + esc(NEW_TENANT) + '</dd>' +
            '<dt>月租</dt><dd>' + esc(fmt.money(RENT)) + '</dd>' +
            '<dt>押金</dt><dd>' + esc(fmt.money(RENT * 2)) + '（訂金 ' + fmt.num(DEPOSIT) + ' 元折抵）</dd>' +
            '<dt>租期</dt><dd>2026/11/01 ～ 2027/10/31</dd></dl>') +
          panel('要產生的文件', A.checklist([
            { id: 'd1', label: '租賃契約書', hint: '雙方資料與條款自動帶入' },
            { id: 'd2', label: '點交表', hint: '家具設備與鑰匙數量' },
            { id: 'd3', label: '押金收據', hint: '含訂金折抵紀錄' }
          ], null, { id: 'f03-tour-doc' })));
        api.enter(stage.querySelectorAll('.f03-stage-panel'));
      },
      after: function (stage, api) {
        var items = stage.querySelectorAll('.checklist-item');
        return api.check(items[0])
          .then(function () { return api.check(items[1]); })
          .then(function () { return api.check(items[2]); })
          .then(function () { return api.highlight(items[2].closest('.f03-stage-panel')); });
      }
    },

    {
      title: '入住完成，警示解除',
      text: UID + ' 只空了 ' + DAYS_THIS + ' 天，比平均快 ' + (AVG - DAYS_THIS) + ' 天。空房警示解除，租金開始計收。',
      render: function (stage, api) {
        stage.innerHTML = shell('招租看板', A.badge('流程完成', 'ok'),
          '<div class="grid grid--3 f03-stage-kpis">' +
            A.kpi({ label: '這次空置天數', valueHtml: '<span data-k1>' + DAYS_THIS + '</span>', unit: ' 天', hint: '全部平均 ' + AVG + ' 天' }) +
            A.kpi({ label: '未完成待辦', valueHtml: '<span data-k2>4</span>', unit: ' 件', hint: '四件全部做完' }) +
            A.kpi({ label: '本月入住', valueHtml: '<span data-k3>6</span>', unit: ' 間', kind: 'ok', hint: '含 ' + UID }) +
          '</div>' +
          '<div data-ok>' + A.alert('', 'ok', {
            title: UID + ' 已入住，空房警示解除',
            html: '<p>' + esc(NEW_TENANT) + ' 已入住，月租 ' + esc(fmt.money(RENT)) + ' 開始計收。整條流程從不續租通知到入住，全程都有紀錄。</p>'
          }) + '</div>' +
          board('已入住', { note: '已入住' }),
          'f03-stage-body--one');
        api.enter(stage.querySelectorAll('.kpi, [data-ok]'));
      },
      after: function (stage, api) {
        api.count(stage.querySelector('[data-k2]'), 4, 0, 800);
        api.count(stage.querySelector('[data-k3]'), 6, 7, 800);
        api.count(stage.querySelector('[data-k1]'), 0, DAYS_THIS, 800);
        return api.highlight(stage.querySelector('[data-focus]')).then(function () {
          return api.highlight(stage.querySelector('[data-ok] .alert'));
        });
      }
    }
  ];

  /* ---------------------------------------------------------------- 掛載 */
  var opts = { feature: 'f03', autoplayMs: 5600, steps: steps };
  var pin = (window.location.hash || '').match(/step=(last|\d+)/);
  if (pin) {
    opts.start = pin[1] === 'last' ? steps.length - 1 : Math.max(0, Math.min(steps.length - 1, parseInt(pin[1], 10) - 1));
    opts.autoplay = false;
  }
  TP.mount(host, opts);
  A.reveal();
})();
