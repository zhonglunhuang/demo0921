/* tours/f15.js — 功能導覽「AI 工作中心」的 8 個步驟
 * 契約：docs/DESIGN.md §4（TourPlayer.mount 與 api）、§5（假資料）、§6（文案）。
 * 流程：早上打開系統 → 只看到 7 件 → 逐件點開處理 → 數字降到 0 → 今天沒有需要你處理的事。
 * 畫面全部用 DB 的真資料組出來，不寫死數字。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB, TP = window.TourPlayer;
  var host = document.getElementById('player');
  if (!A || !D || !TP || !host) return;

  var esc = A.esc;
  var icon = A.icon;

  /* ---------------------------------------------------------------- 資料 */
  var ORDER = { 'deposit-D11': 1, 'arrears-B11': 2, 'lease-A03': 3, 'repair-C03': 4, 'billing-A09': 5, 'arrears-E07': 6, 'vacancy-C08': 7 };
  var KIND_ICON = { billing: 'receipt', arrears: 'dollar', repair: 'wrench', lease: 'file', deposit: 'wallet', vacancy: 'door' };
  var KIND_LABEL = { billing: '帳款', arrears: '欠租', repair: '修繕', lease: '租約', deposit: '押金', vacancy: '空房' };

  var ITEMS = D.workCenter().map(function (it, i) {
    var key = it.kind + '-' + (it.unitId || i);
    return {
      key: key, kind: it.kind, severity: it.severity, unitId: it.unitId,
      title: it.title, desc: it.desc, rank: ORDER[key] || 99
    };
  }).sort(function (a, b) { return a.rank - b.rank; });

  var TOTAL = ITEMS.length;
  var NORMAL = D.normalUnits().length;
  var UNITS = D.units.length;
  var MANAGER = D.staffById('S02');

  function unitPlace(id) { var u = D.unit(id); return u ? u.region + ' ' + u.building + ' 棟' : ''; }
  function taskOf(kind, unitId) {
    for (var i = 0; i < D.todos.length; i++) {
      if (D.todos[i].kind === kind && D.todos[i].unitId === unitId) return D.todos[i];
    }
    return null;
  }
  /* DB.depositOf('D11') 會先回到現住租客那筆；故事要的是「逾期未結算」那筆 */
  function depositD11() {
    var list = D.deposits.filter(function (x) { return x.unitId === 'D11'; });
    for (var i = 0; i < list.length; i++) if (list[i].status === '逾期未結算') return list[i];
    return list[list.length - 1] || D.depositOf('D11');
  }
  function money(n) { return A.fmt.money(n); }
  function mdHm(at) { var m = String(at).match(/^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})/); return m ? m[1] + '/' + m[2] + ' ' + m[3] : String(at); }

  /* ---------------------------------------------------------------- 畫面零件 */
  function topLine() {
    return '<div class="s15-top"><strong>租務中樞</strong>' +
      '<span class="s15-top-role">' + icon('user-check') + esc(A.fmt.date(A.today) + '（星期一）· 租務管理員 ' + (MANAGER ? MANAGER.name : '')) + '</span></div>';
  }

  function heroBig(n, sub, tall) {
    return '<div class="s15-hero' + (tall ? ' s15-hero--tall' : '') + '">' +
      '<p class="s15-eyebrow">AI 工作中心</p>' +
      '<p class="s15-line">今天需要人工處理 <span class="s15-num">' + n + '</span> 件</p>' +
      '<p class="s15-sub">' + (sub === false ? '' : esc(sub || ('其餘 ' + NORMAL + ' 間一切正常，系統自己盯著'))) + '</p>' +
      '</div>';
  }

  function normalRow() {
    return '<div class="s15-normal-row">' +
      '<span class="s15-ic s15-ic--ok">' + icon('check') + '</span>' +
      '<div><span class="s15-normal-t">' + NORMAL + ' 間一切正常</span>' +
      '<span class="s15-normal-s">租金已收、沒有待辦、沒有異常，預設收起來不打擾</span></div>' +
      '<span class="s15-normal-chev">' + icon('chevron-down') + '</span></div>';
  }

  function heroBar(left, doneN) {
    var pct = TOTAL ? Math.round(doneN / TOTAL * 100) : 0;
    return '<div class="s15-bar">' +
      '<p class="s15-line">今天還剩 <span class="s15-num">' + left + '</span> 件</p>' +
      '<div class="s15-bar-right"><span class="s15-bar-label">已處理 ' + doneN + '／' + TOTAL + ' 件</span>' +
        '<div class="s15-bar-track"><div class="s15-bar-fill" style="width:' + pct + '%"></div></div></div>' +
      '</div>';
  }

  function cardHTML(it, done) {
    return '<div class="s15-card' + (done ? ' is-done' : '') + '" data-k="' + esc(it.key) + '">' +
      '<span class="s15-ic s15-ic--' + (done ? 'ok' : it.severity) + '">' + icon(done ? 'check' : (KIND_ICON[it.kind] || 'alert')) + '</span>' +
      '<div class="s15-card-b">' +
        '<span class="s15-card-u">' + esc(it.unitId + ' · ' + KIND_LABEL[it.kind]) + '</span>' +
        '<span class="s15-card-t">' + esc(it.title) + '</span>' +
        '<span class="s15-card-d">' + esc(unitPlace(it.unitId)) + '</span>' +
      '</div></div>';
  }
  function grid(doneKeys) {
    var map = keyMap(doneKeys);
    return '<div class="s15-grid">' + ITEMS.map(function (it) { return cardHTML(it, !!map[it.key]); }).join('') + '</div>';
  }

  function rowHTML(it, done, active) {
    return '<div class="s15-row' + (done ? ' is-done' : '') + (active ? ' is-active' : '') + '" data-k="' + esc(it.key) + '">' +
      '<span class="s15-row-dot' + (done ? ' s15-row-dot--ok' : it.severity === 'danger' ? ' s15-row-dot--danger' : '') + '"></span>' +
      '<span class="s15-row-u">' + esc(it.unitId) + '</span>' +
      '<span class="s15-row-t">' + esc(it.title) + '</span></div>';
  }
  function list(doneKeys, activeKey) {
    var map = keyMap(doneKeys);
    return '<div class="s15-list">' + ITEMS.map(function (it) { return rowHTML(it, !!map[it.key], it.key === activeKey); }).join('') + '</div>';
  }
  function keyMap(keys) {
    var m = {};
    (keys || []).forEach(function (k) { m[k] = true; });
    return m;
  }

  function screenScan(n) {
    return '<div class="s15">' + topLine() + heroBig(n, false, true) + normalRow() + '</div>';
  }
  function screenA(n, sub, doneKeys) {
    return '<div class="s15">' + topLine() + heroBig(n, sub) + grid(doneKeys || []) + normalRow() + '</div>';
  }
  function screenB(doneKeys, activeKey, panel) {
    var doneN = (doneKeys || []).length;
    return '<div class="s15">' + topLine() + heroBar(TOTAL - doneN, doneN) +
      '<div class="s15-split">' + list(doneKeys, activeKey) + panel + '</div></div>';
  }

  /* ---------------------------------------------------------------- 右側面板 */
  function panelDeposit() {
    var d = depositD11();
    var task = taskOf('deposit', 'D11');
    var deduct = d.deductions.map(function (x) { return x.item + ' ' + money(x.amount); }).join('、');
    return '<div class="s15-panel">' +
      '<div class="s15-panel-h"><span class="s15-panel-t">退租押金尚未結算</span>' +
        '<span class="badge badge--danger" data-badge>要立刻處理</span></div>' +
      '<dl class="s15-kv">' +
        '<dt>物件</dt><dd>' + esc('D11（' + unitPlace('D11') + '）') + '</dd>' +
        '<dt>狀況</dt><dd>' + esc('退租已滿 ' + d.daysSinceMoveOut + ' 天，押金 ' + money(d.amount) + '還沒結算') + '</dd>' +
        '<dt>負責人</dt><dd>' + esc((MANAGER ? MANAGER.name : '') + '（租務管理員）') + '</dd>' +
        '<dt>期限</dt><dd>' + esc(A.fmt.date(task.due) + '，已逾期 ' + task.overdueDays + ' 天') + '</dd>' +
      '</dl>' +
      '<div class="s15-note">' + icon('sparkles') + '<div><strong>系統建議</strong>' +
        esc('扣除' + deduct + '，退還 ' + money(d.amount - d.deductTotal) + '給前租客，並附上點交照片。') + '</div></div>' +
      '<div class="s15-steps">' +
        '<div class="s15-step" data-s="1">核對扣款項目與依據</div>' +
        '<div class="s15-step" data-s="2">產生押金結算單</div>' +
        '<div class="s15-step" data-s="3">通知前租客並附點交照片</div>' +
      '</div>' +
      '<div class="s15-act"><span class="btn btn--primary btn--sm">開始結算</span></div>' +
      '</div>';
  }

  function panelArrears() {
    var b = D.tenantOf('B11'), e = D.tenantOf('E07');
    return '<div class="s15-panel">' +
      '<div class="s15-panel-h"><span class="s15-panel-t">欠租催繳</span>' +
        '<span class="badge badge--danger" data-badge>2 件一起送</span></div>' +
      '<dl class="s15-kv">' +
        '<dt>B11</dt><dd>' + esc(b.name + ' 欠 ' + money(b.arrearsAmount) + '，逾期 ' + b.arrearsDays + ' 天，已通知 2 次') + '</dd>' +
        '<dt>E07</dt><dd>' + esc(e.name + ' 欠 ' + money(e.arrearsAmount) + '，逾期 ' + e.arrearsDays + ' 天，電話未接') + '</dd>' +
      '</dl>' +
      '<div class="s15-msg"><div class="s15-msg-h">' + icon('message') + '自動帶入的催繳訊息</div>' +
        '<span class="s15-typed"></span></div>' +
      '<div class="s15-act"><span class="btn btn--primary btn--sm">送出催繳</span>' +
        '<span class="small muted-2">送達時間與回覆內容都會留存</span></div>' +
      '</div>';
  }

  function panelRepair() {
    var c = D.escalationCase;
    var steps = c.steps.map(function (s) {
      return '<div class="s15-step' + (s.state === 'done' ? ' is-done' : '') + '"' + (s.state === 'pending' ? ' data-pending' : '') + '>' +
        '<span class="s15-step-txt">' + esc(s.text) + '</span><span class="s15-step-at">' + esc(mdHm(s.at)) + '</span></div>';
    }).join('');
    return '<div class="s15-panel">' +
      '<div class="s15-panel-h"><span class="s15-panel-t">' + esc(c.workOrderId + ' ' + c.title) + '</span>' +
        '<span class="badge badge--warn" data-badge>等你判斷</span></div>' +
      '<dl class="s15-kv"><dt>物件</dt><dd>' + esc(c.unitId + '（' + unitPlace(c.unitId) + '）') + '</dd></dl>' +
      '<div class="s15-steps">' + steps + '</div>' +
      '<div class="s15-note">' + icon('bot') + '<div><strong>AI 說明</strong>問了兩次都沒回覆，判斷不出是水壓還是電池的問題，交給人決定。</div></div>' +
      '<div class="s15-act"><span class="btn btn--primary btn--sm">人工派工</span></div>' +
      '</div>';
  }

  function panelLastThree() {
    var rows = [
      { key: 'billing-A09', text: 'A09 核對本月 200 元差額', by: 'billing' },
      { key: 'lease-A03', text: 'A03 聯繫屋主談續約', by: 'lease' },
      { key: 'vacancy-C08', text: 'C08 調整刊登租金並重拍照片', by: 'vacancy' }
    ].map(function (r) {
      var it = null;
      ITEMS.forEach(function (x) { if (x.key === r.key) it = x; });
      var task = it ? taskOf(it.kind, it.unitId) : null;
      var staff = task ? D.staffById(task.assigneeId) : null;
      return '<div class="s15-step" data-k="' + esc(r.key) + '">' + esc(r.text) +
        '<span class="s15-step-at">' + esc(staff ? staff.name : '未指派') + '</span></div>';
    }).join('');
    return '<div class="s15-panel">' +
      '<div class="s15-panel-h"><span class="s15-panel-t">最後三件</span>' +
        '<span class="badge badge--warn" data-badge>3 件待處理</span></div>' +
      '<div class="s15-steps">' + rows + '</div>' +
      '<div class="s15-note">' + icon('shield-check') + '<div><strong>每一件都留痕</strong>誰處理的、什麼時候處理的、改了哪個金額，操作紀錄都查得到。</div></div>' +
      '<div class="s15-act"><span class="btn btn--primary btn--sm">全部標記為已處理</span></div>' +
      '</div>';
  }

  function screenClear() {
    return '<div class="s15">' + topLine() +
      '<div class="s15-clear">' +
        '<span class="s15-ic s15-ic--ok">' + icon('check') + '</span>' +
        '<p class="s15-clear-t">今天沒有需要你處理的事</p>' +
        '<p class="s15-clear-s">' + esc('七件全部處理完。' + UNITS + ' 間物件照常運作，有新狀況系統會立刻推到這一頁。') + '</p>' +
        '<div class="s15-clear-stats">' +
          '<div class="s15-clear-stat s15-clear-stat--ok"><b class="s15-num2">' + NORMAL + '</b><span>間一切正常</span></div>' +
          '<div class="s15-clear-stat"><b class="s15-done-n">0</b><span>件今天處理完</span></div>' +
          '<div class="s15-clear-stat"><b>0</b><span>件還沒處理</span></div>' +
        '</div>' +
      '</div></div>';
  }

  /* ---------------------------------------------------------------- 小動作 */
  function markRowDone(stage, key) {
    var row = stage.querySelector('.s15-row[data-k="' + key + '"]');
    if (!row) return null;
    row.classList.remove('is-active');
    row.classList.add('is-done');
    var dot = row.querySelector('.s15-row-dot');
    if (dot) dot.className = 's15-row-dot s15-row-dot--ok';
    return row;
  }
  function setBar(stage, doneN) {
    var fill = stage.querySelector('.s15-bar-fill');
    if (fill) fill.style.width = Math.round(doneN / TOTAL * 100) + '%';
    var label = stage.querySelector('.s15-bar-label');
    if (label) label.textContent = '已處理 ' + doneN + '／' + TOTAL + ' 件';
  }

  var DONE_1 = ['deposit-D11'];
  var DONE_2 = DONE_1.concat(['arrears-B11', 'arrears-E07']);
  var DONE_3 = DONE_2.concat(['repair-C03']);

  /* ---------------------------------------------------------------- 步驟 */
  var STEPS = [
    {
      title: '早上打開系統',
      text: UNITS + ' 間物件不用一間間看。系統先掃過一遍，只留下今天需要人判斷的幾件。',
      render: function (stage, api) {
        stage.innerHTML = screenScan(0);
        api.enter('.s15-hero, .s15-normal-row');
      },
      after: function (stage, api) {
        return api.count('.s15-num', 0, TOTAL, 900).then(function () {
          return api.type('.s15-sub', '掃過 ' + UNITS + ' 間物件，' + NORMAL + ' 間一切正常，剩下這 ' + TOTAL + ' 件需要你判斷。', 1400);
        });
      }
    },
    {
      title: '七件事一次看完',
      text: '帳款不符、欠租兩件、修繕待判斷、屋主合約到期、押金未結算、空房太久。',
      render: function (stage, api) {
        stage.innerHTML = screenA(TOTAL, null, []);
        api.enter('.s15-card');
      }
    },
    {
      title: '先點開最急的一件',
      text: '押金逾期最久，排在最前面。點開就看到狀況、負責人和系統建議怎麼做。',
      render: function (stage) {
        stage.innerHTML = screenB([], 'deposit-D11', panelDeposit());
      },
      after: function (stage, api) {
        var row = stage.querySelector('.s15-row[data-k="deposit-D11"]');
        return api.cursor(row).then(function () {
          return api.enter('.s15-panel');
        }).then(function () {
          return api.highlight('.s15-note');
        });
      }
    },
    {
      title: '處理完就少一件',
      text: '三個動作做完，這件變成已處理，上面的數字從 7 降到 6。',
      render: function (stage, api) {
        stage.innerHTML = screenB([], 'deposit-D11', panelDeposit());
        api.enter('.s15-panel');
      },
      after: function (stage, api) {
        return api.check('.s15-step[data-s="1"]')
          .then(function () { return api.check('.s15-step[data-s="2"]'); })
          .then(function () { return api.check('.s15-step[data-s="3"]'); })
          .then(function () { return api.badge('[data-badge]', '已處理', 'ok'); })
          .then(function () {
            markRowDone(stage, 'deposit-D11');
            setBar(stage, 1);
            return api.count('.s15-num', TOTAL, TOTAL - 1, 700);
          });
      }
    },
    {
      title: '兩件欠租一起催',
      text: '催繳訊息自動帶房號和金額，送出後誰看了、誰回了都留著。數字降到 4。',
      render: function (stage, api) {
        stage.innerHTML = screenB(DONE_1, 'arrears-B11', panelArrears());
        api.enter('.s15-panel');
      },
      after: function (stage, api) {
        var b = D.tenantOf('B11');
        var msg = b.name + ' 您好，B11 9 月租金 ' + money(b.arrearsAmount) + '已逾期 ' + b.arrearsDays + ' 天，請在 3 天內完成匯款。有困難請回覆，我們協助安排。';
        return api.type('.s15-typed', msg, 2200)
          .then(function () { return api.badge('[data-badge]', '已送出', 'ok'); })
          .then(function () {
            markRowDone(stage, 'arrears-B11');
            markRowDone(stage, 'arrears-E07');
            setBar(stage, 3);
            return api.count('.s15-num', TOTAL - 1, TOTAL - 3, 700);
          });
      }
    },
    {
      title: 'AI 判斷不了才找人',
      text: '熱水器問題問了兩次都沒回覆，AI 不亂猜，直接把判斷交給管理員。',
      render: function (stage, api) {
        stage.innerHTML = screenB(DONE_2, 'repair-C03', panelRepair());
        api.enter('.s15-panel');
      },
      after: function (stage, api) {
        return api.highlight('.s15-step[data-pending]')
          .then(function () { return api.check('.s15-step[data-pending]'); })
          .then(function () {
            var txt = stage.querySelector('.s15-step[data-pending] .s15-step-txt');
            if (txt) txt.textContent = '管理員已人工派工，升級停止';
            return api.badge('[data-badge]', '已派工', 'ok');
          })
          .then(function () {
            markRowDone(stage, 'repair-C03');
            setBar(stage, 4);
            return api.count('.s15-num', TOTAL - 3, TOTAL - 4, 600);
          });
      }
    },
    {
      title: '最後三件一起收尾',
      text: '帳款核對、屋主續約、空房調價，逐件打勾，數字一路降到 0。',
      render: function (stage, api) {
        stage.innerHTML = screenB(DONE_3, null, panelLastThree());
        api.enter('.s15-panel');
      },
      after: function (stage, api) {
        var keys = ['billing-A09', 'lease-A03', 'vacancy-C08'];
        var n = TOTAL - 4;
        function one(i) {
          if (i >= keys.length) return api.badge('[data-badge]', '全部完成', 'ok');
          return api.check('.s15-step[data-k="' + keys[i] + '"]').then(function () {
            markRowDone(stage, keys[i]);
            var from = n; n -= 1;
            setBar(stage, TOTAL - n);
            return api.count('.s15-num', from, n, 500);
          }).then(function () { return one(i + 1); });
        }
        return one(0);
      }
    },
    {
      title: '今天沒有你的事',
      text: '七件全部處理完，數字歸零。剩下的系統自己盯著，有狀況才找你。',
      render: function (stage, api) {
        stage.innerHTML = screenClear();
        api.enter('.s15-clear');
      },
      after: function (stage, api) {
        return api.count('.s15-num2', NORMAL, UNITS, 900)
          .then(function () { return api.count('.s15-done-n', 0, TOTAL, 600); });
      }
    }
  ];

  /* ---------------------------------------------------------------- 啟動 */
  var start = 0, autoplay = true;
  var m = String(window.location.hash || '').match(/step=(last|\d+)/);
  if (m) {
    start = m[1] === 'last' ? STEPS.length - 1 : Math.max(0, Math.min(STEPS.length - 1, parseInt(m[1], 10) - 1));
    autoplay = false;
  }

  TP.mount(host, {
    feature: 'f15',
    autoplayMs: 5600,
    autoplay: autoplay,
    start: start,
    steps: STEPS
  });

  A.reveal();
})();
