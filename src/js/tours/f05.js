/* js/tours/f05.js — 退租整備流程（f05）功能導覽 8 步
 * 契約：docs/DESIGN.md §4（播放器與 api）、§5（假資料）、§6（文案）。
 * 主角：C20（內壢，退租整備中）。每一步都把「當下的系統畫面」重新組出來，
 *      再用 api 讓畫面真的動：清單打勾、數字跳動、標籤變色、報價逐字出現、游標示意點擊。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D || !window.TourPlayer) return;

  var esc = A.esc;
  var icon = A.icon;
  var CHECK = D.prepChecklist;
  var TOTAL = CHECK.length;

  var UNIT = D.unit('C20');
  var WO_PAINT = D.workOrder('WO-1044');
  var WO_CLEAN = D.workOrder('WO-1045');
  var PAINTER = D.vendorById(WO_PAINT.vendorId);
  var CLEANER = D.vendorById(WO_CLEAN.vendorId);
  var DEPOSIT = UNIT.downstream.deposit;
  var DEDUCT = 3200;                      /* 遺留物清運 1,200 ＋ 牆面補漆分攤 2,000（與操作頁同一組數字） */
  var REFUND = DEPOSIT - DEDUCT;

  var KEYS = CHECK.map(function (c) { return c.key; });
  var S2 = KEYS.slice(0, 7);                                   /* 前七項：電表到衛浴 */
  var S5 = S2.concat(['paint']);                               /* 油漆工單完工後 */
  var S6 = S5.concat(['clean', 'trash', 'bills', 'deposit']);  /* 清潔與押金收尾 */
  var ALL = KEYS.slice();

  function money(n) { return A.fmt.money(n); }
  function has(list, k) { return list.indexOf(k) >= 0; }

  /* ================================================================
   * 舞台畫面（960 × 600）
   * ================================================================ */
  function checklistCard(done, total) {
    return '<div class="f05s-card" data-card="list">' +
      '<h4>' + icon('clipboard') + ' 整備清單' +
        '<span class="badge badge--neutral" style="margin-left:8px"><span data-total>' + total + '</span> 項</span></h4>' +
      '<div class="f05s-list">' + CHECK.map(function (c) {
        return '<div class="f05s-item' + (has(done, c.key) ? ' is-done' : '') + '" data-item="' + c.key + '">' +
          '<span class="f05s-box checkbox">' + icon('check') + '</span>' +
          '<span class="f05s-text">' + esc(c.name) + '</span></div>';
      }).join('') + '</div></div>';
  }

  function progressCard(n) {
    return '<div class="f05s-card" data-card="progress">' +
      '<h4>整備進度</h4>' +
      '<div class="row" style="gap:6px;align-items:baseline">' +
        '<span class="f05s-num" data-num>' + n + '</span>' +
        '<span class="muted small">／ ' + TOTAL + ' 項已完成</span></div>' +
      '<div class="mt-8">' + A.progress(n, { max: TOTAL, kind: n === TOTAL ? 'ok' : null }) + '</div>' +
      '</div>';
  }

  function askCard() {
    return '<div class="f05s-ask" data-ask hidden>' +
      '<strong>牆面檢查發現壁癌 3 處，要開修繕工單嗎？</strong>' +
      '<div class="muted small mt-8">建議廠商 ' + esc(PAINTER.name) + '　參考報價 ' + esc(money(WO_PAINT.quote)) + '</div>' +
      '<div class="row"><button type="button" class="btn btn--primary btn--sm" data-ask-yes>建立工單</button>' +
      '<button type="button" class="btn btn--ghost btn--sm">不需要</button></div></div>';
  }

  function woCard(status, kind, showPhotos) {
    return '<div class="f05s-card" data-card="wo">' +
      '<h4>' + icon('wrench') + ' 整備工單</h4>' +
      '<div class="row row--between" style="gap:8px">' +
        '<strong>' + esc(WO_PAINT.item) + '</strong>' +
        '<span class="badge badge--' + kind + '" data-wo-status>' + esc(status) + '</span></div>' +
      '<div class="muted small mt-8">' + esc(WO_PAINT.id + ' · ' + PAINTER.name + ' · ' + money(WO_PAINT.quote)) + '</div>' +
      '<p class="f05s-quote mt-8" data-quote></p>' +
      (showPhotos ? '<div class="f05s-photos mt-8" data-photos>' +
        '<img src="../assets/f05-photo-wall.svg" alt="油漆施工前的牆面">' +
        '<img src="../assets/f05-photo-room.svg" alt="油漆完工後的牆面">' +
        '</div>' : '') +
      '</div>';
  }

  function depositCard() {
    return '<div class="f05s-card" data-card="deposit">' +
      '<h4>' + icon('wallet') + ' 押金結算</h4>' +
      '<div class="row row--between"><span class="muted small">押金總額</span><span>' + esc(money(DEPOSIT)) + '</span></div>' +
      '<div class="row row--between"><span class="muted small">扣款合計</span><span>' + esc(money(DEDUCT)) + '</span></div>' +
      '<div class="row row--between" style="margin-top:6px"><span class="muted small">應退還</span>' +
        '<strong><span data-refund>' + REFUND.toLocaleString('en-US') + '</span> 元</strong></div>' +
      '<div class="muted small mt-8">' + esc('扣款都附點交照片；清潔工單 ' + WO_CLEAN.id + '（' + CLEANER.name + '，' + money(WO_CLEAN.quote) + '）已完工。') + '</div></div>';
  }

  function photoCard() {
    return '<div class="f05s-card" data-card="photos">' +
      '<h4>' + icon('camera') + ' 重新拍照</h4>' +
      '<div class="f05s-photos" data-photos>' +
        '<img src="../assets/f05-photo-room.svg" alt="整備完成的房間主圖">' +
        '<img src="../assets/f05-photo-meter.svg" alt="整備完成後的電表讀數">' +
        '<img src="../assets/f05-photo-handover.svg" alt="整備完成後的室內全景">' +
      '</div>' +
      '<div class="muted small mt-8">刊登主圖已備妥，可直接送上架。</div></div>';
  }

  function kpiRow(prep, late, month) {
    function one(key, label, value, kind) {
      return '<div class="f05s-kpi" data-kpi="' + key + '"><div class="f05s-kpi-label">' + esc(label) + '</div>' +
        '<div class="f05s-kpi-value"' + (kind ? ' style="color:var(--' + kind + '-ink)"' : '') + '><span data-v>' + value + '</span> 間</div></div>';
    }
    return '<div class="f05s-kpis">' +
      one('prep', '整備中', prep) +
      one('late', '整備逾期', late, late ? 'danger' : null) +
      one('month', '本月完成', month) +
      '</div>';
  }

  function buttonRow(on) {
    return '<div class="f05s-btn-wrap"><button type="button" class="btn btn--primary btn--block" data-btn' + (on ? '' : ' disabled') + '>' +
      icon('refresh') + '<span>標記為可出租</span></button></div>';
  }

  /* cfg: done[], status, statusKind, alert{kind,text}, right[], button, total */
  function screen(cfg) {
    var n = cfg.done.length;
    return '<div class="f05s">' +
      '<div class="f05s-top">' +
        '<h3>C20 退租整備</h3>' +
        '<span class="badge badge--' + cfg.statusKind + '" data-status>' + esc(cfg.status) + '</span>' +
        '<span class="f05s-meta">' + esc(UNIT.region + ' · ' + UNIT.type + ' · ' + UNIT.ping + ' 坪　｜　點交 ' + A.fmt.date('2026-09-10')) + '</span>' +
      '</div>' +
      '<div class="f05s-alert f05s-alert--' + cfg.alert.kind + '" data-alert>' + icon(cfg.alert.kind === 'ok' ? 'check-circle' : 'alert') +
        '<span data-alert-text>' + esc(cfg.alert.text) + '</span></div>' +
      '<div class="f05s-grid">' +
        '<div>' + checklistCard(cfg.done, cfg.total === undefined ? TOTAL : cfg.total) + '</div>' +
        '<div>' + progressCard(n) + cfg.right.join('') + buttonRow(cfg.button) + '</div>' +
      '</div></div>';
  }

  var ALERT_LATE = { kind: 'warn', text: 'C20 已空置 11 天，整備每拖一天就少收一天租金' };
  var ALERT_OK = { kind: 'ok', text: 'C20 已回到招租中，可出租庫存 +1' };

  function base(over) {
    var cfg = { done: [], status: '整備中', statusKind: 'accent', alert: ALERT_LATE, right: [], button: false };
    for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) cfg[k] = over[k];
    return cfg;
  }

  function item(stage, key) { return stage.querySelector('[data-item="' + key + '"]'); }

  /* api.count / api.type 用 requestAnimationFrame 逐格改字；動畫照放，但不把後續步驟接在
   * 它的 Promise 後面，而是固定時間後換上一個乾淨的節點寫入最終值——
   * 這樣無論瀏覽器何時送出 frame，畫面最後一定停在正確的數字或文字上。 */
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
    return api.wait(dur + 80).then(function () {
      settle(el, String(to).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    });
  }
  function typeTo(api, el, text, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? Math.min(2000, Math.max(400, text.length * 60)) : ms;
    api.type(el, text, dur);
    return api.wait(dur + 120).then(function () { settle(el, text); });
  }

  /* 依序打勾，並同步跳數字 */
  function checkSeq(stage, api, keys, from) {
    var i = 0;
    function next() {
      if (i >= keys.length) return Promise.resolve();
      var k = keys[i];
      i++;
      return api.check(item(stage, k))
        .then(function () { return countTo(api, stage.querySelector('[data-num]'), from + i - 1, from + i, 200); })
        .then(next);
    }
    return next();
  }

  /* ================================================================
   * 8 步
   * ================================================================ */
  var steps = [
    {
      title: '點交完成，清單自動開好',
      text: '租客把鑰匙交回來的當天，系統自動開一張 14 項整備清單，現場照著打勾就不會漏。',
      render: function (stage) {
        stage.innerHTML = screen(base({ done: [], total: 0, right: [kpiRow(1, 1, 3)] }));
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('.f05s-card, .f05s-kpi'))
          .then(function () { return countTo(api, stage.querySelector('[data-total]'), 0, TOTAL, 900); });
      }
    },
    {
      title: '逐項打勾，進度自己跳',
      text: '電表、鑰匙、家具、牆面一項一項確認。誰在什麼時候做的，系統都留著。',
      render: function (stage) {
        stage.innerHTML = screen(base({ done: [], right: [kpiRow(1, 1, 3)] }));
      },
      after: function (stage, api) {
        return checkSeq(stage, api, S2, 0);
      },
      autoplayMs: 7000
    },
    {
      title: '勾到需油漆，當場開工單',
      text: '牆面驗出 3 處壁癌。勾到「是否需要油漆或修繕」時，系統直接問要不要開工單。',
      render: function (stage) {
        stage.innerHTML = screen(base({ done: S2, right: [askCard(), kpiRow(1, 1, 3)] }));
      },
      after: function (stage, api) {
        var ask = stage.querySelector('[data-ask]');
        return api.cursor(item(stage, 'paint'))
          .then(function () { return api.highlight(item(stage, 'paint')); })
          .then(function () {
            ask.hidden = false;
            return api.enter(ask);
          })
          .then(function () { return api.cursor(stage.querySelector('[data-ask-yes]')); });
      },
      autoplayMs: 6000
    },
    {
      title: '工單派給同區油漆廠商',
      text: '系統挑同區評價最高的油漆廠商派工，報價與工期直接回到這張工單卡。',
      render: function (stage) {
        stage.innerHTML = screen(base({ done: S2, right: [woCard('已派工', 'warn', false), kpiRow(1, 1, 3)] }));
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="wo"]'))
          .then(function () {
            return typeTo(api, stage.querySelector('[data-quote]'),
              PAINTER.name + '回覆：9/15 進場，' + PAINTER.avgDays + ' 天完工。');
          });
      },
      autoplayMs: 6000
    },
    {
      title: '廠商完工，油漆項自動打勾',
      text: '廠商上傳完工照片、工單結案，整備清單上的油漆那一項自動打勾。',
      render: function (stage) {
        stage.innerHTML = screen(base({ done: S2, right: [woCard('施工中', 'accent', true), kpiRow(1, 1, 3)] }));
        stage.querySelector('[data-quote]').textContent = PAINTER.name + '回覆：9/15 進場，' + PAINTER.avgDays + ' 天完工。';
      },
      after: function (stage, api) {
        return api.badge(stage.querySelector('[data-wo-status]'), '完成', 'ok')
          .then(function () { return api.enter(stage.querySelectorAll('[data-photos] img')); })
          .then(function () { return api.check(item(stage, 'paint')); })
          .then(function () { return countTo(api, stage.querySelector('[data-num]'), S2.length, S5.length, 400); });
      }
    },
    {
      title: '清潔與押金一次收尾',
      text: '清潔完工、欠費結清。押金扣掉 ' + money(DEDUCT) + '，應退 ' + money(REFUND) + '，每筆扣款都有依據。',
      render: function (stage) {
        stage.innerHTML = screen(base({ done: S5, right: [depositCard(), kpiRow(1, 1, 3)] }));
        stage.querySelector('[data-refund]').textContent = '0';
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="deposit"]'))
          .then(function () { return countTo(api, stage.querySelector('[data-refund]'), 0, REFUND, 900); })
          .then(function () { return checkSeq(stage, api, ['clean', 'trash', 'bills', 'deposit'], S5.length); });
      },
      autoplayMs: 6500
    },
    {
      title: '重新拍照，按鈕才解鎖',
      text: '整備後重拍照片、刊登資料備妥，14 項全滿，「標記為可出租」才會亮起來。',
      render: function (stage) {
        stage.innerHTML = screen(base({ done: S6, right: [photoCard(), kpiRow(1, 1, 3)] }));
      },
      after: function (stage, api) {
        var btn = stage.querySelector('[data-btn]');
        return api.enter(stage.querySelectorAll('[data-photos] img'))
          .then(function () { return checkSeq(stage, api, ['photo', 'relist'], S6.length); })
          .then(function () {
            btn.disabled = false;
            return api.highlight(btn);
          });
      },
      autoplayMs: 6500
    },
    {
      title: '房間回到招租中',
      text: '按下「標記為可出租」，房間進可出租庫存，逾期警示同時消失。整備清單結案。',
      render: function (stage) {
        stage.innerHTML = screen(base({ done: ALL, right: [photoCard(), kpiRow(1, 1, 3)], button: true }));
      },
      after: function (stage, api) {
        var alertBox = stage.querySelector('[data-alert]');
        return api.cursor(stage.querySelector('[data-btn]'))
          .then(function () { return api.badge(stage.querySelector('[data-status]'), '招租中', 'ok'); })
          .then(function () {
            alertBox.className = 'f05s-alert f05s-alert--ok';
            alertBox.innerHTML = icon('check-circle') + '<span data-alert-text>' + esc(ALERT_OK.text) + '</span>';
            return api.enter(alertBox);
          })
          .then(function () {
            countTo(api, stage.querySelector('[data-kpi="prep"] [data-v]'), 1, 0, 700);
            countTo(api, stage.querySelector('[data-kpi="month"] [data-v]'), 3, 4, 700);
            return countTo(api, stage.querySelector('[data-kpi="late"] [data-v]'), 1, 0, 700);
          })
          .then(function () {
            var late = stage.querySelector('[data-kpi="late"] .f05s-kpi-value');
            if (late) late.style.color = 'var(--ok-ink)';
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
    feature: 'f05',
    autoplayMs: 5200,
    start: start,
    autoplay: autoplay,
    steps: steps
  });
})();
