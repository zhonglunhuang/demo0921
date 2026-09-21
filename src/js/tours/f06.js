/* js/tours/f06.js — 設備履歷（f06）功能導覽 8 步
 * 契約：docs/DESIGN.md §4（播放器與 api）、§5（假資料）、§6（文案）。
 * 主角：A07（中壢，套房）的日立冷氣 EQ-A07-1——5 年維修 4 次、累計 13,000 元。
 * 每一步都把「當下的系統畫面」重新組出來，再用 api 讓畫面真的動：
 * 對話逐字出現、清單逐筆淡入、金額跳動、標籤變色、待辦打勾、游標示意點擊。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D || !window.TourPlayer) return;

  var esc = A.esc;
  var icon = A.icon;
  var fmt = A.fmt;

  var UNIT = D.unit('A07');
  var TENANT = D.tenantOf('A07');
  var AC = D.equipmentById('EQ-A07-1');
  var FRIDGE = D.equipmentById('EQ-A07-2');
  var HEATER = D.equipmentById('EQ-A07-3');
  var STAFF = D.staffById('S02');
  var TASK = D.todos.filter(function (t) { return t.kind === 'equipment' && t.unitId === 'A07'; })[0];

  var TOTAL = AC.totalRepairCost;            /* 13,000 */
  var NEW_PRICE = AC.advice.suggestCost;     /* 22,000 */
  var RATIO = Math.round(TOTAL / NEW_PRICE * 100);   /* 59 */
  var PO_ID = 'PO-2609-01';
  var PO_DUE = '2026-09-26';
  var NEW_WARRANTY = '2028-09-26';

  var KIND_ICON = { 冷氣: 'wind', 冰箱: 'box', 熱水器: 'thermometer' };

  /* 動畫用的固定時間版本：無頭瀏覽器不一定送 frame，動畫照放但不接在它的 Promise 後面，
   * 改用固定時間補上最終值，確保截圖與慢裝置上畫面一定到位。 */
  function countTo(api, el, from, to, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? 800 : ms;
    api.count(el, from, to, dur);
    return api.wait(dur + 80).then(function () {
      el.textContent = String(to).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    });
  }
  function typeTo(api, el, text, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? Math.min(2000, Math.max(400, text.length * 55)) : ms;
    api.type(el, text, dur);
    return api.wait(dur + 120).then(function () { el.textContent = text; });
  }

  /* ================================================================
   * 舞台零件（960 × 600）
   * ================================================================ */
  function eqTile(e, focus, tag) {
    tag = tag || { text: e.inWarranty ? '保固中' : '已過保固', kind: e.inWarranty ? 'ok' : 'neutral' };
    return '<div class="f06s-eq' + (focus ? ' is-focus' : '') + '" data-eq="' + esc(e.id) + '">' +
      '<div class="f06s-eq-kind">' + icon(KIND_ICON[e.kind] || 'box') + esc(e.kind) + '</div>' +
      '<div class="f06s-eq-sub">' + esc(e.brand + ' ' + e.model) + '</div>' +
      '<div class="f06s-eq-sub"><span class="badge badge--' + tag.kind + '" data-eq-tag="' + esc(e.id) + '">' + esc(tag.text) + '</span></div>' +
      '</div>';
  }

  /* acTag：冷氣那張卡的標籤（第 6 步之後已經是「建議汰換」） */
  function eqCard(focusId, acTag) {
    return '<div class="f06s-card" data-card="eqs">' +
      '<h4>' + icon('layers') + '列管設備 3 台</h4>' +
      '<div class="f06s-eqs">' +
        eqTile(AC, focusId === AC.id, acTag) + eqTile(FRIDGE, false) + eqTile(HEATER, false) +
      '</div></div>';
  }
  var TAG_REPLACE = { text: '建議汰換', kind: 'danger' };

  /* rows: 要顯示幾筆維修紀錄（0 = 只有表頭）；total: 累計金額的起始值 */
  function historyCard(rows, total) {
    var list = AC.repairs.slice().reverse().slice(0, rows);   /* 新的在上 */
    return '<div class="f06s-card" data-card="history">' +
      '<h4>' + icon('history') + '維修履歷</h4>' +
      '<div class="f06s-rows">' +
        '<div class="f06s-row is-head"><span>日期</span><span>維修內容</span><span class="f06s-cell-num">金額</span><span class="f06s-cell-sub">廠商</span></div>' +
        list.map(function (r, i) {
          var v = r.vendorId ? D.vendorById(r.vendorId) : null;
          return '<div class="f06s-row" data-row="' + i + '">' +
            '<span>' + esc(fmt.date(r.date)) + '</span>' +
            '<span>' + esc(r.desc) + '</span>' +
            '<span class="f06s-cell-num">' + esc(fmt.num(r.cost)) + '</span>' +
            '<span class="f06s-cell-sub">' + esc(v ? v.name : '現場處理') + '</span></div>';
        }).join('') +
      '</div>' +
      '<div class="f06s-total"><span class="f06s-total-label">5 年累計維修費</span>' +
        '<span><span class="f06s-num f06s-num--sm" data-total>' + fmt.num(total) + '</span><span class="f06s-unit">元</span></span></div>' +
      '</div>';
  }

  function kpiRow(replace, warranty, watch) {
    function one(key, label, value, cls) {
      return '<div class="f06s-kpi" data-kpi="' + key + '"><div class="f06s-kpi-label">' + esc(label) + '</div>' +
        '<div class="f06s-kpi-value' + (cls ? ' ' + cls : '') + '"><span data-v>' + value + '</span><span class="f06s-unit">台</span></div></div>';
    }
    return '<div class="f06s-kpis">' +
      one('replace', '建議汰換', replace, replace ? 'is-danger' : 'is-ok') +
      one('warranty', '保固中', warranty, null) +
      one('watch', '留意', watch, null) +
      '</div>';
  }

  /* 設備基本資料卡（第 2、3 步右欄） */
  function infoCard() {
    var age = (function () {
      var a = A.parseDate(AC.purchased), b = A.parseDate(A.today);
      var m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
      return Math.floor(m / 12) + ' 年 ' + (m % 12) + ' 個月';
    })();
    var rows = [
      ['品牌型號', AC.brand + ' ' + AC.model],
      ['購入日期', fmt.date(AC.purchased)],
      ['保固到期', fmt.date(AC.warrantyEnd) + '（已過保）'],
      ['機齡', age],
      ['登記人', STAFF.name]
    ];
    return '<div class="f06s-card" data-card="info">' +
      '<h4>' + icon('file') + '這台冷氣的基本資料</h4>' +
      '<div class="f06s-kv">' + rows.map(function (r) {
        return '<span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span>';
      }).join('') + '</div></div>';
  }

  /* 比較卡：累計維修費 ÷ 新機參考價 */
  function compareCard(pct) {
    return '<div class="f06s-card" data-card="compare">' +
      '<h4>' + icon('chart') + '修下去划算嗎</h4>' +
      '<div class="f06s-total"><span class="f06s-total-label">已花掉新機的</span>' +
        '<span><span class="f06s-num" data-pct>' + pct + '</span><span class="f06s-unit">%</span></span></div>' +
      '<div class="f06s-bar">' + A.progress(pct, { max: 100, kind: 'danger', lg: true }) + '</div>' +
      '<div class="f06s-eq-sub" style="margin-top:8px">' +
        esc('累計維修 ' + fmt.money(TOTAL) + '　新機參考價 ' + fmt.money(NEW_PRICE)) + '</div>' +
      '</div>';
  }

  function aiCard(withButton) {
    return '<div class="f06s-ai" data-card="ai">' +
      '<div class="f06s-ai-top">' + icon('sparkles') + '<span>AI 汰換建議</span></div>' +
      '<p data-ai-text></p>' +
      (withButton ? '<div class="f06s-btn-wrap"><button type="button" class="btn btn--primary btn--block btn--sm" data-btn>' +
        icon('clipboard') + '<span>建立採購待辦</span></button></div>' : '') +
      '</div>';
  }

  var TASK_STEPS = [
    { id: 'po', label: '開出採購單 ' + PO_ID + '（參考預算 ' + fmt.money(NEW_PRICE) + '）' },
    { id: 'owner', label: '指派負責人' + STAFF.name + '（' + STAFF.roleName + '）' },
    { id: 'due', label: '排進待辦清單，期限 ' + fmt.date(PO_DUE) }
  ];

  function taskCard(doneCount) {
    return '<div class="f06s-card" data-card="task">' +
      '<h4>' + icon('clipboard') + '採購待辦 ' + esc(PO_ID) + '<span class="badge badge--accent" data-task-status style="margin-left:6px">待處理</span></h4>' +
      TASK_STEPS.map(function (t, i) {
        return '<div class="f06s-task' + (i < doneCount ? ' is-done' : '') + '" data-task="' + t.id + '">' +
          '<span class="f06s-task-box checkbox">' + icon('check') + '</span><span>' + esc(t.label) + '</span></div>';
      }).join('') +
      '<div class="f06s-eq-sub" style="margin-top:8px">' + esc('建立依據：待辦 ' + TASK.id + '（' + TASK.title + '）') + '</div>' +
      '</div>';
  }

  function newMachineCard() {
    return '<div class="f06s-card" data-card="new">' +
      '<h4>' + icon('check-circle') + '換新後的這台冷氣</h4>' +
      '<div class="f06s-eq is-focus">' +
        '<div class="f06s-eq-kind">' + icon('wind') + '冷氣</div>' +
        '<div class="f06s-eq-sub">' + esc('日立 RAS-28NJK（' + fmt.money(NEW_PRICE) + '）') + '</div>' +
        '<div class="f06s-eq-sub"><span class="badge badge--ok" data-new-tag>保固中</span></div>' +
      '</div>' +
      '<div class="f06s-total"><span class="f06s-total-label">這台的累計維修費</span>' +
        '<span><span class="f06s-num f06s-num--sm" data-total>' + fmt.num(TOTAL) + '</span><span class="f06s-unit">元</span></span></div>' +
      '<div class="f06s-eq-sub" style="margin-top:8px">' + esc('保固到 ' + fmt.date(NEW_WARRANTY) + '，兩年內維修由原廠負責。') + '</div>' +
      '</div>';
  }

  /* cfg: alert{kind,text}, left[], right[], statusBadge */
  function screen(cfg) {
    return '<div class="f06s">' +
      '<div class="f06s-top">' +
        '<h3>' + esc(UNIT.id + ' 設備履歷') + '</h3>' +
        '<span class="badge badge--' + (cfg.statusKind || 'ok') + '" data-status>' + esc(cfg.status || '出租中') + '</span>' +
        '<span class="f06s-meta">' + esc(UNIT.region + ' · A 棟 ' + UNIT.floor + ' 樓 · ' + UNIT.type + ' ' + UNIT.ping + ' 坪　｜　租客 ' + TENANT.name) + '</span>' +
      '</div>' +
      '<div class="f06s-alert f06s-alert--' + cfg.alert.kind + '" data-alert>' +
        icon(cfg.alert.kind === 'ok' ? 'check-circle' : 'alert') +
        '<span data-alert-text>' + esc(cfg.alert.text) + '</span></div>' +
      '<div class="f06s-grid">' +
        '<div>' + cfg.left.join('') + '</div>' +
        '<div>' + cfg.right.join('') + '</div>' +
      '</div></div>';
  }

  var ALERT_REPORT = { kind: 'warn', text: '租客回報冷氣不冷，這是這台冷氣第 5 次報修' };
  var ALERT_REPLACE = { kind: 'danger', text: '這台冷氣建議汰換：5 年維修 4 次、累計 ' + fmt.money(TOTAL) };
  var ALERT_DONE = { kind: 'ok', text: 'A07 冷氣已換新，汰換警示解除，維修費歸零' };

  /* 第 1 步用的 LINE 報修畫面 */
  function reportScreen() {
    return '<div class="f06s">' +
      '<div class="f06s-top"><h3>租客報修</h3>' +
        '<span class="badge badge--warn">待處理</span>' +
        '<span class="f06s-meta">' + esc('2026/09/21 09:12　｜　' + UNIT.id + '　' + TENANT.name) + '</span></div>' +
      '<div class="f06s-grid">' +
        '<div class="f06s-phone">' + A.phone({
          title: '租務中樞', sub: 'A07 ' + TENANT.name, time: '9:12', input: false, sm: true,
          messages: [{ from: 'day', text: '今天' }]
        }) + '</div>' +
        '<div>' +
          '<div class="f06s-card" data-card="wo">' +
            '<h4>' + icon('wrench') + '系統自動開單</h4>' +
            '<div class="f06s-eq-sub">物件</div><div data-wo-unit>' + esc(UNIT.id + '　' + UNIT.region + ' · ' + UNIT.type) + '</div>' +
            '<div class="f06s-eq-sub" style="margin-top:8px">項目</div><p data-wo-item style="font-size:14px"></p>' +
          '</div>' +
          '<div class="f06s-card" data-card="hint">' +
            '<h4>' + icon('sparkles') + '派工前先看一件事</h4>' +
            '<p class="f06s-eq-sub" data-hint style="font-size:13px"></p>' +
          '</div>' +
        '</div>' +
      '</div></div>';
  }

  /* ================================================================
   * 8 步
   * ================================================================ */
  var steps = [
    {
      title: '冷氣又壞了一次',
      text: '租客在 LINE 說冷氣不冷，系統自動開單。以前到這裡就直接派工，修完了事。',
      render: function (stage) {
        stage.innerHTML = reportScreen();
      },
      after: function (stage, api) {
        var phone = stage.querySelector('.phone');
        return api.enter(stage.querySelectorAll('.phone, .f06s-card'))
          .then(function () { A.phoneTyping(phone, true); return api.wait(700); })
          .then(function () {
            A.phoneAppend(phone, { from: 'them', text: '冷氣又不冷了，昨天開整晚還是熱的', at: '09:12', avatar: '葉' });
            return api.wait(600);
          })
          .then(function () {
            A.phoneAppend(phone, { from: 'me', text: '收到，已幫你開單 WO-1055，今天安排師傅', at: '09:12', read: true });
            return typeTo(api, stage.querySelector('[data-wo-item]'), '冷氣不冷，需到場檢修');
          })
          .then(function () {
            return typeTo(api, stage.querySelector('[data-hint]'), '這台冷氣不是第一次壞。派工之前，先看它的維修紀錄。');
          });
      },
      autoplayMs: 8000
    },
    {
      title: '一鍵調出設備履歷',
      text: '每間房的設備都登記在系統裡。點開 A07，三台設備的品牌、型號、保固全部在這頁。',
      render: function (stage) {
        stage.innerHTML = screen({
          alert: ALERT_REPORT,
          left: [eqCard(null)],
          right: [kpiRow(1, 74, 2), infoCard()]
        });
      },
      after: function (stage, api) {
        var tile = stage.querySelector('[data-eq="' + AC.id + '"]');
        return api.enter(stage.querySelectorAll('.f06s-card, .f06s-kpi'))
          .then(function () { return api.cursor(tile); })
          .then(function () { tile.classList.add('is-focus'); return api.highlight(tile); });
      },
      autoplayMs: 6000
    },
    {
      title: '五年修過四次',
      text: '這台日立冷氣從 2021 年買進來，補冷媒、通排水、換馬達、換電容，四次都有紀錄。',
      render: function (stage) {
        stage.innerHTML = screen({
          alert: ALERT_REPORT,
          left: [eqCard(AC.id), historyCard(4, 0)],
          right: [kpiRow(1, 74, 2), infoCard()]
        });
        Array.prototype.forEach.call(stage.querySelectorAll('[data-row]'), function (r) { r.style.opacity = '0'; });
      },
      after: function (stage, api) {
        var rows = stage.querySelectorAll('[data-row]');
        Array.prototype.forEach.call(rows, function (r) { r.style.opacity = ''; });
        return api.enter(rows)
          .then(function () { return countTo(api, stage.querySelector('[data-total]'), 0, TOTAL, 1000); });
      },
      autoplayMs: 6500
    },
    {
      title: '維修費快追上新機',
      text: '四次加起來 ' + fmt.money(TOTAL) + '，一台新冷氣 ' + fmt.money(NEW_PRICE) + '。等於錢已經花掉六成。',
      render: function (stage) {
        stage.innerHTML = screen({
          alert: ALERT_REPORT,
          left: [eqCard(AC.id), historyCard(4, TOTAL)],
          right: [kpiRow(1, 74, 2), infoCard(), compareCard(0)]
        });
      },
      after: function (stage, api) {
        var card = stage.querySelector('[data-card="compare"]');
        var bar = card.querySelector('.progress-bar');
        if (bar) bar.style.width = '0%';
        return api.enter(card)
          .then(function () {
            if (bar) bar.style.width = RATIO + '%';
            return countTo(api, card.querySelector('[data-pct]'), 0, RATIO, 900);
          })
          .then(function () {
            /* 慢裝置或沒有動畫時，直接把長條補到最終長度 */
            if (bar) { bar.style.transition = 'none'; bar.style.width = RATIO + '%'; }
            return api.highlight(card);
          });
      },
      autoplayMs: 6000
    },
    {
      title: 'AI 建議汰換',
      text: '修的次數與金額都過線，系統直接說：別再修了，換一台。標籤也跟著變紅。',
      render: function (stage) {
        stage.innerHTML = screen({
          alert: ALERT_REPORT,
          left: [eqCard(AC.id), historyCard(4, TOTAL)],
          right: [kpiRow(1, 74, 2), aiCard(false)]
        });
      },
      after: function (stage, api) {
        var alertBox = stage.querySelector('[data-alert]');
        return api.enter(stage.querySelector('[data-card="ai"]'))
          .then(function () {
            return typeTo(api, stage.querySelector('[data-ai-text]'),
              AC.advice.text + '。換新約 ' + fmt.money(NEW_PRICE) + '，保固重新起算 2 年。');
          })
          .then(function () { return api.badge(stage.querySelector('[data-eq-tag="' + AC.id + '"]'), '建議汰換', 'danger'); })
          .then(function () {
            alertBox.className = 'f06s-alert f06s-alert--danger';
            alertBox.innerHTML = icon('alert') + '<span data-alert-text>' + esc(ALERT_REPLACE.text) + '</span>';
            return api.enter(alertBox);
          });
      },
      autoplayMs: 8000
    },
    {
      title: '一鍵建立採購待辦',
      text: '老闆或管理員按一下，採購單、負責人、期限一次生成，不用另外開表單。',
      render: function (stage) {
        stage.innerHTML = screen({
          alert: ALERT_REPLACE,
          left: [eqCard(AC.id, TAG_REPLACE), historyCard(4, TOTAL)],
          right: [kpiRow(1, 74, 2), aiCard(true)]
        });
        stage.querySelector('[data-ai-text]').textContent =
          AC.advice.text + '。換新約 ' + fmt.money(NEW_PRICE) + '，保固重新起算 2 年。';
      },
      after: function (stage, api) {
        var btn = stage.querySelector('[data-btn]');
        return api.enter(stage.querySelector('[data-card="ai"]'))
          .then(function () { return api.cursor(btn); })
          .then(function () { return api.highlight(btn); });
      },
      autoplayMs: 6000
    },
    {
      title: '待辦直接派給管理員',
      text: '採購單 ' + PO_ID + ' 指派給' + STAFF.name + '，期限 ' + fmt.date(PO_DUE) + '。誰要辦、辦到哪天，寫得清清楚楚。',
      render: function (stage) {
        stage.innerHTML = screen({
          alert: ALERT_REPLACE,
          left: [eqCard(AC.id, TAG_REPLACE), historyCard(4, TOTAL)],
          right: [kpiRow(1, 74, 2), taskCard(0)]
        });
      },
      after: function (stage, api) {
        var card = stage.querySelector('[data-card="task"]');
        var items = card.querySelectorAll('[data-task]');
        var i = 0;
        function next() {
          if (i >= items.length) return api.wait(0);
          var node = items[i];
          i += 1;
          return api.check(node).then(next);
        }
        return api.enter(card).then(next);
      },
      autoplayMs: 7000
    },
    {
      title: '換新後警示歸零',
      text: '新冷氣上線、保固重新起算，汰換警示消失，這台的維修費回到 0 元。',
      render: function (stage) {
        stage.innerHTML = screen({
          alert: ALERT_REPLACE,
          left: [eqCard(AC.id, TAG_REPLACE), taskCard(3)],
          right: [kpiRow(1, 74, 2), newMachineCard()]
        });
      },
      after: function (stage, api) {
        var alertBox = stage.querySelector('[data-alert]');
        var newCard = stage.querySelector('[data-card="new"]');
        return api.enter(newCard)
          .then(function () { return api.badge(stage.querySelector('[data-task-status]'), '完成', 'ok'); })
          .then(function () { return api.badge(stage.querySelector('[data-eq-tag="' + AC.id + '"]'), '保固中', 'ok'); })
          .then(function () {
            return api.badge(stage.querySelector('[data-new-tag]'), '保固到 ' + fmt.date(NEW_WARRANTY), 'ok');
          })
          .then(function () {
            alertBox.className = 'f06s-alert f06s-alert--ok';
            alertBox.innerHTML = icon('check-circle') + '<span data-alert-text>' + esc(ALERT_DONE.text) + '</span>';
            return api.enter(alertBox);
          })
          .then(function () {
            countTo(api, newCard.querySelector('[data-total]'), TOTAL, 0, 900);
            countTo(api, stage.querySelector('[data-kpi="warranty"] [data-v]'), 74, 75, 900);
            return countTo(api, stage.querySelector('[data-kpi="replace"] [data-v]'), 1, 0, 900);
          })
          .then(function () {
            var k = stage.querySelector('[data-kpi="replace"] .f06s-kpi-value');
            if (k) { k.classList.remove('is-danger'); k.classList.add('is-ok'); }
          });
      },
      autoplayMs: 8000
    }
  ];

  /* 直接看某一步：網址加 #step=last 或 #step=3（截圖與分享用） */
  var start = 0;
  var autoplay = true;
  var m = /step=(last|\d+)/.exec(window.location.hash || '');
  if (m) {
    start = m[1] === 'last' ? steps.length - 1 : Math.max(0, Math.min(steps.length - 1, parseInt(m[1], 10) - 1));
    autoplay = false;
  }

  TourPlayer.mount(document.getElementById('player'), {
    feature: 'f06',
    autoplayMs: 6000,
    start: start,
    autoplay: autoplay,
    steps: steps
  });
})();
