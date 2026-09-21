/* js/tours/f07.js — 廠商與修繕工單（f07）功能導覽 8 步
 * 契約：docs/DESIGN.md §4（播放器與 api）、§5（假資料）、§6（文案）。
 * 主角：工單 WO-1043（B02 換馬桶水箱零件）。鴻裕水電報 3,500 元，同項目平均 1,800 元，
 *      系統標為價格異常 → 改派大同水電行 → 完工付款，這一筆省下 1,700 元。
 * 每一步都把「當下的系統畫面」重新組出來，再用 api 讓畫面真的動：
 * 數字跳動、標籤變色、文字逐字出現、游標示意點擊。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D || !window.TourPlayer) return;

  var esc = A.esc;
  var icon = A.icon;

  var WO = D.workOrder('WO-1043');
  var UNIT = D.unit(WO.unitId);
  var TENANT = D.tenantOf(WO.unitId);
  var ITEM = WO.item;                       /* 馬桶水箱零件 */
  var HIGH = WO.quote;                      /* 3,500 */
  var AVG = WO.marketAvg;                   /* 1,800 */
  var OVER = Math.round((HIGH / AVG - 1) * 100);
  var FIRST = D.vendorById(WO.vendorId);    /* 鴻裕水電 */
  var PICK = D.vendorById('V01');           /* 大同水電行 */
  var CHEAP = D.vendorById('V02');          /* 永安水電，報價最低但返修率較高 */
  var SAVE = HIGH - PICK.avgQuote[ITEM];    /* 1,700 */
  var INVOICE = 'INV-260922-05';

  /* 同區、同項目報過價的廠商，由低到高 */
  var CANDIDATES = D.vendors.filter(function (v) {
    return v.avgQuote[ITEM] != null && v.regions.indexOf(UNIT.region) >= 0;
  }).sort(function (a, b) { return a.avgQuote[ITEM] - b.avgQuote[ITEM]; });

  var STEPS = ['報修', '派工', '報價', '核准', '完工', '發票', '付款'];

  function money(n) { return A.fmt.money(n); }
  function num(n) { return A.fmt.num(n); }
  function rework(v) { return Math.round(v.reworkRate * 100) + '%'; }
  function vendorMeta(v) { return '平均 ' + v.avgDays + ' 天完工 · 返修率 ' + rework(v) + ' · 評分 ' + v.rating; }

  /* ================================================================
   * 舞台零件
   * ================================================================ */
  function stepsBar(reached) {
    return '<div class="f07s-steps" data-steps>' + STEPS.map(function (s, i) {
      var cls = 'f07s-stepi' + (i < reached ? ' is-done' : '') + (i === reached ? ' is-current' : '');
      return '<div class="' + cls + '" data-step="' + i + '"><span></span>' + esc(s) + '</div>';
    }).join('') + '</div>';
  }

  function woCard(cfg) {
    return '<div class="f07s-card" data-card="wo">' +
      '<h4>' + icon('wrench') + ' 工單內容</h4>' +
      '<dl class="f07s-kv">' +
        '<dt>物件</dt><dd>' + esc(UNIT.id + '　' + UNIT.region + ' · ' + UNIT.type + '　' + (TENANT ? TENANT.name : '無租客')) + '</dd>' +
        '<dt>項目</dt><dd data-item>' + esc(cfg.item || '待 AI 判斷') + '</dd>' +
        '<dt>廠商</dt><dd data-vendor>' + esc(cfg.vendor || '尚未指派') + '</dd>' +
        '<dt>報價</dt><dd data-quote-cell>' +
          (cfg.quote == null ? '尚未報價' : '<span data-quote-line>' + esc(num(cfg.quote)) + '</span> 元') + '</dd>' +
      '</dl></div>';
  }

  function timelineCard(all) {
    var MAX = 4;
    var rows = all.slice(-MAX);
    var hidden = all.length - rows.length;
    return '<div class="f07s-card" data-card="timeline">' +
      '<h4>' + icon('history') + ' 工單時間軸' +
        '<span class="f07s-sub" style="margin-left:auto">' + esc(all.length + ' 筆') + '</span></h4>' +
      (hidden ? '<p class="f07s-sub" style="margin-bottom:8px">' + esc('前面還有 ' + hidden + ' 筆紀錄') + '</p>' : '') +
      '<div class="f07s-timeline">' + rows.map(function (r) {
        return '<div class="f07s-tl" data-tl="' + esc(r.key || '') + '">' +
          '<span class="f07s-tl-at">' + esc(r.at) + '</span>' +
          '<span class="f07s-tl-text">' + esc(r.text) +
          '<span class="f07s-tl-by">' + esc(r.by) + '</span></span></div>';
      }).join('') + '</div></div>';
  }

  function reportCard() {
    return '<div class="f07s-card" data-card="report">' +
      '<h4>' + icon('message') + ' 租客報修</h4>' +
      '<div class="f07s-photos f07s-photos--one"><img src="../assets/f07-photo-report.svg" alt="租客上傳的報修照片：水箱底部持續滲水"></div>' +
      '<p class="f07s-sub" style="margin-top:10px" data-desc></p>' +
      '<dl class="f07s-kv" style="margin-top:10px">' +
        '<dt>來源</dt><dd>租客 LINE 報修</dd>' +
        '<dt>照片</dt><dd>1 張，自動存進這張工單</dd>' +
      '</dl></div>';
  }

  function aiCard() {
    return '<div class="f07s-card" data-card="ai">' +
      '<h4>' + icon('bot') + ' AI 初步排查</h4>' +
      '<p class="f07s-sub" data-ai></p>' +
      '<div class="f07s-vendors" style="margin-top:10px" data-suggest>' + CANDIDATES.map(function (v, i) {
        return '<div class="f07s-vendor' + (v.id === FIRST.id ? ' is-pick' : '') + '" data-v="' + esc(v.id) + '">' +
          '<span class="f07s-vendor-name">' + esc(v.name) + (v.id === FIRST.id ? '　最快到場' : '') + '</span>' +
          '<span class="f07s-vendor-meta">' + esc(vendorMeta(v)) + '</span>' +
          '<span class="f07s-vendor-amount">' + esc(money(v.avgQuote[ITEM])) + '</span></div>';
      }).join('') + '</div></div>';
  }

  function dispatchCard() {
    return '<div class="f07s-card" data-card="dispatch">' +
      '<h4>' + icon('truck') + ' 派工</h4>' +
      '<p class="f07s-sub">' + esc('系統建議 ' + FIRST.name + '：同區、' + vendorMeta(FIRST) + '。') + '</p>' +
      '<div class="f07s-vendors" style="margin-top:10px">' + CANDIDATES.map(function (v) {
        return '<div class="f07s-vendor' + (v.id === FIRST.id ? ' is-pick' : '') + '">' +
          '<span class="f07s-vendor-name">' + esc(v.name) + (v.id === FIRST.id ? '　已選' : '') + '</span>' +
          '<span class="f07s-vendor-meta">' + esc(vendorMeta(v)) + '</span>' +
          '<span class="f07s-vendor-amount">' + esc(money(v.avgQuote[ITEM])) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="f07s-btn-row" style="margin-top:12px">' +
        '<span class="f07s-btn" data-btn-dispatch>' + icon('truck') + '派工給廠商</span>' +
        '<span class="f07s-btn f07s-btn--ghost">換一家</span>' +
      '</div></div>';
  }

  /* 報價卡：大數字 ＋ 平均 ＋ 異常標籤 */
  function quoteCard(cfg) {
    return '<div class="f07s-card" data-card="quote">' +
      '<h4>' + icon('tag') + ' 廠商報價</h4>' +
      '<div class="f07s-quote-row">' +
        '<span class="f07s-num' + (cfg.bad ? ' f07s-num--bad' : '') + '" data-quote>' + esc(cfg.quote == null ? '0' : num(cfg.quote)) + '</span>' +
        '<span class="f07s-sub">元　' + esc(cfg.vendorName || FIRST.name) + '</span>' +
        '<span class="badge badge--' + esc(cfg.badgeKind || 'neutral') + '" data-quote-badge>' + esc(cfg.badgeText || '等待比對') + '</span>' +
      '</div>' +
      '<div class="f07s-quote-row" style="margin-top:10px">' +
        '<span class="f07s-sub">' + esc('同項目（' + ITEM + '）歷史平均') + '</span>' +
        '<strong><span data-avg>' + esc(cfg.avg == null ? '比對中' : num(cfg.avg)) + '</span>' +
          '<span data-avg-unit>' + (cfg.avg == null ? '' : ' 元') + '</span></strong>' +
        '<span class="f07s-sub" data-diff>' + esc(cfg.diff || '') + '</span>' +
      '</div>' +
      '<p class="f07s-sub" style="margin-top:10px" data-quote-hint>' + esc(cfg.hint || '') + '</p>' +
      '</div>';
  }

  function compareCard(pickedId) {
    return '<div class="f07s-card" data-card="compare">' +
      '<h4>' + icon('chart') + ' 同項目報價比較</h4>' +
      '<div class="f07s-vendors">' + CANDIDATES.map(function (v) {
        var isFirst = v.id === FIRST.id;
        var cls = 'f07s-vendor' + (isFirst ? ' is-current' : '') + (v.id === pickedId ? ' is-pick' : '');
        var note = isFirst ? '本次報價，高於平均 ' + OVER + '%'
          : (v.id === CHEAP.id ? '最便宜，但返修率 ' + rework(v) : '報價等於平均，返修率最低');
        return '<div class="' + cls + '" data-v="' + esc(v.id) + '">' +
          '<span class="f07s-vendor-name">' + esc(v.name) + '</span>' +
          '<span class="f07s-vendor-meta">' + esc(vendorMeta(v) + '　' + note) + '</span>' +
          '<span class="f07s-vendor-amount">' + esc(money(isFirst ? HIGH : v.avgQuote[ITEM])) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="f07s-btn-row" style="margin-top:10px">' +
        '<span class="f07s-btn" data-btn-reassign>' + icon('refresh') + '改派 ' + esc(PICK.name) + '</span>' +
      '</div></div>';
  }

  function evidenceCard(showInvoice) {
    return '<div class="f07s-card" data-card="evidence">' +
      '<h4>' + icon('camera') + ' 完工與發票</h4>' +
      '<div class="f07s-photos" data-photos>' +
        '<img src="../assets/f07-photo-done.svg" alt="完工照片：水箱零件已更換，地面無積水">' +
        (showInvoice ? '<img src="../assets/f07-invoice.svg" alt="發票：金額 1,800 元">' : '') +
      '</div>' +
      '<p class="f07s-sub" style="margin-top:8px">' + esc(showInvoice ? '完工照片 2 張、發票 ' + INVOICE + '，都掛在這張工單上。' : '廠商用手機上傳，照片自動掛在工單上。') + '</p>' +
      '</div>';
  }

  function kpiCard(pending, anomaly, saved) {
    function one(key, label, value, cls) {
      return '<div class="f07s-kpi" data-kpi="' + key + '"><div class="f07s-kpi-label">' + esc(label) + '</div>' +
        '<div class="f07s-kpi-value' + (cls ? ' ' + cls : '') + '"><span data-v>' + value + '</span>' +
        (key === 'saved' ? ' <span class="f07s-sub">元</span>' : ' <span class="f07s-sub">筆</span>') + '</div></div>';
    }
    return '<div class="f07s-card" data-card="kpi">' +
      '<h4>' + icon('chart') + ' 這一筆之後的狀況</h4>' +
      '<div class="f07s-kpis">' +
        one('pending', '待核准報價', pending) +
        one('anomaly', '價格異常', anomaly) +
        one('saved', '這筆省下', saved, 'f07s-num--ok') +
      '</div>' +
      '<p class="f07s-sub" style="margin-top:10px">' + esc('每張工單都這樣比一次，一年下來就是一筆看得見的差額。') + '</p></div>';
  }

  /* ================================================================
   * 整個舞台
   * ================================================================ */
  function screen(cfg) {
    return '<div class="f07s">' +
      '<div class="f07s-top">' +
        '<h3>' + esc(WO.id + '　' + UNIT.id + ' ' + WO.title) + '</h3>' +
        '<span class="badge badge--' + esc(cfg.statusKind) + '" data-status>' + esc(cfg.status) + '</span>' +
        '<span class="f07s-meta">' + esc('報修 ' + A.fmt.date(WO.createdAt) + '　｜　' + WO.category + '類') + '</span>' +
      '</div>' +
      '<div class="f07s-alert f07s-alert--' + esc(cfg.alert.kind) + '" data-alert>' + icon(cfg.alert.icon || 'info') +
        '<span data-alert-text>' + esc(cfg.alert.text) + '</span></div>' +
      stepsBar(cfg.reached) +
      '<div class="f07s-grid">' +
        '<div class="f07s-col">' + woCard(cfg.wo || {}) + timelineCard(cfg.timeline) + '</div>' +
        '<div class="f07s-col">' + cfg.right.join('') + '</div>' +
      '</div></div>';
  }

  /* 時間軸逐步累積（每一步都比上一步多一筆） */
  var TL = {
    report: { at: '09/19 10:05', text: '租客 LINE 報修：馬桶水箱一直滲水，附照片 1 張', by: '租客' },
    ai: { at: '09/19 10:06', text: 'AI 判斷類別：水電，建議 ' + FIRST.name + '（同區、最快到場）', by: 'AI' },
    dispatch: { at: '09/19 10:20', text: '派工給 ' + FIRST.name, by: '陳○○' },
    quote: { at: '09/20 11:40', text: FIRST.name + '回報報價 ' + num(HIGH) + ' 元', by: FIRST.name },
    flag: { at: '09/20 11:40', text: '系統標記價格異常：高於同項目平均 ' + OVER + '%，待人工核准', by: '系統' },
    reassign: { at: '09/21 09:30', text: '改派給 ' + PICK.name + '，報價 ' + num(PICK.avgQuote[ITEM]) + ' 元', by: '陳○○' },
    approve: { at: '09/21 09:32', text: '核准報價 ' + num(PICK.avgQuote[ITEM]) + ' 元', by: '陳○○' },
    done: { at: '09/22 15:10', text: '完工，上傳完工照片 2 張', by: PICK.name },
    invoice: { at: '09/22 16:05', text: '發票 ' + INVOICE + ' 已上傳，待會計付款', by: PICK.name },
    paid: { at: '09/22 17:20', text: '發票 ' + INVOICE + ' 入帳，已付款，工單結案', by: '黃○○' }
  };
  function tl() {
    var keys = Array.prototype.slice.call(arguments);
    return keys.map(function (k) { var r = TL[k]; return { at: r.at, text: r.text, by: r.by, key: k }; });
  }

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
    var dur = ms == null ? 800 : ms;
    api.count(el, from, to, dur);
    return api.wait(dur + 80).then(function () {
      settle(el, String(to).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    });
  }
  function typeTo(api, el, text, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? Math.min(2200, Math.max(500, text.length * 55)) : ms;
    api.type(el, text, dur);
    return api.wait(dur + 120).then(function () { settle(el, text); });
  }

  var ALERT = {
    newWo: { kind: 'neutral', icon: 'inbox', text: '新工單已建立，等待派工' },
    dispatched: { kind: 'accent', icon: 'truck', text: FIRST.name + '已接單，預計今天到場勘查' },
    checking: { kind: 'accent', icon: 'search', text: '報價已收到，系統正在比對同項目的歷史平均' },
    bad: { kind: 'danger', icon: 'alert', text: '價格異常：' + money(HIGH) + ' 高於同項目平均 ' + money(AVG) + '，核准先擋下' },
    fixed: { kind: 'warn', icon: 'refresh', text: '已改派 ' + PICK.name + '，報價回到 ' + money(AVG) + '，等待核准' },
    working: { kind: 'accent', icon: 'wrench', text: PICK.name + '已完工，照片與發票都上傳了' },
    done: { kind: 'ok', icon: 'check-circle', text: '工單結案：實付 ' + money(AVG) + '，比原報價省下 ' + money(SAVE) }
  };

  /* ================================================================
   * 8 步
   * ================================================================ */
  var steps = [
    {
      title: '租客拍照就報修',
      text: '租客在 LINE 傳一張照片，工單自動開好，物件、租客、時間都帶進來。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '待派工', statusKind: 'warn', alert: ALERT.newWo, reached: 1,
          wo: {}, timeline: tl('report'), right: [reportCard()]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('.f07s-card'))
          .then(function () {
            return typeTo(api, stage.querySelector('[data-desc]'), '「馬桶水箱一直滲水，地上都是水，已經兩天了。」');
          });
      },
      autoplayMs: 6000
    },
    {
      title: 'AI 判類別、挑廠商',
      text: 'AI 看照片就分好類別，同區能做這個項目的廠商一次列出來。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '待派工', statusKind: 'warn', alert: ALERT.newWo, reached: 1,
          wo: {}, timeline: tl('report', 'ai'), right: [aiCard()]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="ai"]'))
          .then(function () {
            return typeTo(api, stage.querySelector('[data-ai]'),
              '判斷為水箱止水皮老化，屬水電類；下面是 ' + UNIT.region + ' 可服務的 ' + CANDIDATES.length + ' 家，金額是他們過去做同項目的報價。');
          })
          .then(function () {
            settle(stage.querySelector('[data-item]'), ITEM);
            return api.enter(stage.querySelectorAll('[data-suggest] .f07s-vendor'));
          });
      },
      autoplayMs: 7000
    },
    {
      title: '一鍵派工給廠商',
      text: '租客已經等兩天，先派最快到場的那家。派給誰、幾點派的，時間軸都記著。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '待派工', statusKind: 'warn', alert: ALERT.newWo, reached: 1,
          wo: { item: ITEM }, timeline: tl('report', 'ai'), right: [dispatchCard()]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="dispatch"]'))
          .then(function () { return api.cursor(stage.querySelector('[data-btn-dispatch]')); })
          .then(function () { return api.badge(stage.querySelector('[data-status]'), '已派工', 'accent'); })
          .then(function () {
            settle(stage.querySelector('[data-vendor]'), FIRST.name);
            var bar = stage.querySelector('[data-step="1"]');
            bar.className = 'f07s-stepi is-done';
            stage.querySelector('[data-step="2"]').className = 'f07s-stepi is-current';
            var box = stage.querySelector('[data-alert]');
            box.className = 'f07s-alert f07s-alert--accent';
            box.innerHTML = icon('truck') + '<span data-alert-text>' + esc(ALERT.dispatched.text) + '</span>';
            return api.enter(box);
          });
      },
      autoplayMs: 6500
    },
    {
      title: '廠商回報 3,500 元',
      text: '鴻裕水電到場勘查，報價 3,500 元。金額一登錄，系統就開始比對。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '待核准', statusKind: 'warn', alert: ALERT.checking, reached: 2,
          wo: { item: ITEM, vendor: FIRST.name }, timeline: tl('report', 'ai', 'dispatch', 'quote'),
          right: [quoteCard({ quote: null, avg: null, hint: '金額登錄後，系統會自動跟同項目的歷史平均比對。' })]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="quote"]'))
          .then(function () { return countTo(api, stage.querySelector('[data-quote]'), 0, HIGH, 900); })
          .then(function () {
            var cell = stage.querySelector('[data-quote-cell]');
            cell.innerHTML = '<span data-quote-line>' + esc(num(HIGH)) + '</span> 元';
          });
      },
      autoplayMs: 6000
    },
    {
      title: '報價太貴，系統先擋',
      text: '同項目平均只要 1,800 元。系統標上價格異常，核准這一關先卡住。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '待核准', statusKind: 'warn', alert: ALERT.checking, reached: 3,
          wo: { item: ITEM, vendor: FIRST.name, quote: HIGH },
          timeline: tl('report', 'ai', 'dispatch', 'quote'),
          right: [quoteCard({ quote: HIGH, avg: null, hint: '這一關不放行：可以請廠商說明，或直接改派同區其他廠商。' })]
        });
      },
      after: function (stage, api) {
        return countTo(api, stage.querySelector('[data-avg]'), 0, AVG, 800)
          .then(function () {
            settle(stage.querySelector('[data-avg-unit]'), ' 元');
            settle(stage.querySelector('[data-diff]'), '高出 ' + money(HIGH - AVG) + '（＋' + OVER + '%）');
            stage.querySelector('[data-quote]').classList.add('f07s-num--bad');
            return api.badge(stage.querySelector('[data-quote-badge]'), '價格異常', 'danger');
          })
          .then(function () {
            var box = stage.querySelector('[data-alert]');
            box.className = 'f07s-alert f07s-alert--danger';
            box.innerHTML = icon('alert') + '<span data-alert-text>' + esc(ALERT.bad.text) + '</span>';
            var tlRow = stage.querySelector('[data-card="timeline"] .f07s-timeline');
            tlRow.insertAdjacentHTML('beforeend',
              '<div class="f07s-tl" data-tl="flag"><span class="f07s-tl-at">' + esc(TL.flag.at) + '</span>' +
              '<span class="f07s-tl-text">' + esc(TL.flag.text) +
              '<span class="f07s-tl-by">' + esc(TL.flag.by) + '</span></span></div>');
            return api.enter([box, tlRow.lastElementChild]);
          })
          .then(function () { return api.highlight(stage.querySelector('[data-card="quote"]')); });
      },
      autoplayMs: 7500
    },
    {
      title: '改派同區另一家',
      text: '比價表一攤開就知道找誰。改派大同水電行，報價從 3,500 掉回 1,800。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '待核准', statusKind: 'danger', alert: ALERT.bad, reached: 3,
          wo: { item: ITEM, vendor: FIRST.name, quote: HIGH },
          timeline: tl('report', 'ai', 'dispatch', 'quote', 'flag'),
          right: [compareCard(PICK.id)]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('[data-card="compare"] .f07s-vendor'))
          .then(function () { return api.cursor(stage.querySelector('[data-btn-reassign]')); })
          .then(function () {
            settle(stage.querySelector('[data-vendor]'), PICK.name);
            return countTo(api, stage.querySelector('[data-quote-line]'), HIGH, AVG, 800);
          })
          .then(function () {
            return api.badge(stage.querySelector('[data-status]'), '已派工', 'accent');
          })
          .then(function () {
            var box = stage.querySelector('[data-alert]');
            box.className = 'f07s-alert f07s-alert--warn';
            box.innerHTML = icon('refresh') + '<span data-alert-text>' + esc(ALERT.fixed.text) + '</span>';
            return api.enter(box);
          });
      },
      autoplayMs: 7500
    },
    {
      title: '完工照片自動歸檔',
      text: '核准後廠商當天進場，完工照片與發票直接掛在工單上，事後要查都在。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '待付款', statusKind: 'warn', alert: ALERT.working, reached: 6,
          wo: { item: ITEM, vendor: PICK.name, quote: AVG },
          timeline: tl('report', 'ai', 'dispatch', 'quote', 'flag', 'reassign', 'approve', 'done', 'invoice'),
          right: [evidenceCard(true)]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('[data-photos] img'))
          .then(function () { return api.badge(stage.querySelector('[data-status]'), '待付款', 'warn'); })
          .then(function () { return api.highlight(stage.querySelector('[data-card="evidence"]')); });
      },
      autoplayMs: 6500
    },
    {
      title: '付款結案，省下 1,700',
      text: '會計確認付款，工單結案。異常警示歸零，這一筆比原報價省下 1,700 元。',
      render: function (stage) {
        stage.innerHTML = screen({
          status: '待付款', statusKind: 'warn', alert: ALERT.working, reached: 6,
          wo: { item: ITEM, vendor: PICK.name, quote: AVG },
          timeline: tl('report', 'ai', 'dispatch', 'quote', 'flag', 'reassign', 'approve', 'done', 'invoice', 'paid'),
          right: [kpiCard(1, 1, 0)]
        });
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="kpi"]'))
          .then(function () { return api.badge(stage.querySelector('[data-status]'), '完成', 'ok'); })
          .then(function () {
            var last = stage.querySelector('[data-step="6"]');
            if (last) last.className = 'f07s-stepi is-done';
            var box = stage.querySelector('[data-alert]');
            box.className = 'f07s-alert f07s-alert--ok';
            box.innerHTML = icon('check-circle') + '<span data-alert-text>' + esc(ALERT.done.text) + '</span>';
            return api.enter(box);
          })
          .then(function () {
            countTo(api, stage.querySelector('[data-kpi="pending"] [data-v]'), 1, 0, 700);
            countTo(api, stage.querySelector('[data-kpi="anomaly"] [data-v]'), 1, 0, 700);
            return countTo(api, stage.querySelector('[data-kpi="saved"] [data-v]'), 0, SAVE, 900);
          })
          .then(function () {
            ['pending', 'anomaly'].forEach(function (k) {
              var v = stage.querySelector('[data-kpi="' + k + '"] .f07s-kpi-value');
              if (v) v.classList.add('f07s-num--ok');
            });
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
    feature: 'f07',
    autoplayMs: 5200,
    start: start,
    autoplay: autoplay,
    steps: steps
  });
})();
