/* js/tours/f04.js — 押金管理「功能導覽」：一條 8 步流程。
 * 租客退租 → 押金結算單自動列出扣款項 → 確認 → 退款紀錄與證明歸檔 → 狀態變已退還。
 * 畫面用共用元件組出來，再用 TourPlayer 的 api 讓它真的動（數字跳動、標籤變色、清單打勾、逐字出現、游標示意）。 */
(function () {
  'use strict';

  var A = window.App, D = window.DB, T = window.TourPlayer;
  var host = document.getElementById('player');
  if (!A || !D || !T || !host) return;
  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  /* ---------------- 這條導覽的數字全部取自 DB.deposits 的 D11 那筆 ---------------- */
  var CASE = (D.deposits || []).filter(function (d) { return d.unitId === 'D11' && d.status === '逾期未結算'; })[0] || {
    unitId: 'D11', tenantName: '林○○', amount: 14000, receivedAt: '2024-03-05', moveOutAt: '2026-08-07',
    deductions: [{ item: '清潔費', amount: 2500, basis: '退租清潔工單 WO-1012' }, { item: '牆面補漆', amount: 1500, basis: '點交照片 2026-08-08' }]
  };
  var UNIT = D.unit('D11') || { region: '平鎮', type: '一房一廳', floor: 4 };
  var BUILDING = (D.company.buildings || {}).D || { address: '桃園市平鎮區環南路二段 88 號' };
  var ADDRESS = BUILDING.address + ' ' + CASE.unitId + ' 室';

  var AMOUNT = CASE.amount;                                                        /* 14,000 */
  var DEDUCTS = CASE.deductions || [];
  var DEDUCT_TOTAL = DEDUCTS.reduce(function (s, x) { return s + x.amount; }, 0);   /* 4,000 */
  var REFUND = AMOUNT - DEDUCT_TOTAL;                                              /* 10,000 */
  var DOC_NO = 'DS-2026-0041';
  var TODAY = A.today;

  /* 全站總覽數字（最後一步用） */
  var ALL = D.deposits || [];
  var PENDING_BEFORE = ALL.filter(function (d) { return d.status === '結算中' || d.status === '逾期未結算'; }).length;   /* 2 */
  var OVERDUE_BEFORE = ALL.filter(function (d) { return d.status === '逾期未結算'; }).length;                            /* 1 */
  var REFUNDED_BEFORE = ALL.filter(function (d) { return d.status === '已退還'; })
    .reduce(function (s, d) { return s + (d.refundAmount || 0); }, 0);                                                   /* 11,500 */

  /* ================================================================
   * 舞台共用零件（960 × 600，內容區高 544）
   * ================================================================ */
  function stage(inner) { return '<div class="f04-stage">' + inner + '</div>'; }

  function head(statusText, statusKind) {
    return '<div class="f04-stage-head">' +
      '<div><div class="f04-stage-title">押金管理</div>' +
      '<div class="f04-stage-sub">' + esc(CASE.unitId) + ' · ' + esc(UNIT.region) + ' · ' + esc(UNIT.type) +
        ' · 前租客 ' + esc(CASE.tenantName) + '</div></div>' +
      '<span class="badge badge--' + statusKind + ' badge--lg js-status">' + esc(statusText) + '</span></div>';
  }

  function grid(left, right) {
    return '<div class="grid grid--2 f04-stage-grid">' + left + right + '</div>';
  }

  function card(inner, cls) { return '<div class="card card--static ' + (cls || '') + '">' + inner + '</div>'; }

  function title3(text) { return '<h3 class="section-title mb-8">' + esc(text) + '</h3>'; }

  function stepsBar(current) {
    var names = ['帶入扣款項', '確認應退金額', '產生押金結算單', '登錄退款與歸檔'];
    return '<ol class="f04-steps f04-steps--tour">' + names.map(function (n, i) {
      var c = i < current ? 'is-done' : (i === current ? 'is-current' : '');
      return '<li class="f04-step ' + c + '"><span class="f04-step-name">' + esc(n) + '</span></li>';
    }).join('') + '</ol>';
  }

  /* 金額面板：扣除合計與應退金額留 span 給 api.count 跳數字 */
  function sumPanel(deductNow, refundNow, note) {
    return '<div class="f04-sum">' +
      '<div class="f04-sum-row"><span>收到押金</span><span>' + fmt.num(AMOUNT) + ' 元</span></div>' +
      '<div class="f04-sum-row f04-sum-row--minus"><span>扣除合計</span>' +
        '<span>-<span class="js-deduct">' + fmt.num(deductNow) + '</span> 元</span></div>' +
      '<div class="f04-sum-total"><span class="f04-sum-total-label">應退金額</span>' +
        '<span class="f04-sum-total-value"><span class="js-refund">' + fmt.num(refundNow) + '</span> 元</span></div>' +
      (note ? '<p class="f04-sum-note">' + esc(note) + '</p>' : '') +
      '</div>';
  }

  function deductChecklist(done) {
    return A.checklist(DEDUCTS.map(function (x, i) {
      return { id: 'd' + i, label: x.item, hint: '依據：' + x.basis, meta: '-' + fmt.num(x.amount) + ' 元', done: !!done, static: true };
    }), null, { className: 'js-deducts f04-check-plain' });
  }

  function deductCard(done) {
    return card(title3('扣除項目') +
      '<p class="small muted mb-8">來源：退租整備的點交結果與修繕工單金額</p>' +
      deductChecklist(done), 'js-deduct-card');
  }

  function docPreview(refundDate) {
    return '<div class="f04-doc">' +
      '<div class="f04-doc-head"><span class="f04-doc-title">押金結算單</span><span class="f04-doc-no">' + DOC_NO + '</span></div>' +
      '<dl class="kv">' +
        '<dt>租客姓名</dt><dd class="js-field">' + esc(CASE.tenantName) + '</dd>' +
        '<dt>物件地址</dt><dd class="js-field">' + esc(ADDRESS) + '</dd>' +
        '<dt>押金金額</dt><dd class="js-field">' + fmt.num(AMOUNT) + ' 元</dd>' +
        '<dt>扣除項目</dt><dd class="js-field">' + DEDUCTS.map(function (x) { return esc(x.item) + ' ' + fmt.num(x.amount) + ' 元'; }).join('、') + '</dd>' +
        '<dt>應退金額</dt><dd class="js-field">' + fmt.num(REFUND) + ' 元</dd>' +
        '<dt>退款日期</dt><dd class="js-field">' + esc(refundDate) + '</dd>' +
      '</dl></div>';
  }

  function proofFigures() {
    return '<div class="f04-proof">' +
      '<figure><img src="../assets/f04-refund-proof.svg" alt="押金退款匯款證明" width="240" height="168">' +
        '<figcaption>匯款證明 · ' + fmt.date(TODAY) + '</figcaption></figure>' +
      '<figure><img src="../assets/f04-handover-photo.svg" alt="退租點交照片" width="240" height="168">' +
        '<figcaption>點交照片 · 扣款依據</figcaption></figure></div>';
  }

  /* ================================================================
   * 步驟（8 步）
   * ================================================================ */
  var steps = [
    {
      title: '租客通知要退租',
      text: '租客在 LINE 說要退租，系統立刻開出退租案件，押金不會被忘在帳上。',
      render: function (s) {
        s.innerHTML = stage(
          head('持有中', 'neutral') +
          grid(
            card('<div class="f04-chat-head">' + icon('message') + 'LINE · 安居包租代管</div>' +
              '<div class="phone-chat f04-chat-body">' +
                A.bubble({ from: 'day', text: fmt.date(CASE.moveOutAt) }) +
                '<div class="bubble-row bubble-row--them"><span class="phone-avatar">' + esc(CASE.tenantName.charAt(0)) + '</span>' +
                  '<div class="bubble bubble--them js-msg"></div></div>' +
                '<div class="js-reply" hidden>' + A.bubble({ from: 'me', text: '已收到，退租案件已建立，押金會在點交後結算。', at: '10:24', read: true }) + '</div>' +
              '</div>', 'js-chat f04-flexcard'),
            card(title3('系統開出退租案件') +
              '<dl class="kv">' +
                '<dt>物件</dt><dd>' + esc(CASE.unitId) + '（' + esc(UNIT.region) + ' · ' + esc(UNIT.type) + ' · ' + esc(UNIT.floor) + ' 樓）</dd>' +
                '<dt>租客</dt><dd>' + esc(CASE.tenantName) + '</dd>' +
                '<dt>退租日</dt><dd>' + fmt.date(CASE.moveOutAt) + '</dd>' +
                '<dt>押金</dt><dd>' + fmt.num(AMOUNT) + ' 元（' + fmt.date(CASE.receivedAt) + ' 收款）</dd>' +
              '</dl>' +
              '<h3 class="section-title mt-24 mb-8">自動排進的待辦</h3>' +
              A.checklist([
                { id: 't1', label: '安排退租點交', hint: '退租日當天', static: true },
                { id: 't2', label: '退租整備與清潔', hint: '點交後 3 天內', static: true },
                { id: 't3', label: '押金結算與退款', hint: '退租後 30 天內', static: true }
              ], null, { className: 'js-tasklist' }), 'js-case')
          )
        );
      },
      after: function (s, api) {
        return api.enter([s.querySelector('.js-chat'), s.querySelector('.js-case')])
          .then(function () { return api.type(s.querySelector('.js-msg'), '我月底要退租，押金什麼時候可以退？'); })
          .then(function () {
            var reply = s.querySelector('.js-reply');
            if (!reply) return;
            reply.hidden = false;
            return api.enter(reply);
          })
          .then(function () { return api.highlight(s.querySelector('.js-tasklist')); });
      }
    },

    {
      title: '押金卡自動開立',
      text: '收了多少、什麼時候收的，系統自己帶出來，不用再翻兩年前的收據。',
      render: function (s) {
        s.innerHTML = stage(
          head('持有中', 'neutral') + stepsBar(0) +
          grid(
            card(title3('押金卡 · ' + CASE.unitId) +
              '<dl class="kv">' +
                '<dt>收到金額</dt><dd><strong class="js-amount tnum">0</strong> 元</dd>' +
                '<dt>收到日期</dt><dd>' + fmt.date(CASE.receivedAt) + '</dd>' +
                '<dt>退租日期</dt><dd>' + fmt.date(CASE.moveOutAt) + '</dd>' +
                '<dt>物件地址</dt><dd>' + esc(ADDRESS) + '</dd>' +
                '<dt>狀態</dt><dd><span class="badge badge--neutral js-card-status">持有中</span></dd>' +
              '</dl>', 'js-card'),
            card(title3('這張卡是怎麼長出來的') +
              A.timeline([
                { at: CASE.receivedAt, title: '收到押金 ' + fmt.num(AMOUNT) + ' 元', text: '入住點交完成，押金入帳', by: '陳○○（租務管理員）' },
                { at: CASE.moveOutAt, title: '完成退租點交', text: '現場清點鑰匙與設備，牆面污損已拍照存證', by: '陳○○（租務管理員）' },
                { at: '2026-08-10', title: '退租清潔完成', text: '工單 WO-1012，清潔費 2,500 元', by: '系統自動帶入', current: true }
              ]), 'js-flow')
          )
        );
      },
      after: function (s, api) {
        return api.enter([s.querySelector('.js-card'), s.querySelector('.js-flow')])
          .then(function () { return api.count(s.querySelector('.js-amount'), 0, AMOUNT, 900); })
          .then(function () {
            return Promise.all([
              api.badge(s.querySelector('.js-status'), '結算中', 'accent'),
              api.badge(s.querySelector('.js-card-status'), '結算中', 'accent')
            ]);
          });
      }
    },

    {
      title: '點交結果變扣款',
      text: '退租整備的清潔與修補金額直接帶進扣款項，每一筆都附得出依據。',
      render: function (s) {
        s.innerHTML = stage(
          head('結算中', 'accent') + stepsBar(0) +
          grid(
            deductCard(false),
            card(title3('金額結算') +
              sumPanel(0, AMOUNT, '扣款項逐筆帶進來，金額跟著重算。') +
              '<p class="small muted mt-16">扣款金額直接取自工單與點交紀錄，不是人工估的，租客問得出來、公司也答得出來。</p>', 'js-sum-card')
          )
        );
      },
      after: function (s, api) {
        var items = s.querySelectorAll('.js-deducts .checklist-item');
        return api.enter([s.querySelector('.js-deduct-card'), s.querySelector('.js-sum-card')])
          .then(function () { return api.check(items[0]); })
          .then(function () { return api.wait(350); })
          .then(function () { return api.check(items[1]); });
      }
    },

    {
      title: '應退金額自動算出',
      text: '押金減掉扣款，應退 ' + fmt.num(REFUND) + ' 元當場算好，不會有人算錯。',
      render: function (s) {
        s.innerHTML = stage(
          head('結算中', 'accent') + stepsBar(0) +
          grid(
            deductCard(true),
            card(title3('金額結算') +
              sumPanel(0, AMOUNT, '') +
              '<div class="stat-row stat-row--sm mt-16">' +
                '<div class="stat"><span class="stat-label">扣款筆數</span><span class="stat-value">' + DEDUCTS.length + ' 筆</span></div>' +
                '<div class="stat"><span class="stat-label">扣款占押金</span><span class="stat-value">' + fmt.pct(DEDUCT_TOTAL / AMOUNT) + '</span></div>' +
              '</div>', 'js-sum-card')
          )
        );
      },
      after: function (s, api) {
        return api.enter(s.querySelector('.js-sum-card'))
          .then(function () {
            return Promise.all([
              api.count(s.querySelector('.js-deduct'), 0, DEDUCT_TOTAL, 900),
              api.count(s.querySelector('.js-refund'), AMOUNT, REFUND, 900)
            ]);
          })
          .then(function () { return api.highlight(s.querySelector('.f04-sum-total')); });
      }
    },

    {
      title: '管理員按下確認',
      text: '金額確認後流程才往下走，誰確認、什麼時候確認，系統都留著紀錄。',
      render: function (s) {
        s.innerHTML = stage(
          head('結算中', 'accent') + stepsBar(1) +
          grid(
            deductCard(true),
            card(title3('金額結算') +
              sumPanel(DEDUCT_TOTAL, REFUND, '') +
              '<button type="button" class="btn btn--primary btn--block mt-16 js-confirm">確認應退金額</button>' +
              '<div class="js-log" hidden>' +
                A.alert(fmt.date(TODAY) + ' 陳○○（租務管理員）確認應退 ' + fmt.num(REFUND) + ' 元', 'ok', { title: '已確認，紀錄留在操作紀錄' }) +
              '</div>', 'js-sum-card')
          )
        );
      },
      after: function (s, api) {
        var btn = s.querySelector('.js-confirm');
        return api.enter([s.querySelector('.js-deduct-card'), s.querySelector('.js-sum-card')])
          .then(function () { return api.cursor(btn); })
          .then(function () { return api.highlight(btn); })
          .then(function () {
            var log = s.querySelector('.js-log');
            if (!log) return;
            log.hidden = false;
            return api.enter(log);
          });
      }
    },

    {
      title: '結算單自動填好',
      text: '姓名、地址、扣除項目全部自動帶入，不用再重打一次也不會抄錯。',
      render: function (s) {
        s.innerHTML = stage(
          head('結算中', 'accent') + stepsBar(2) +
          grid(
            card(title3('欄位從哪裡來') +
              '<dl class="kv">' +
                '<dt>租客姓名</dt><dd>租客資料</dd>' +
                '<dt>物件地址</dt><dd>物件資料</dd>' +
                '<dt>押金金額</dt><dd>押金卡</dd>' +
                '<dt>扣除項目</dt><dd>退租點交與工單</dd>' +
                '<dt>應退金額</dt><dd>系統自動計算</dd>' +
              '</dl>' +
              '<p class="small muted mt-16">八種文件都用同一套資料產生，改一次資料，所有文件跟著對。</p>', 'js-src'),
            '<div class="js-doc">' + docPreview('待登錄') + '</div>'
          )
        );
      },
      after: function (s, api) {
        return api.enter(s.querySelector('.js-src'))
          .then(function () { return api.enter(s.querySelector('.js-doc')); })
          .then(function () { return api.enter(s.querySelectorAll('.js-doc .js-field')); });
      }
    },

    {
      title: '退款與證明歸檔',
      text: '匯款證明和點交照片存進押金卡，日後真的有爭議可以直接調出來。',
      render: function (s) {
        s.innerHTML = stage(
          head('結算中', 'accent') + stepsBar(3) +
          grid(
            card(title3('歸檔清單') +
              A.checklist([
                { id: 'a1', label: '押金結算單 ' + DOC_NO, hint: '系統自動產生', static: true },
                { id: 'a2', label: '匯款證明', hint: '退款 ' + fmt.num(REFUND) + ' 元 · ' + fmt.date(TODAY), static: true },
                { id: 'a3', label: '退租點交照片', hint: '扣款依據 · ' + fmt.date(CASE.moveOutAt), static: true }
              ], null, { className: 'js-files f04-check-plain' }) +
              '<dl class="kv mt-24">' +
                '<dt>退款金額</dt><dd>' + fmt.num(REFUND) + ' 元</dd>' +
                '<dt>退款日期</dt><dd>' + fmt.date(TODAY) + '</dd>' +
                '<dt>經手人</dt><dd>黃○○（會計）</dd>' +
              '</dl>', 'js-file-card'),
            card(title3('存進押金卡的證明') + proofFigures(), 'js-proof-card')
          )
        );
      },
      after: function (s, api) {
        var items = s.querySelectorAll('.js-files .checklist-item');
        return api.enter([s.querySelector('.js-file-card'), s.querySelector('.js-proof-card')])
          .then(function () { return api.check(items[0]); })
          .then(function () { return api.check(items[1]); })
          .then(function () { return api.check(items[2]); });
      }
    },

    {
      title: '逾期警示歸零',
      text: '狀態變成已退還，逾期未結算從 ' + OVERDUE_BEFORE + ' 筆變 0 筆，老闆一眼就知道沒有尾巴。',
      render: function (s) {
        s.innerHTML = stage(
          head('結算中', 'accent') +
          '<div class="js-alert">' + A.alert('每一筆退租押金都已結算並退還，最近一筆是 ' + CASE.unitId + '。', 'ok', { title: '押金都在期限內結清' }) + '</div>' +
          '<div class="grid grid--3 mt-16">' +
            A.kpi({ label: '待結算', icon: 'receipt', valueHtml: '<span class="js-kpi-pending">' + PENDING_BEFORE + '</span><small> 筆</small>', hint: '結算完就從這裡消失' }) +
            A.kpi({ label: '逾期未結算', icon: 'alert', kind: 'ok', valueHtml: '<span class="js-kpi-overdue">' + OVERDUE_BEFORE + '</span><small> 筆</small>', hint: '退租滿 30 天還沒結算才會計入' }) +
            A.kpi({ label: '已退還押金', icon: 'check-circle', valueHtml: '<span class="kpi-prefix">NT$</span><span class="js-kpi-refunded">' + fmt.num(REFUNDED_BEFORE) + '</span>', hint: '每一筆都附匯款證明' }) +
          '</div>' +
          '<div class="grid grid--2 mt-16 js-bottom">' +
            card('<dl class="kv">' +
              '<dt>押金卡</dt><dd>' + esc(CASE.unitId) + ' · ' + esc(CASE.tenantName) + '（前租客）</dd>' +
              '<dt>收到金額</dt><dd>' + fmt.num(AMOUNT) + ' 元</dd>' +
              '<dt>實退金額</dt><dd>' + fmt.num(REFUND) + ' 元</dd>' +
              '<dt>退款日期</dt><dd>' + fmt.date(TODAY) + '</dd>' +
            '</dl>', 'js-summary') +
            card('<div class="f04-proof f04-proof--one"><figure>' +
              '<img src="../assets/f04-refund-proof.svg" alt="押金退款匯款證明" width="240" height="168">' +
              '<figcaption>匯款證明已歸檔 · ' + fmt.date(TODAY) + '</figcaption></figure></div>', 'js-final-proof')
        + '</div>'
        );
      },
      after: function (s, api) {
        return api.enter(s.querySelector('.js-alert'))
          .then(function () { return api.badge(s.querySelector('.js-status'), '已退還', 'ok'); })
          .then(function () {
            return Promise.all([
              api.count(s.querySelector('.js-kpi-pending'), PENDING_BEFORE, PENDING_BEFORE - 1, 800),
              api.count(s.querySelector('.js-kpi-overdue'), OVERDUE_BEFORE, 0, 800),
              api.count(s.querySelector('.js-kpi-refunded'), REFUNDED_BEFORE, REFUNDED_BEFORE + REFUND, 900)
            ]);
          })
          .then(function () { return api.highlight(s.querySelector('.js-kpi-overdue').closest('.kpi')); });
      }
    }
  ];

  T.mount(host, { feature: 'f04', autoplayMs: 5600, steps: steps });
  A.reveal();
})();
