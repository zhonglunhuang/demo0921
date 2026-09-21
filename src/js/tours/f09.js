/* js/tours/f09.js — 鑰匙與門禁管理（f09）功能導覽 8 步
 * 契約：docs/DESIGN.md §4（播放器與 api）、§5（假資料）、§6（文案）。
 * 主角：B15（中壢 B 棟，已通知不續租，2026/10/14 退租點交）。
 * 流程：全社區鑰匙總表 → 退租點交清點 → 門禁磁扣少一張 → 自動列入押金扣款
 *      → 智慧鎖密碼失效 → 在外鑰匙數歸位。
 * 每一步都把「當下的系統畫面」重新組出來，再用 api 讓畫面真的動：
 * 數字跳動、清單打勾、標籤變色、文字逐字出現、游標示意點擊。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D || !window.TourPlayer) return;

  var esc = A.esc;
  var icon = A.icon;

  var UNIT = D.unit('B15');
  var TENANT = D.tenantOf('B15');
  var DEP = D.depositOf('B15');
  var HANDOVER = '2026-10-14';

  /* 與操作頁同一組數字（js/app/f09.js） */
  var ITEMS = [
    { key: 'key', name: '鑰匙', icon: 'key', held: 2, price: D.keyPrices.key },
    { key: 'card', name: '門禁磁扣', icon: 'credit-card', held: 2, price: D.keyPrices.card },
    { key: 'mailbox', name: '信箱鑰匙', icon: 'inbox', held: 1, price: D.keyPrices.mailbox }
  ];
  var TOTAL = 5;                       /* 租客手上 5 件 */
  var MISS_PRICE = D.keyPrices.card;   /* 短少 1 張門禁磁扣 → 300 元 */
  var DEP_AMOUNT = DEP.amount;         /* 14,000 元 */
  var DEP_BASE = 860;                  /* 既有扣款：欠繳水電費 */
  var REFUND_BEFORE = DEP_AMOUNT - DEP_BASE;
  var REFUND_AFTER = DEP_AMOUNT - DEP_BASE - MISS_PRICE;

  var OUT_BEFORE = 443, OUT_AFTER = 438;     /* 在外鑰匙 */
  var OFFICE_BEFORE = 17, OFFICE_AFTER = 21; /* 公司保管 */
  var WAIT_BEFORE = 2, WAIT_AFTER = 1;       /* 待點交 */
  var STOCK = 460;
  var STOCK_BY_ITEM = [
    { name: '鑰匙', n: 206 }, { name: '門禁磁扣', n: 143 },
    { name: '車庫遙控器', n: 8 }, { name: '信箱鑰匙', n: 103 }
  ];
  var UNIT_ROWS = [
    { id: 'A01', who: '租客 王○○', n: 5, tag: '出租中', kind: 'ok' },
    { id: 'B15', who: '租客 ' + TENANT.name, n: 5, tag: '待點交', kind: 'warn' },
    { id: 'C08', who: '空房，公司保管', n: 4, tag: '招租中', kind: 'neutral' },
    { id: 'C20', who: '空房，整備中', n: 4, tag: '整備中', kind: 'neutral' },
    { id: 'E03', who: '租客 陳○○', n: 4, tag: '待點交', kind: 'warn' }
  ];

  /* 入住密碼：與操作頁同一套算法，兩頁看到的密碼一樣 */
  function pinOf(unitId) {
    var n = 0;
    for (var i = 0; i < unitId.length; i++) n = n * 31 + unitId.charCodeAt(i);
    return String(100000 + (Math.abs(n) * 7919) % 900000);
  }
  var PIN = pinOf('B15');

  function money(n) { return A.fmt.money(n); }
  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ================================================================
   * 舞台零件（960 × 600）
   * ================================================================ */
  /* marks：{itemKey: 'done' | 'short'} */
  function listCard(marks, counting) {
    return '<div class="f09s-card" data-card="list">' +
      '<h4>' + icon('key') + '鑰匙與門禁清單' +
        '<span class="badge badge--neutral" style="margin-left:auto">共 <span data-total>' + TOTAL + '</span> 件</span></h4>' +
      ITEMS.map(function (i) {
        var m = marks[i.key] || 'hold';
        var st = m === 'done' ? '已回收' : (m === 'short' ? '短少 1 件' : (counting ? '待清點' : '租客持有'));
        var kind = m === 'done' ? 'ok' : (m === 'short' ? 'danger' : (counting ? 'warn' : 'accent'));
        return '<div class="f09s-row' + (m === 'done' ? ' is-done' : '') + (m === 'short' ? ' is-short' : '') + '" data-item="' + i.key + '">' +
          '<span class="f09s-row-name"><span class="f09s-box checkbox">' + icon('check') + '</span>' +
            icon(i.icon) + esc(i.name) + '</span>' +
          '<span class="f09s-qty">租客領用 ' + i.held + ' 件</span>' +
          '<span class="badge badge--' + kind + '" data-state="' + i.key + '">' + esc(st) + '</span>' +
          '</div>';
      }).join('') +
      '<div class="f09s-sign">點交 ' + esc(A.fmt.date(HANDOVER)) + ' 14:00　現場清點人 陳○○</div>' +
      '</div>';
  }

  function stockCard() {
    return '<div class="f09s-card" data-card="stock">' +
      '<h4>' + icon('database') + '全社區裝置總量' +
        '<span class="badge badge--neutral" style="margin-left:auto">103 間物件</span></h4>' +
      STOCK_BY_ITEM.map(function (s) {
        return '<div class="f09s-line"><span>' + esc(s.name) + '</span><strong>' + comma(s.n) + ' 件</strong></div>';
      }).join('') +
      '<div class="f09s-line f09s-line--total"><span>合計</span>' +
        '<strong><span data-stock>' + comma(STOCK) + '</span> 件</strong></div>' +
      '</div>';
  }

  function unitsCard() {
    return '<div class="f09s-card" data-card="units">' +
      '<h4>' + icon('list') + '每間房各有幾把</h4>' +
      UNIT_ROWS.map(function (u) {
        return '<div class="f09s-row" data-unit="' + u.id + '">' +
          '<span class="f09s-row-name"><strong>' + esc(u.id) + '</strong>' +
            '<span class="f09s-qty">' + esc(u.who) + '</span></span>' +
          '<span class="f09s-qty">' + u.n + ' 件</span>' +
          '<span class="badge badge--' + u.kind + '">' + esc(u.tag) + '</span>' +
          '</div>';
      }).join('') + '</div>';
  }

  function signCard() {
    return '<div class="f09s-card" data-card="sign">' +
      '<h4>' + icon('history') + '領用與歸還紀錄</h4>' +
      ITEMS.map(function (i) {
        return '<div class="f09s-line"><span>' + esc(A.fmt.date(UNIT.moveIn)) + '　領用' + esc(i.name) + ' ' + i.held + ' 件</span>' +
          '<strong class="muted small">租客簽收</strong></div>';
      }).join('') +
      '<p class="f09s-sign">入住當天租客當面簽收，簽收人 陳○○。退租時照這張紀錄清點，少一件都看得出來。</p>' +
      '</div>';
  }

  function kpiRow(out, office, wait) {
    function one(key, label, value, unit) {
      return '<div class="f09s-kpi" data-kpi="' + key + '"><div class="f09s-kpi-label">' + esc(label) + '</div>' +
        '<div class="f09s-kpi-value"><span data-v>' + comma(value) + '</span><small>' + esc(unit) + '</small></div></div>';
    }
    return '<div class="f09s-kpis">' +
      one('out', '在外鑰匙', out, '件') +
      one('office', '公司保管', office, '件') +
      one('wait', '待點交', wait, '間') +
      '</div>';
  }

  function priceCard(cost) {
    return '<div class="f09s-card" data-card="price">' +
      '<h4>' + icon('tag') + '短少賠償牌價</h4>' +
      ITEMS.map(function (i) {
        return '<div class="f09s-line"><span>' + esc(i.name) + '</span><strong>' + esc(money(i.price)) + '</strong></div>';
      }).join('') +
      '<div class="f09s-line f09s-line--total"><span>門禁磁扣短少 1 件</span>' +
        '<strong><span data-cost>' + comma(cost) + '</span> 元</strong></div>' +
      '<p class="f09s-sign">牌價寫在租約附件，系統照表算，不用現場喬。</p>' +
      '</div>';
  }

  function depositCard(extra, refund) {
    return '<div class="f09s-card" data-card="deposit">' +
      '<h4>' + icon('wallet') + '押金結算（' + esc(DEP.status) + '）</h4>' +
      '<div class="f09s-line"><span>押金總額</span><strong>' + esc(money(DEP_AMOUNT)) + '</strong></div>' +
      '<div class="f09s-line"><span>欠繳水電費</span><strong>− ' + esc(money(DEP_BASE)) + '</strong></div>' +
      '<div class="f09s-line" data-extra' + (extra ? '' : ' hidden') + '><span>門禁磁扣短少 1 件</span>' +
        '<strong>− <span data-deduct>' + comma(extra || 0) + '</span> 元</strong></div>' +
      '<div class="f09s-line f09s-line--total"><span>應退還租客</span>' +
        '<strong><span data-refund>' + comma(refund) + '</span> 元</strong></div>' +
      '</div>';
  }

  function lockCard(dead) {
    var now = dead ? 2 : 1;
    return '<div class="f09s-card" data-card="lock">' +
      '<h4>' + icon(dead ? 'unlock' : 'lock') + '智慧鎖門禁主機</h4>' +
      '<div class="f09s-pin"><span class="f09s-pin-code' + (dead ? ' is-dead' : '') + '" data-pin>' + esc(PIN) + '</span>' +
        '<span class="badge badge--' + (dead ? 'neutral' : 'ok') + '" data-pin-state>' + (dead ? '密碼已失效' : '密碼有效') + '</span></div>' +
      '<div class="f09s-flow">' + D.smartLockFlow.map(function (s, i) {
        return '<div class="f09s-flow-step' + (i === now ? ' is-now' : '') + '" data-flow="' + i + '">' +
          '<strong>' + esc(s.step) + '</strong><span>' + esc(s.text) + '</span></div>';
      }).join('') + '</div>' +
      '<p class="f09s-sign" data-lock-note></p>' +
      '</div>';
  }

  function buttonRow(label, on) {
    return '<div class="f09s-btn-wrap"><button type="button" class="btn btn--primary btn--block" data-btn' + (on ? '' : ' disabled') + '>' +
      icon('clipboard') + '<span>' + esc(label) + '</span></button></div>';
  }

  var META = UNIT.region + ' · B 棟 ' + UNIT.floor + ' 樓 · ' + UNIT.type + '　｜　租客 ' + TENANT.name;

  /* cfg: title, meta, badge{text,kind}, alert{kind,text}, left[], right[] */
  function screen(cfg) {
    return '<div class="f09s">' +
      '<div class="f09s-top">' +
        '<h3>' + esc(cfg.title || 'B15 鑰匙與門禁') + '</h3>' +
        '<span class="badge badge--' + cfg.badge.kind + '" data-status>' + esc(cfg.badge.text) + '</span>' +
        '<span class="f09s-meta">' + esc(cfg.meta || META) + '</span>' +
      '</div>' +
      '<div class="f09s-alert f09s-alert--' + cfg.alert.kind + '" data-alert>' +
        icon(cfg.alert.kind === 'ok' ? 'check-circle' : (cfg.alert.kind === 'danger' ? 'alert' : 'alert-circle')) +
        '<span data-alert-text>' + esc(cfg.alert.text) + '</span></div>' +
      '<div class="f09s-grid">' +
        '<div>' + (cfg.left || []).join('') + '</div>' +
        '<div>' + (cfg.right || []).join('') + '</div>' +
      '</div></div>';
  }

  /* B15 畫面的共用外框 */
  function b15(cfg) {
    return screen({
      badge: cfg.badge,
      alert: cfg.alert,
      left: [listCard(cfg.marks || {}, !!cfg.counting)].concat(cfg.button ? [buttonRow(cfg.button.label, cfg.button.on)] : []),
      right: cfg.right || []
    });
  }

  var AL_WAIT = { kind: 'warn', text: '距離點交還有 23 天，5 件鑰匙與門禁裝置還在租客手上' };
  var AL_COUNT = { kind: 'accent', text: '清點中：逐項按「收回」或「登記短少」，全部登記完才能完成點交' };
  var AL_SHORT = { kind: 'danger', text: '門禁磁扣短少 1 件，系統已依牌價算出賠償金額' };
  var AL_DONE = { kind: 'ok', text: 'B15 點交完成，鑰匙已歸位、短少已扣款、大門密碼已失效' };
  var DONE_MARKS = { key: 'done', mailbox: 'done', card: 'short' };

  function item(stage, key) { return stage.querySelector('[data-item="' + key + '"]'); }

  /* api.count / api.type 用 requestAnimationFrame 逐格改字；動畫照放，但不把後續
   * 步驟接在它的 Promise 後面，而是固定時間後換上乾淨節點寫入最終值——
   * 這樣不管瀏覽器何時送出 frame，畫面最後一定停在正確的數字或文字上。 */
  function settle(el, text) {
    var fresh = el.cloneNode(false);
    fresh.textContent = text;
    if (el.parentNode) el.parentNode.replaceChild(fresh, el);
    return fresh;
  }
  function countTo(api, el, from, to, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? 700 : ms;
    api.count(el, from, to, dur);
    return api.wait(dur + 80).then(function () { settle(el, comma(to)); });
  }
  function typeTo(api, el, text, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? Math.min(2000, Math.max(400, text.length * 60)) : ms;
    api.type(el, text, dur);
    return api.wait(dur + 120).then(function () { settle(el, text); });
  }

  /* ================================================================
   * 8 步
   * ================================================================ */
  var steps = [
    {
      title: '全社區鑰匙一張表',
      text: '103 間房的鑰匙、門禁磁扣、遙控器、信箱鑰匙各有幾把，誰領走、還了沒，系統都記著。',
      render: function (stage) {
        stage.innerHTML = screen({
          title: '鑰匙與門禁總表',
          meta: '中壢、內壢、平鎮、中原　｜　今天 ' + A.fmt.date(D.today),
          badge: { text: '103 間物件', kind: 'neutral' },
          alert: { kind: 'accent', text: '在外、公司保管與短少三個數字加起來，永遠等於總量' },
          left: [stockCard()],
          right: [kpiRow(0, 0, 0), unitsCard()]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('.f09s-card, .f09s-kpi'))
          .then(function () {
            countTo(api, stage.querySelector('[data-kpi="office"] [data-v]'), 0, OFFICE_BEFORE, 900);
            countTo(api, stage.querySelector('[data-kpi="wait"] [data-v]'), 0, WAIT_BEFORE, 900);
            return countTo(api, stage.querySelector('[data-kpi="out"] [data-v]'), 0, OUT_BEFORE, 900);
          })
          .then(function () { return api.highlight(stage.querySelector('[data-unit="B15"]')); });
      },
      autoplayMs: 6500
    },
    {
      title: '退租當天開點交單',
      text: 'B15 租客 10 月 14 日搬走。系統把他當初領走的 5 件裝置列成點交單，現場照著清點。',
      render: function (stage) {
        stage.innerHTML = b15({
          badge: { text: '待點交', kind: 'warn' },
          alert: AL_WAIT,
          right: [kpiRow(OUT_BEFORE, OFFICE_BEFORE, WAIT_BEFORE), signCard()],
          button: { label: '開始退租點交', on: true }
        });
        var t = stage.querySelector('[data-total]');
        if (t) t.textContent = '0';
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('[data-card="list"], [data-card="sign"]'))
          .then(function () { return countTo(api, stage.querySelector('[data-total]'), 0, TOTAL, 800); })
          .then(function () { return api.cursor(stage.querySelector('[data-btn]')); });
      },
      autoplayMs: 6000
    },
    {
      title: '逐項清點，當場打勾',
      text: '鑰匙 2 把、信箱鑰匙 1 把當場交回，按一下就打勾，誰點的、什麼時候點的都留紀錄。',
      render: function (stage) {
        stage.innerHTML = b15({
          badge: { text: '清點中', kind: 'accent' },
          alert: AL_COUNT,
          counting: true,
          right: [kpiRow(OUT_BEFORE, OFFICE_BEFORE, WAIT_BEFORE), signCard()],
          button: { label: '完成點交', on: false }
        });
      },
      after: function (stage, api) {
        return api.check(item(stage, 'key'))
          .then(function () { return api.badge(stage.querySelector('[data-state="key"]'), '已回收', 'ok'); })
          .then(function () { return api.check(item(stage, 'mailbox')); })
          .then(function () { return api.badge(stage.querySelector('[data-state="mailbox"]'), '已回收', 'ok'); })
          .then(function () { return api.highlight(item(stage, 'card')); });
      },
      autoplayMs: 6500
    },
    {
      title: '磁扣少一張，馬上標紅',
      text: '租客領走 2 張門禁磁扣，只交回 1 張。系統不用人記，當場就把短少標出來。',
      render: function (stage) {
        stage.innerHTML = b15({
          badge: { text: '清點中', kind: 'accent' },
          alert: AL_COUNT,
          counting: true,
          marks: { key: 'done', mailbox: 'done' },
          right: [kpiRow(OUT_BEFORE, OFFICE_BEFORE, WAIT_BEFORE), signCard()],
          button: { label: '完成點交', on: false }
        });
      },
      after: function (stage, api) {
        var row = item(stage, 'card');
        return api.cursor(row)
          .then(function () { return api.badge(stage.querySelector('[data-state="card"]'), '短少 1 件', 'danger'); })
          .then(function () {
            row.classList.add('is-short');
            var box = stage.querySelector('[data-alert]');
            box.className = 'f09s-alert f09s-alert--danger';
            return typeTo(api, box.querySelector('[data-alert-text]'), AL_SHORT.text);
          });
      },
      autoplayMs: 6500
    },
    {
      title: '短少自動算出賠償',
      text: '牌價寫在租約附件裡，門禁磁扣一張 300 元。系統直接算給你看，租客與同事都不用吵金額。',
      render: function (stage) {
        stage.innerHTML = b15({
          badge: { text: '清點中', kind: 'accent' },
          alert: AL_SHORT,
          counting: true,
          marks: DONE_MARKS,
          right: [priceCard(0), kpiRow(OUT_BEFORE, OFFICE_BEFORE, WAIT_BEFORE)],
          button: { label: '完成點交', on: true }
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="price"]'))
          .then(function () { return countTo(api, stage.querySelector('[data-cost]'), 0, MISS_PRICE, 900); })
          .then(function () { return api.cursor(stage.querySelector('[data-btn]')); })
          .then(function () { return api.highlight(stage.querySelector('[data-btn]')); });
      },
      autoplayMs: 6500
    },
    {
      title: '賠償自動進押金扣款',
      text: '按下完成點交，300 元直接進押金結算單，應退還從 ' + comma(REFUND_BEFORE) + ' 元改成 ' + comma(REFUND_AFTER) + ' 元。',
      render: function (stage) {
        stage.innerHTML = b15({
          badge: { text: '點交完成', kind: 'ok' },
          alert: AL_SHORT,
          marks: DONE_MARKS,
          right: [depositCard(0, REFUND_BEFORE), kpiRow(OUT_BEFORE, OFFICE_BEFORE, WAIT_BEFORE)]
        });
      },
      after: function (stage, api) {
        var extra = stage.querySelector('[data-extra]');
        return api.enter(stage.querySelector('[data-card="deposit"]'))
          .then(function () {
            extra.hidden = false;
            return api.enter(extra);
          })
          .then(function () { return countTo(api, extra.querySelector('[data-deduct]'), 0, MISS_PRICE, 700); })
          .then(function () { return countTo(api, stage.querySelector('[data-refund]'), REFUND_BEFORE, REFUND_AFTER, 900); })
          .then(function () { return api.highlight(stage.querySelector('[data-card="deposit"]')); });
      },
      autoplayMs: 7000
    },
    {
      title: '密碼同一天自動失效',
      text: 'B 棟大門是密碼加磁扣雙認證。退租當天密碼自動失效，沒交回的那張磁扣也一併遠端停用。',
      render: function (stage) {
        stage.innerHTML = b15({
          badge: { text: '點交完成', kind: 'ok' },
          alert: AL_SHORT,
          marks: DONE_MARKS,
          right: [lockCard(false), kpiRow(OUT_BEFORE, OFFICE_BEFORE, WAIT_BEFORE)]
        });
      },
      after: function (stage, api) {
        var pin = stage.querySelector('[data-pin]');
        var flows = stage.querySelectorAll('[data-flow]');
        return api.enter(stage.querySelector('[data-card="lock"]'))
          .then(function () {
            flows[1].classList.remove('is-now');
            flows[2].classList.add('is-now');
            return api.highlight(flows[2]);
          })
          .then(function () {
            pin.classList.add('is-dead');
            return api.badge(stage.querySelector('[data-pin-state]'), '密碼已失效', 'neutral');
          })
          .then(function () {
            return typeTo(api, stage.querySelector('[data-lock-note]'),
              '短少的磁扣已遠端停用，不必換鎖、不必叫鎖匠。');
          });
      },
      autoplayMs: 7000
    },
    {
      title: '在外鑰匙數自己歸位',
      text: '回收的 4 件回到公司保管、待點交少一間、短少的錢有人付。老闆看的就是最後這三個數字。',
      render: function (stage) {
        stage.innerHTML = b15({
          badge: { text: '點交完成', kind: 'ok' },
          alert: AL_SHORT,
          marks: DONE_MARKS,
          right: [kpiRow(OUT_BEFORE, OFFICE_BEFORE, WAIT_BEFORE), lockCard(true)]
        });
        var note = stage.querySelector('[data-lock-note]');
        if (note) note.textContent = '短少的磁扣已遠端停用，不必換鎖、不必叫鎖匠。';
      },
      after: function (stage, api) {
        var box = stage.querySelector('[data-alert]');
        return api.enter(stage.querySelectorAll('.f09s-kpi'))
          .then(function () {
            countTo(api, stage.querySelector('[data-kpi="office"] [data-v]'), OFFICE_BEFORE, OFFICE_AFTER, 800);
            countTo(api, stage.querySelector('[data-kpi="wait"] [data-v]'), WAIT_BEFORE, WAIT_AFTER, 800);
            return countTo(api, stage.querySelector('[data-kpi="out"] [data-v]'), OUT_BEFORE, OUT_AFTER, 800);
          })
          .then(function () {
            box.className = 'f09s-alert f09s-alert--ok';
            box.innerHTML = icon('check-circle') + '<span data-alert-text>' + esc(AL_DONE.text) + '</span>';
            return api.enter(box);
          });
      }
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
    feature: 'f09',
    autoplayMs: 5200,
    start: start,
    autoplay: autoplay,
    steps: steps
  });
})();
