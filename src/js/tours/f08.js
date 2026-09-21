/* js/tours/f08.js — 水電異常偵測（f08）功能導覽 8 步
 * 契約：docs/DESIGN.md §4（播放器與 api）、§5（假資料）、§6（文案）。
 * 主角：B04（中壢 B 棟雅房，租客 游○○）。水表從 8 度跳到 25 度 → 系統警示疑似漏水
 *      → 一鍵派工檢查 → 師傅找出防水層破損 → 修好後警示自動解除。
 * 每一步都把「當下的系統畫面」重新組出來，再用 api 讓畫面真的動：柱子長高、數字跳動、
 * 標籤變色、清單打勾、AI 建議逐字出現、游標示意點擊。
 * 網址加 #step=3 或 #step=last 可以直接停在某一步（驗收與截圖用）。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D || !window.TourPlayer) return;

  var esc = A.esc;
  var icon = A.icon;
  var fmt = A.fmt;

  var UNIT = D.unit('B04');
  var TENANT = D.tenant(UNIT.tenantId);
  var UTIL = D.utilityOf('B04');
  var WO = D.workOrder('WO-1046');
  var VENDOR = D.vendorById(WO.vendorId);
  var TASK = D.todos.filter(function (t) { return t.id === 'TD-23'; })[0];
  var STAFF = D.staffById(TASK ? TASK.assigneeId : 'S05');

  var WATER = UTIL.rows.map(function (r) { return r.water; });      /* 12 個月用水 */
  var BASE = UTIL.baseline.water;                                   /* 8 度 */
  var PEAK = WATER[WATER.length - 1];                               /* 25 度 */
  var CALM = WATER.slice(0, WATER.length - 1);                      /* 前 11 個月 */
  var LOW = Math.min.apply(null, CALM);
  var HIGH = Math.max.apply(null, CALM);
  var RATIO = Math.round(PEAK / BASE * 10) / 10;                    /* 3.1 倍 */
  var MAX = 28;                                                     /* 柱狀圖上限 */
  var WATER_RATE = 12, ELEC_RATE = 4;                               /* 估算單價，與操作頁同一組 */
  var LEAK_COST = (PEAK - BASE) * WATER_RATE;

  var PEERS = D.units.filter(function (u) { return u.building === UNIT.building && u.type === UNIT.type && u.id !== UNIT.id; });
  var PEER_AVG = Math.round(PEERS.reduce(function (t, u) {
    var rows = D.utilityOf(u.id).rows;
    return t + rows[rows.length - 1].water;
  }, 0) / PEERS.length * 10) / 10;

  var ELEC_ITEMS = D.utilityAnomalies.filter(function (a) { return a.kind === 'elec'; });
  var ELEC_DEG = ELEC_ITEMS.reduce(function (t, a) { return t + a.value; }, 0);
  var ELEC_COST = ELEC_DEG * ELEC_RATE;
  var TOTAL_ANOMALY = D.utilityAnomalies.length;

  var MONTH_LABELS = D.utilityMonths.map(function (m) { return (+m.slice(5)) + ' 月'; });

  function deg(n) { return fmt.num(n) + ' 度'; }
  function money(n) { return fmt.money(n); }
  function pct(v) { return Math.max(3, Math.round(v / MAX * 1000) / 10); }

  /* ================================================================
   * 舞台畫面（960 × 600）
   * ================================================================ */
  function top(cfg) {
    return '<div class="f08s-top">' +
      '<h3>水電異常偵測</h3>' +
      '<span class="badge badge--neutral">' + esc(D.stats.monthLabel) + '抄表</span>' +
      '<span class="f08s-meta">' + esc(UNIT.id + ' · ' + UNIT.region + ' · ' + UNIT.type + ' ' + fmt.ping(UNIT.ping) + ' · 租客 ' + TENANT.name) + '</span>' +
      '</div>';
  }

  function alertBox(al) {
    return '<div class="f08s-alert f08s-alert--' + al.kind + '" data-alert>' +
      icon(al.kind === 'ok' ? 'check-circle' : al.kind === 'danger' ? 'alert' : 'info') +
      '<span><b data-alert-title>' + esc(al.title) + '</b><small data-alert-text>' + esc(al.text) + '</small></span>' +
      '</div>';
  }

  function bars(values, lastClass) {
    return '<div class="f08s-chart">' +
      '<div class="f08s-bars">' +
        values.map(function (v, i) {
          var on = (i === values.length - 1 && lastClass) ? ' ' + lastClass : '';
          return '<span class="f08s-bar' + on + '" data-bar="' + i + '"><i style="height:' + pct(v) + '%"></i></span>';
        }).join('') +
        '<span class="f08s-baseline" style="bottom:' + pct(BASE) + '%"><b>過往平均 ' + BASE + ' 度</b></span>' +
      '</div>' +
      '<div class="f08s-xaxis">' + MONTH_LABELS.map(function (l) { return '<span>' + esc(l) + '</span>'; }).join('') + '</div>' +
      '</div>';
  }

  function chartCard(cfg) {
    return '<div class="f08s-card" data-card="chart">' +
      '<h4>' + icon('droplet') + UNIT.id + ' 用水趨勢' +
        '<span class="badge badge--' + cfg.badgeKind + '" data-chart-badge>' + esc(cfg.badge) + '</span></h4>' +
      '<div class="f08s-read">' +
        '<span class="f08s-num' + (cfg.readState ? ' is-' + cfg.readState : '') + '" data-read>' + cfg.read + '</span>' +
        '<span class="muted small">度　9 月用水</span>' +
        '<span class="muted small" style="margin-left:auto" data-ratio>' + esc(cfg.ratio || '') + '</span>' +
      '</div>' +
      bars(cfg.water, cfg.lastClass) +
      '</div>';
  }

  var EVIDENCE = [
    { t: '本月 ' + deg(PEAK) + '，是過往平均 ' + deg(BASE) + ' 的 ' + RATIO + ' 倍', s: '超過兩倍就達到警示門檻' },
    { t: '前 11 個月都在 ' + LOW + ' ～ ' + HIGH + ' 度之間', s: '基準很穩，不是季節性變動' },
    { t: '同棟同房型另外 ' + PEERS.length + ' 間本月平均 ' + deg(PEER_AVG), s: '不是整棟一起漲，問題出在這一間' }
  ];

  function evidenceCard(done) {
    return '<div class="f08s-card" data-card="evidence">' +
      '<h4>' + icon('search') + '判斷依據</h4>' +
      '<div class="f08s-checks">' + EVIDENCE.map(function (e, i) {
        return '<div class="f08s-check' + (i < done ? ' is-done' : '') + '" data-ev="' + i + '">' +
          '<span class="f08s-box checkbox">' + icon('check') + '</span>' +
          '<div>' + esc(e.t) + '<small>' + esc(e.s) + '</small></div></div>';
      }).join('') + '</div></div>';
  }

  function scanCard() {
    var regions = D.stats.regions.filter(function (r) { return r.region !== '全部'; });
    return '<div class="f08s-card" data-card="scan">' +
      '<h4>' + icon('map-pin') + '本月抄表進度</h4>' +
      '<div class="f08s-rows f08s-rows--tight">' + regions.map(function (r) {
        return '<div class="f08s-row"><span class="f08s-row-id">' + esc(r.region) + '</span>' +
          '<span class="badge badge--ok">已比對</span>' +
          '<span class="f08s-row-val">' + r.count + ' 間</span></div>';
      }).join('') + '</div></div>';
  }

  function kpiRow(k) {
    function one(key, label, value, unit, kind) {
      return '<div class="f08s-kpi" data-kpi="' + key + '">' +
        '<div class="f08s-kpi-label">' + esc(label) + '</div>' +
        '<div class="f08s-kpi-value"' + (kind ? ' style="color:var(--' + kind + '-ink)"' : '') + '>' +
        '<span data-v>' + value + '</span><small>' + esc(unit) + '</small></div></div>';
    }
    return '<div class="f08s-kpis">' +
      one('scan', '已比對', k.scan, ' 間') +
      one('anomaly', '本月異常', k.anomaly, ' 件', k.anomaly ? 'warn' : null) +
      one('leak', '疑似漏水', k.leak, ' 間', k.leakKind) +
      '</div>';
  }

  function rulesPanel() {
    return '<div class="f08s-card" data-card="rules">' +
      '<h4>' + icon('settings') + '比對規則</h4>' +
      '<div class="f08s-rows">' +
        '<div class="f08s-row" data-rule="water">' + icon('droplet') + '<span>用水達過往平均 2 倍 → 疑似漏水</span></div>' +
        '<div class="f08s-row" data-rule="elec">' + icon('zap') + '<span>空房本月用電 50 度以上 → 空房仍在用電</span></div>' +
      '</div>' +
      '<p class="muted small mt-8">抄表當天自動跑過 103 間，不用有人記得去看。</p></div>';
  }

  function listPanel() {
    var rows = '<div class="f08s-row is-focus" data-row="B04"><span class="f08s-row-id">' + UNIT.id + '</span>' +
      '<span class="badge badge--danger">疑似漏水</span><span class="f08s-row-val">' + esc(deg(PEAK)) + '</span></div>';
    rows += ELEC_ITEMS.map(function (a) {
      return '<div class="f08s-row" data-row="' + a.unitId + '"><span class="f08s-row-id">' + esc(a.unitId) + '</span>' +
        '<span class="badge badge--warn">空房用電</span><span class="f08s-row-val">' + esc(deg(a.value)) + '</span></div>';
    }).join('');
    return '<div class="f08s-card" data-card="list">' +
      '<h4>' + icon('list') + '本月異常清單<span class="badge badge--neutral">' + TOTAL_ANOMALY + ' 件</span></h4>' +
      '<div class="f08s-rows">' + rows + '</div>' +
      '<p class="muted small mt-8">' + esc(ELEC_ITEMS.length + ' 間空房本月合計 ' + deg(ELEC_DEG) + '，估計多付 ' + money(ELEC_COST) + '。') + '</p></div>';
  }

  function vendorPanel() {
    return '<div class="f08s-card" data-card="vendor">' +
      '<h4>' + icon('wrench') + '派工檢查</h4>' +
      '<div class="f08s-vendor">' +
        '<strong>' + esc(VENDOR.name) + '</strong>' +
        '<div class="muted small">' + esc(VENDOR.regions.join('、') + '　平均 ' + VENDOR.avgDays + ' 天完工') + '</div>' +
        '<div class="muted small">' + esc('返修率 ' + fmt.pct(VENDOR.reworkRate) + '　評分 ' + VENDOR.rating) + '</div>' +
        '<div class="muted small">' + esc(WO.item + '同項目歷史平均 ' + money(VENDOR.avgQuote[WO.item])) + '</div>' +
        '<p class="f08s-ai" data-ai></p>' +
      '</div>' +
      '<button type="button" class="btn btn--primary btn--block f08s-btn" data-btn>' + icon('send') + '<span>建立工單並派工</span></button>' +
      '</div>';
  }

  function woPanel(status, kind, unitStatus, unitKind, withTodo) {
    var html = '<div class="f08s-card" data-card="wo">' +
      '<h4>' + icon('clipboard') + '工單 ' + esc(WO.id) + '<span class="badge badge--' + kind + '" data-wo-status>' + esc(status) + '</span></h4>' +
      '<div class="f08s-wo-row"><span>' + esc(WO.item) + '</span><span class="f08s-wo-right">' + esc(VENDOR.name) + '</span></div>' +
      '<div class="f08s-wo-row"><span>核准報價</span><span class="f08s-wo-right">' + esc(money(WO.quote)) + '</span></div>' +
      '<div class="f08s-wo-row"><span>物件狀態</span><span class="f08s-wo-right">' +
        '<span class="badge badge--' + unitKind + '" data-unit-status>' + esc(unitStatus) + '</span></span></div>' +
      '</div>';
    if (withTodo) {
      html += '<div class="f08s-card" data-card="todo">' +
        '<h4>' + icon('bell') + '同步開出的待辦</h4>' +
        '<div class="f08s-row">' + icon('user') + '<span>' + esc(TASK.title) + '</span>' +
        '<span class="f08s-row-val">' + esc(STAFF.name + '　' + TASK.due.slice(5).replace('-', '/') + ' 前') + '</span></div></div>';
    }
    return html;
  }

  var FIX_STEPS = [
    { t: '09/16 09:05　關閉 B04 進水開關', s: '請租客暫停使用浴室，先止住漏水' },
    { t: '09/16 11:30　' + VENDOR.name + ' 到場勘查', s: '確認是浴室防水層破損，開立工單 ' + WO.id },
    { t: '09/17 14:00　核准報價 ' + money(WO.quote), s: '同項目平均 ' + money(WO.marketAvg) + '，價格合理' },
    { t: '09/18 16:20　防水層重做完成', s: '樓下 B03 天花板同步安排油漆' }
  ];

  function fixPanel(done) {
    return '<div class="f08s-card" data-card="fix">' +
      '<h4>' + icon('history') + '工單時間軸</h4>' +
      '<div class="f08s-checks">' + FIX_STEPS.map(function (s, i) {
        return '<div class="f08s-check' + (i < done ? ' is-done' : '') + '" data-fix="' + i + '">' +
          '<span class="f08s-box checkbox">' + icon('check') + '</span>' +
          '<div>' + esc(s.t) + '<small>' + esc(s.s) + '</small></div></div>';
      }).join('') + '</div></div>';
  }

  function resultPanel() {
    return '<div class="f08s-card" data-card="wo">' +
      '<h4>' + icon('clipboard') + '工單 ' + esc(WO.id) + '<span class="badge badge--ok" data-wo-status>完成</span></h4>' +
      '<div class="f08s-wo-row"><span>修繕費</span><span class="f08s-wo-right">' + esc(money(WO.quote)) + '</span></div>' +
      '<div class="f08s-wo-row"><span>物件狀態</span><span class="f08s-wo-right">' +
        '<span class="badge badge--accent" data-unit-status>處理中</span></span></div>' +
      '<div class="f08s-wo-row"><span>下次比對</span><span class="f08s-wo-right">2026/10/01</span></div>' +
      '</div>' +
      '<div class="f08s-card" data-card="gain">' +
      '<h4>' + icon('trend') + '這一次省下什麼</h4>' +
      '<div class="f08s-rows">' +
        '<div class="f08s-row">' + icon('droplet') + '<span>少繳多用的水</span><span class="f08s-row-val">' + esc(money(LEAK_COST)) + ' ／月</span></div>' +
        '<div class="f08s-row">' + icon('shield') + '<span>樓下 B03 沒有再泡水</span><span class="f08s-row-val">事件 INC-07</span></div>' +
        '<div class="f08s-row">' + icon('clock') + '<span>從抄表到派工</span><span class="f08s-row-val">同一天</span></div>' +
      '</div></div>';
  }

  /* cfg → 整個舞台 */
  function screen(cfg) {
    return '<div class="f08s">' +
      top(cfg) +
      alertBox(cfg.alert) +
      '<div class="f08s-grid">' +
        '<div>' + chartCard(cfg) + (cfg.left || '') + '</div>' +
        '<div>' + kpiRow(cfg.kpi) + '<div class="mt-16">' + (cfg.panel || '') + '</div></div>' +
      '</div></div>';
  }

  var CALM_VIEW = CALM.concat([BASE]);        /* 第 12 根先停在平常水準 */
  var PEAK_VIEW = CALM.concat([PEAK]);

  var AL_SCAN = { kind: 'warn', title: '9 月抄表資料已匯入', text: '103 間的水、電讀數正在和各自的過往平均比對。' };
  var AL_LEAK = { kind: 'danger', title: 'B04 疑似漏水', text: '本月用水 ' + PEAK + ' 度，過往平均 ' + BASE + ' 度，超過兩倍。建議派水電廠商檢查管線與馬桶止水。' };
  var AL_DONE = { kind: 'ok', title: 'B04 異常已解除', text: '防水層重做完成，複測用水回到每月 ' + BASE + ' 度的水準。' };

  function base(over) {
    var cfg = {
      water: PEAK_VIEW, lastClass: 'is-alert', read: PEAK, readState: 'alert', ratio: RATIO + ' 倍',
      badge: '本月異常', badgeKind: 'danger',
      alert: AL_LEAK, kpi: { scan: 103, anomaly: TOTAL_ANOMALY, leak: 1, leakKind: 'danger' },
      left: evidenceCard(3), panel: ''
    };
    for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) cfg[k] = over[k];
    return cfg;
  }

  /* api.count 用 requestAnimationFrame 逐格改字；動畫照放，但不把後續動作接在它的
   * Promise 後面，而是固定時間後換上乾淨節點寫入最終值，畫面一定停在正確數字上。 */
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
    return api.wait(dur + 80).then(function () { settle(el, String(to)); });
  }
  function typeTo(api, el, text, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? Math.min(1800, Math.max(500, text.length * 55)) : ms;
    api.type(el, text, dur);
    return api.wait(dur + 120).then(function () { settle(el, text); });
  }
  function seq(list) {
    var i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve();
      var fn = list[i]; i++;
      return Promise.resolve(fn()).then(next);
    }
    return next();
  }
  function kpiV(stage, key) { return stage.querySelector('[data-kpi="' + key + '"] [data-v]'); }
  function kpiValue(stage, key) { return stage.querySelector('[data-kpi="' + key + '"] .f08s-kpi-value'); }

  /* ================================================================
   * 8 步
   * ================================================================ */
  var steps = [
    {
      title: '抄表數字自動比對',
      text: '每月抄表一進系統，就和這間房過去 12 個月的平均比一次。103 間全部跑過，不用有人記得去看。',
      render: function (stage) {
        stage.innerHTML = screen(base({
          water: CALM_VIEW, lastClass: '', read: BASE, readState: '', ratio: '和平均一樣',
          badge: '近 12 個月', badgeKind: 'neutral',
          alert: AL_SCAN, left: scanCard(),
          kpi: { scan: 0, anomaly: 0, leak: 0, leakKind: null },
          panel: rulesPanel()
        }));
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('.f08s-card'))
          .then(function () { return countTo(api, kpiV(stage, 'scan'), 0, 103, 900); });
      }
    },
    {
      title: '這個月跳到 25 度',
      text: 'B04 前 11 個月都在 8 度上下，9 月的讀數是 25 度。水錶不會突然變勤勞，多半是哪裡在漏。',
      render: function (stage) {
        stage.innerHTML = screen(base({
          water: CALM_VIEW, lastClass: '', read: BASE, readState: '', ratio: '',
          badge: '近 12 個月', badgeKind: 'neutral',
          alert: AL_SCAN, left: scanCard(),
          kpi: { scan: 103, anomaly: 0, leak: 0, leakKind: null },
          panel: rulesPanel()
        }));
      },
      after: function (stage, api) {
        var bar = stage.querySelector('[data-bar="11"]');
        return api.wait(250)
          .then(function () {
            bar.classList.add('is-alert');
            bar.querySelector('i').style.height = pct(PEAK) + '%';
            return countTo(api, stage.querySelector('[data-read]'), BASE, PEAK, 900);
          })
          .then(function () {
            stage.querySelector('[data-read]').classList.add('is-alert');
            return typeTo(api, stage.querySelector('[data-ratio]'), RATIO + ' 倍', 400);
          })
          .then(function () { return api.highlight(bar); });
      }
    },
    {
      title: '系統判定疑似漏水',
      text: '超過過往平均兩倍就達到警示門檻。系統把判斷依據一條一條列出來，不是只丟一個紅點。',
      render: function (stage) {
        stage.innerHTML = screen(base({
          alert: AL_SCAN, left: evidenceCard(0),
          kpi: { scan: 103, anomaly: 0, leak: 0, leakKind: null },
          panel: rulesPanel()
        }));
      },
      after: function (stage, api) {
        var box = stage.querySelector('[data-alert]');
        return api.highlight(stage.querySelector('[data-rule="water"]'))
          .then(function () {
            box.className = 'f08s-alert f08s-alert--danger';
            box.innerHTML = icon('alert') + '<span><b data-alert-title>' + esc(AL_LEAK.title) + '</b>' +
              '<small data-alert-text>' + esc(AL_LEAK.text) + '</small></span>';
            return api.enter(box);
          })
          .then(function () { return api.enter(stage.querySelector('[data-card="evidence"]')); })
          .then(function () {
            return seq(EVIDENCE.map(function (e, i) {
              return function () { return api.check(stage.querySelector('[data-ev="' + i + '"]')); };
            }));
          })
          .then(function () {
            var v = kpiValue(stage, 'leak');
            if (v) v.style.color = 'var(--danger-ink)';
            countTo(api, kpiV(stage, 'anomaly'), 0, 1, 500);
            return countTo(api, kpiV(stage, 'leak'), 0, 1, 500);
          });
      }
    },
    {
      title: '同一批抓出空房用電',
      text: '同一次比對還抓到 4 間空房仍在用電，本月合計 555 度。空房的水電是公司在付，不抓就一直漏。',
      render: function (stage) {
        stage.innerHTML = screen(base({
          left: evidenceCard(3),
          kpi: { scan: 103, anomaly: 1, leak: 1, leakKind: 'danger' },
          panel: listPanel()
        }));
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="list"]'))
          .then(function () { return api.enter(stage.querySelectorAll('.f08s-row')); })
          .then(function () { return countTo(api, kpiV(stage, 'anomaly'), 1, TOTAL_ANOMALY, 700); });
      }
    },
    {
      title: '一鍵派工檢查',
      text: '點下派工，系統先依區域和類別挑廠商，完工天數、返修率、同項目歷史報價都擺在眼前。',
      render: function (stage) {
        stage.innerHTML = screen(base({ left: evidenceCard(3), panel: vendorPanel() }));
      },
      after: function (stage, api) {
        var btn = stage.querySelector('[data-btn]');
        return api.enter(stage.querySelector('[data-card="vendor"]'))
          .then(function () {
            return typeTo(api, stage.querySelector('[data-ai]'),
              'AI 判斷類別：水電。同區可派 2 家，這家完工最快、返修率最低。');
          })
          .then(function () { return api.cursor(btn); })
          .then(function () { return api.highlight(btn); });
      }
    },
    {
      title: '工單當場成立',
      text: '工單直接開出來派給廠商，待辦同步指派給修繕人員。物件狀態從待處理變成處理中，不會被忘記。',
      render: function (stage) {
        stage.innerHTML = screen(base({
          left: evidenceCard(3),
          panel: woPanel('建立中', 'neutral', '待處理', 'warn', true)
        }));
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="wo"]'))
          .then(function () { return api.badge(stage.querySelector('[data-wo-status]'), '已派工', 'accent'); })
          .then(function () { return api.enter(stage.querySelector('[data-card="todo"]')); })
          .then(function () { return api.badge(stage.querySelector('[data-unit-status]'), '處理中', 'accent'); });
      }
    },
    {
      title: '師傅找到真正原因',
      text: '關水、勘查、核准報價、重做防水層，每一步都留在工單時間軸。樓下 B03 的天花板同時安排油漆。',
      render: function (stage) {
        stage.innerHTML = screen(base({ left: evidenceCard(3), panel: fixPanel(0) }));
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('[data-card="fix"]'))
          .then(function () {
            return seq(FIX_STEPS.map(function (s, i) {
              return function () { return api.check(stage.querySelector('[data-fix="' + i + '"]')); };
            }));
          });
      }
    },
    {
      title: '警示解除，數字歸零',
      text: '複測用水回到 8 度，警示自動解除。早一個月發現，省下的不只水費，還有樓下那面天花板。',
      render: function (stage) {
        stage.innerHTML = screen(base({ left: evidenceCard(3), panel: resultPanel() }));
      },
      after: function (stage, api) {
        var box = stage.querySelector('[data-alert]');
        var bar = stage.querySelector('[data-bar="11"]');
        return api.enter(stage.querySelectorAll('[data-card="wo"], [data-card="gain"]'))
          .then(function () { return api.badge(stage.querySelector('[data-unit-status]'), '已解除', 'ok'); })
          .then(function () {
            bar.classList.remove('is-alert');
            bar.classList.add('is-fixed');
            return api.badge(stage.querySelector('[data-chart-badge]'), '9 月 · 已解除', 'ok');
          })
          .then(function () {
            box.className = 'f08s-alert f08s-alert--ok';
            box.innerHTML = icon('check-circle') + '<span><b data-alert-title>' + esc(AL_DONE.title) + '</b>' +
              '<small data-alert-text>' + esc(AL_DONE.text) + '</small></span>';
            return api.enter(box);
          })
          .then(function () {
            var read = stage.querySelector('[data-read]');
            if (read) { read.classList.remove('is-alert'); read.classList.add('is-ok'); }
            var v = kpiValue(stage, 'leak');
            if (v) v.style.color = 'var(--ok-ink)';
            countTo(api, kpiV(stage, 'anomaly'), TOTAL_ANOMALY, TOTAL_ANOMALY - 1, 700);
            return countTo(api, kpiV(stage, 'leak'), 1, 0, 700);
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
    feature: 'f08',
    autoplayMs: 5600,
    start: start,
    autoplay: autoplay,
    steps: steps
  });
})();
