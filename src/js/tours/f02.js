/*
 * tours/f02.js — 每間房真正損益：功能導覽 8 步
 * ------------------------------------------------------------
 * 畫面全部用 main.css 的共用元件組出來，數字一律從 window.DB 取（docs/DESIGN.md §4、§5）。
 * 流程：收租數字漂亮 → 切到真正損益 → 9 間在賠錢 → 點進 B07 → 修繕吃掉利潤
 *      → 空置是另一個破口 → 排出改善做法 → 虧損清單歸零。
 * 網址加上 #step=3 或 #step=last 可直接跳到某一步（截圖與驗收用）。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB, TP = window.TourPlayer;
  if (!A || !D || !TP) return;

  var esc = A.esc, icon = A.icon, fmt = A.fmt;
  var MONTH = D.currentMonth;
  var MONTH_LABEL = D.pnlOf('A01', MONTH).monthLabel;

  /* ---------- 這條導覽用得到的數字，全部從 DB 算出來 ---------- */
  var ALL = D.regionStat(null, MONTH);                  /* 103 間的收入、成本、淨利 */
  var LOSS = D.lossUnits(MONTH);                        /* 淨利為負，由差到好 */
  var THIN = D.thinMarginUnits(MONTH);                  /* 淨利 0～2,000 元 */
  var LOSS_SUM = Math.abs(LOSS.reduce(function (s, r) { return s + r.net; }, 0));
  var B07 = D.unit('B07'), B07P = D.pnlOf('B07', MONTH);
  var C08 = D.unit('C08'), C08P = D.pnlOf('C08', MONTH);
  var WO = D.workOrder('WO-1038');
  var WO_VENDOR = D.vendorById(WO.vendorId);
  var B07_AC = D.equipmentById('EQ-B07-1');
  var B07_AC_AGE = +MONTH.slice(0, 4) - +B07_AC.purchased.slice(0, 4);
  var B07_NORMAL = B07.monthly[0].net;                  /* 沒有大修的月份淨利 */
  var REPAIR_MONTHS = Math.round((B07P.repair / B07_NORMAL) * 10) / 10;
  var MARGIN = ALL.net / ALL.income;
  var MANAGER = D.staffById('S02');
  var DUE = '2026-09-30';

  /* 導覽用的改善做法（基礎層沒有，寫在這裡） */
  var FIXES = [
    { id: 'B07', label: 'B07　汰換用了 ' + B07_AC_AGE + ' 年的冷氣', hint: '換新比每年修便宜' },
    { id: 'D02', label: 'D02　請屋主分攤壁癌修繕', hint: '牆面屬結構，依上游租約可分攤' },
    { id: 'C08', label: 'C08　檢視租金建議，加強刊登', hint: '空置 ' + C08.vacantDays + ' 天，租金可能偏高' },
    { id: 'A12', label: 'A12　加開帶看時段', hint: '空置 ' + D.unit('A12').vacantDays + ' 天，帶看次數偏少' },
    { id: 'D09', label: 'D09　小修併案派工', hint: '同一趟處理，省來回車資' }
  ];

  /* ====================================================================
   * 畫面零件
   * ==================================================================== */
  function head(title, sub, active) {
    return '<div class="f02-st-head">' +
      '<div class="f02-st-title">' + esc(title) + '<small>' + esc(sub) + '</small></div>' +
      (active ? '<div class="segmented">' +
        '<button type="button" class="tab' + (active === 'income' ? ' is-active' : '') + '" data-seg="income"><span>收租金額</span></button>' +
        '<button type="button" class="tab' + (active === 'net' ? ' is-active' : '') + '" data-seg="net"><span>真正損益</span></button>' +
      '</div>' : '') +
    '</div>';
  }
  function kpiBox(label, valueHtml, hint, kind) {
    return A.kpi({ label: label, valueHtml: valueHtml, hint: hint, kind: kind });
  }
  function nSpan(name, start) {
    return '<span data-n="' + name + '">' + esc(start === undefined ? '0' : start) + '</span>';
  }
  function note(text, id) {
    return '<p class="f02-note">' + icon('info') +
      '<span' + (id ? ' data-type="' + esc(id) + '"' : '') + '>' + esc(text) + '</span></p>';
  }
  function reveal(stage, api, sel) {
    var el = stage.querySelector(sel);
    if (!el) return api.wait(0);
    el.style.opacity = '';
    return api.enter(el);
  }

  /* 損益公式（八項收入與成本＋合計） */
  var LINES = [
    { key: 'rentIncome', label: '租客租金收入', sign: '＋' },
    { key: 'ownerRent', label: '付屋主租金', sign: '−' },
    { key: 'utilityDiff', label: '水電差額', sign: '−' },
    { key: 'internet', label: '網路', sign: '−' },
    { key: 'mgmtFee', label: '管理費', sign: '−' },
    { key: 'repair', label: '修繕', sign: '−' },
    { key: 'depreciation', label: '家具折舊', sign: '−' },
    { key: 'vacancyCost', label: '空置成本', sign: '−' }
  ];
  function formula(p, opts) {
    opts = opts || {};
    var html = '<div class="f02-formula">';
    LINES.forEach(function (l) {
      var open = opts.open === l.key;
      html += '<div class="f02-line" data-line="' + esc(l.key) + '">' +
        '<div class="f02-line-head" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="f02-sign">' + l.sign + '</span>' +
          '<span class="f02-name">' + esc(l.label) + '</span>' +
          '<span class="f02-amt' + (l.key === 'rentIncome' ? '' : ' is-cost') + '">' + esc(fmt.money(p[l.key])) + '</span>' +
          '<span class="f02-caret">' + icon('chevron-down') + '</span>' +
        '</div>' +
        (open ? '<div class="f02-src">' + opts.openHTML + '</div>' : '') +
      '</div>';
    });
    html += '</div>';
    html += '<div class="f02-line--total">' +
      '<span class="f02-sign">＝</span>' +
      '<span class="f02-name">' + esc(MONTH_LABEL) + '淨利</span>' +
      '<span class="f02-amt ' + (p.net >= 0 ? 'pos' : 'neg') + '">' +
        (opts.animateNet ? nSpan('net', '0') : esc(fmt.num(p.net))) + ' 元</span>' +
      '<span></span>' +
    '</div>';
    return html;
  }

  /* 快沒利潤 5 間 */
  function lossTable(selected) {
    return A.table({
      compact: true,
      columns: [
        {
          label: '物件', key: 'id', primary: true,
          render: function (r) {
            return '<span class="cell-strong">' + esc(r.unit.id) + '</span>' +
              '<span class="cell-sub">' + esc(r.unit.region + '　' + r.unit.type) + '</span>';
          }
        },
        {
          label: '主要原因', key: 'why',
          render: function (r) { return '<span class="small muted">' + esc(r.unit.lossReason || '成本高於租金收入') + '</span>'; }
        },
        {
          label: '本月淨利', key: 'net', align: 'num',
          render: function (r) { return '<span class="cell-strong neg">' + esc(fmt.money(r.net)) + '</span>'; }
        }
      ],
      rows: LOSS.slice(0, 5),
      rowClass: function (r) { return r.unit.id === selected ? 'is-selected' : ''; },
      rowAttrs: function (r) { return 'data-row="' + esc(r.unit.id) + '"'; }
    });
  }

  function unitCard(u, p, title) {
    var o = D.ownerOf(u.id);
    return '<article class="card card--static">' +
      '<div class="card-head"><div><h3 class="card-title">' + esc(title) + '</h3>' +
        '<p class="card-sub">' + esc(u.region + '　' + u.building + ' 棟 ' + u.floor + ' 樓　' + u.type) + '</p></div>' +
        '<span class="badge badge--' + (p.net >= 0 ? 'ok' : 'danger') + '" data-badge>' + esc(p.net >= 0 ? '本月獲利' : '本月虧損') + '</span></div>' +
      '<dl class="kv">' +
        '<dt>屋主</dt><dd>' + esc(o ? o.name : '—') + '</dd>' +
        '<dt>空置起算</dt><dd>' + esc(fmt.date(u.vacantSince)) + '</dd>' +
        '<dt>屋主租金</dt><dd>' + esc(fmt.money(p.ownerRent)) + '　照付</dd>' +
      '</dl>' +
    '</article>';
  }

  /* ====================================================================
   * 八個步驟
   * ==================================================================== */
  var steps = [
    /* 1 --------------------------------------------------------------- */
    {
      title: '收租數字很漂亮',
      text: '月報只看得到收進來多少。' + ALL.count + ' 間本月收了 ' + fmt.num(ALL.income) + ' 元，出租率 ' + D.stats.occupancy + '%。',
      render: function (stage, api) {
        stage.innerHTML =
          '<div class="f02-st">' +
            head(MONTH_LABEL + '　營運月報', D.company.name + '　' + ALL.count + ' 間物件', 'income') +
            '<div class="grid grid--3">' +
              kpiBox('本月收租', '<span class="kpi-prefix">NT$</span>' + nSpan('income'), ALL.count + ' 間物件合計', 'ok') +
              kpiBox('出租率', nSpan('occ') + '<small>%</small>', ALL.rented + ' 間在租、' + ALL.vacant + ' 間空著') +
              kpiBox('欠租戶數', nSpan('arrears') + '<small> 戶</small>', 'B11、E07 已逾期') +
            '</div>' +
            '<article class="card card--static">' +
              '<h3 class="card-title">' + icon('wallet') + '收款明細</h3>' +
              A.statRow([
                { label: '應收租金', value: fmt.money(D.stats.income) },
                { label: '本月已收', value: fmt.money(D.stats.income - D.stats.arrearsAmount) },
                { label: '尚未收到', value: fmt.money(D.stats.arrearsAmount), kind: 'danger' }
              ], { divided: true }) +
            '</article>' +
            note('這張表只算收進來的錢，還沒有扣掉任何一項成本。') +
          '</div>';
        api.enter('.kpi');
      },
      after: function (stage, api) {
        return api.count('[data-n="income"]', 0, ALL.income, 1100)
          .then(function () { return api.count('[data-n="occ"]', 0, D.stats.occupancy, 600); })
          .then(function () { return api.count('[data-n="arrears"]', 0, D.stats.arrearsCount, 400); });
      }
    },

    /* 2 --------------------------------------------------------------- */
    {
      title: '切到真正損益',
      text: '同一批資料換個算法：扣掉七項成本後，' + MONTH_LABEL + '真正留下 ' + fmt.num(ALL.net) + ' 元。',
      render: function (stage, api) {
        stage.innerHTML =
          '<div class="f02-st">' +
            head(MONTH_LABEL + '　營運月報', D.company.name + '　' + ALL.count + ' 間物件', 'income') +
            '<div class="grid grid--3">' +
              kpiBox('本月收入', '<span class="kpi-prefix">NT$</span>' + esc(fmt.num(ALL.income)), '租客繳進來的租金') +
              kpiBox('本月總成本', '<span class="kpi-prefix">NT$</span>' + nSpan('cost'), '付屋主租金與其他六項') +
              kpiBox('本月淨利', '<span class="kpi-prefix">NT$</span>' + nSpan('net'), '收入減七項成本', 'accent') +
            '</div>' +
            '<article class="card card--static">' +
              '<div class="card-head"><h3 class="card-title">' + icon('trend') + '成本組成</h3>' +
                '<span class="badge badge--neutral" data-margin>計算中</span></div>' +
              A.statRow([
                { label: '付屋主租金', value: fmt.money(D.stats.ownerRent) },
                { label: '本月修繕', value: fmt.money(D.stats.repairTotal) },
                { label: '其他成本', value: fmt.money(ALL.cost - D.stats.ownerRent - D.stats.repairTotal) }
              ], { divided: true }) +
            '</article>' +
            note('收入減成本才是老闆真正拿到的錢，系統每月自動算，不用另外做表。') +
          '</div>';
        api.enter('.kpi');
      },
      after: function (stage, api) {
        var tab = stage.querySelector('[data-seg="net"]');
        return api.cursor(tab)
          .then(function () {
            stage.querySelector('[data-seg="income"]').classList.remove('is-active');
            tab.classList.add('is-active');
            return api.count('[data-n="cost"]', 0, ALL.cost, 900);
          })
          .then(function () { return api.count('[data-n="net"]', ALL.income, ALL.net, 1100); })
          .then(function () { return api.badge('[data-margin]', '淨利率 ' + fmt.pct(MARGIN), 'accent'); });
      }
    },

    /* 3 --------------------------------------------------------------- */
    {
      title: '九間房其實在賠錢',
      text: '系統自動排出淨利為負的 ' + LOSS.length + ' 間。最嚴重的 B07，本月倒賠 ' + fmt.num(Math.abs(B07P.net)) + ' 元。',
      render: function (stage, api) {
        stage.innerHTML =
          '<div class="f02-st">' +
            head(MONTH_LABEL + '　每間房真正損益', '依本月淨利由低到高排序', 'net') +
            A.alert('', 'danger', {
              title: '本月有 ' + LOSS.length + ' 間房淨利為負',
              html: '<p>另有 ' + THIN.length + ' 間淨利不到 2,000 元。這 ' + LOSS.length + ' 間合計吃掉 ' +
                esc(fmt.money(LOSS_SUM)) + ' 的利潤。</p>'
            }) +
            '<article class="card card--static">' +
              '<div class="card-head"><h3 class="card-title">' + icon('trend-down') + '快沒利潤 5 間</h3>' +
                '<span class="badge badge--danger">' + LOSS.length + ' 間虧損</span></div>' +
              lossTable(null) +
            '</article>' +
          '</div>';
        api.enter('.alert');
      },
      after: function (stage, api) {
        return api.enter('.table tbody tr')
          .then(function () { return api.highlight('.table tbody tr'); });
      }
    },

    /* 4 --------------------------------------------------------------- */
    {
      title: '點進 B07 看成本',
      text: '收入減七項成本逐項列出，哪一項把利潤吃掉，一眼就看得到。',
      render: function (stage, api) {
        stage.innerHTML =
          '<div class="f02-st">' +
            head('B07　成本結構', B07.region + '　' + B07.type + '　' + MONTH_LABEL, 'net') +
            '<div class="f02-st-cols">' +
              '<article class="card card--static" data-list>' +
                '<div class="card-head"><h3 class="card-title">快沒利潤 5 間</h3></div>' +
                lossTable('B07') +
              '</article>' +
              '<article class="card card--static" data-detail style="opacity:0">' +
                '<div class="card-head"><h3 class="card-title">B07 損益公式</h3>' +
                  '<span class="badge badge--neutral" data-badge>計算中</span></div>' +
                formula(B07P, { animateNet: true }) +
              '</article>' +
            '</div>' +
          '</div>';
        api.enter('[data-list]');
      },
      after: function (stage, api) {
        return api.cursor(stage.querySelector('.table tbody tr'))
          .then(function () { return reveal(stage, api, '[data-detail]'); })
          .then(function () { return api.count('[data-n="net"]', B07P.rentIncome, B07P.net, 1200); })
          .then(function () { return api.badge('[data-badge]', '本月虧損', 'danger'); });
      }
    },

    /* 5 --------------------------------------------------------------- */
    {
      title: '一筆修繕吃掉利潤',
      text: '修繕 ' + fmt.num(B07P.repair) + ' 元來自工單 ' + WO.id + '，等於 B07 平常 ' + REPAIR_MONTHS + ' 個月的淨利。',
      render: function (stage, api) {
        var src = '<p>' + esc(WO.id + '　' + WO.title) + '<br>' +
          esc(WO_VENDOR.name + '　' + fmt.date(WO.completedAt) + ' 完工　' + fmt.money(WO.quote)) + '</p>';
        stage.innerHTML =
          '<div class="f02-st">' +
            head('B07　修繕明細', '每一項成本都點得開，看得到來源', 'net') +
            '<div class="f02-st-cols">' +
              '<article class="card card--static" data-detail>' +
                '<div class="card-head"><h3 class="card-title">B07 損益公式</h3>' +
                  '<span class="badge badge--danger">本月虧損</span></div>' +
                formula(B07P, { open: 'repair', openHTML: src }) +
              '</article>' +
              '<div class="stack">' +
                '<article class="card card--static">' +
                  '<h3 class="card-title">' + icon('history') + 'B07 近三個月淨利</h3>' +
                  A.statRow(B07.monthly.map(function (r) {
                    return { label: (+r.month.slice(5)) + ' 月', value: fmt.money(r.net), kind: r.net < 0 ? 'danger' : 'ok' };
                  }), { divided: true }) +
                '</article>' +
                '<article class="card card--static">' +
                  '<div class="card-head"><h3 class="card-title">' + icon('wind') + '這台冷氣的履歷</h3>' +
                    '<span class="badge badge--warn">已用 ' + B07_AC_AGE + ' 年</span></div>' +
                  '<dl class="kv"><dt>品牌型號</dt><dd>' + esc(B07_AC.brand + '　' + B07_AC.model) + '</dd>' +
                    '<dt>購入</dt><dd>' + esc(fmt.date(B07_AC.purchased)) + '</dd>' +
                    '<dt>累計維修</dt><dd>' + esc(fmt.money(B07_AC.totalRepairCost)) + '</dd></dl>' +
                '</article>' +
                note('　', 'why') +
              '</div>' +
            '</div>' +
          '</div>';
        api.enter('[data-detail]');
      },
      after: function (stage, api) {
        api.highlight('[data-line="repair"]');
        return api.type('[data-type="why"]', '一筆 ' + fmt.num(B07P.repair) + ' 元的修繕，等於這間房 ' + REPAIR_MONTHS + ' 個月賺的錢。', 1600);
      }
    },

    /* 6 --------------------------------------------------------------- */
    {
      title: '空著也要付屋主租金',
      text: 'C08 已空置 ' + C08.vacantDays + ' 天，本月只收到 ' + fmt.num(C08P.rentIncome) + ' 元，屋主租金照付。',
      render: function (stage, api) {
        stage.innerHTML =
          '<div class="f02-st">' +
            head('C08　成本結構', C08.region + '　' + C08.type + '　招租中', 'net') +
            '<div class="f02-st-cols">' +
              '<article class="card card--static" data-detail>' +
                '<div class="card-head"><h3 class="card-title">C08 損益公式</h3>' +
                  '<span class="badge badge--neutral" data-badge2>計算中</span></div>' +
                formula(C08P, { animateNet: true }) +
              '</article>' +
              '<div class="stack">' +
                unitCard(C08, C08P, 'C08 空房狀況') +
                note('兩種賠錢方式：B07 是修繕花太多，C08 是空著沒人住。') +
              '</div>' +
            '</div>' +
          '</div>';
        api.enter('[data-detail]');
      },
      after: function (stage, api) {
        return api.count('[data-n="net"]', 0, C08P.net, 1000)
          .then(function () { return api.badge('[data-badge2]', '空置 ' + C08.vacantDays + ' 天', 'warn'); });
      }
    },

    /* 7 --------------------------------------------------------------- */
    {
      title: '每間排出改善做法',
      text: '挑一個做法，系統建立待辦並指派負責人，下個月回頭就知道有沒有改善。',
      render: function (stage, api) {
        stage.innerHTML =
          '<div class="f02-st">' +
            head('虧損檢討', LOSS.length + ' 間虧損物件逐間排定改善做法', 'net') +
            '<div class="f02-st-cols">' +
              '<article class="card card--static" data-fix>' +
                '<div class="card-head"><h3 class="card-title">' + icon('clipboard') + '改善做法</h3>' +
                  '<span class="badge badge--warn" data-fixbadge>待檢討 ' + LOSS.length + ' 間</span></div>' +
                A.checklist(FIXES.map(function (f) { return { id: f.id, label: f.label, hint: f.hint }; })) +
              '</article>' +
              '<div class="stack">' +
                '<article class="card card--static">' +
                  '<h3 class="card-title">' + icon('user-check') + '待辦自動指派</h3>' +
                  '<dl class="kv"><dt>負責人</dt><dd>依做法自動指派，' + esc(MANAGER.name) + ' 統籌</dd>' +
                    '<dt>期限</dt><dd>' + esc(fmt.date(DUE)) + '</dd>' +
                    '<dt>追蹤位置</dt><dd>待辦與員工績效</dd></dl>' +
                '</article>' +
                note('做法選完，待辦就進到負責人的清單，不用再另外交代。') +
              '</div>' +
            '</div>' +
          '</div>';
        api.enter('.card');
      },
      after: function (stage, api) {
        var items = Array.prototype.slice.call(stage.querySelectorAll('.checklist-item'));
        return items.reduce(function (chain, item) {
          return chain.then(function () { return api.check(item); });
        }, api.wait(0))
          .then(function () { return api.badge('[data-fixbadge]', '待辦已建立 ' + FIXES.length + ' 件', 'ok'); });
      }
    },

    /* 8 --------------------------------------------------------------- */
    {
      title: '虧損清單歸零',
      text: LOSS.length + ' 間虧損全部排定做法，警示轉綠。B07 換掉舊冷氣後回到每月 ' + fmt.num(B07_NORMAL) + ' 元。',
      render: function (stage, api) {
        stage.innerHTML =
          '<div class="f02-st">' +
            head(MONTH_LABEL + '　每間房真正損益', '虧損檢討完成', 'net') +
            A.alert('', 'ok', {
              title: '虧損物件都已排定改善做法',
              html: '<p>' + LOSS.length + ' 間全部建立了改善待辦，' + esc(MANAGER.name) + ' 可以在「待辦與員工績效」一次看完進度。</p>'
            }) +
            '<div class="grid grid--3">' +
              kpiBox('待檢討虧損', nSpan('pending', LOSS.length) + '<small> 間</small>', '檢討前是 ' + LOSS.length + ' 間', 'ok') +
              kpiBox('已建立待辦', nSpan('task') + '<small> 件</small>', '負責人 ' + MANAGER.name) +
              kpiBox('B07 改善後淨利', '<span class="kpi-prefix">NT$</span>' + nSpan('b07', fmt.num(B07P.net)), '汰換冷氣、不再每年修', 'ok') +
            '</div>' +
            '<article class="card card--static">' +
              '<h3 class="card-title">' + icon('check-circle') + '這個功能留下什麼</h3>' +
              A.statRow([
                { label: '每月自動重算', value: '不用再做表' },
                { label: '虧損自動警示', value: '淨利轉負就跳出' },
                { label: '成本可追來源', value: '點開看工單' }
              ], { divided: true }) +
            '</article>' +
          '</div>';
        api.enter('.alert');
      },
      after: function (stage, api) {
        return api.enter('.kpi')
          .then(function () { return api.count('[data-n="pending"]', LOSS.length, 0, 900); })
          .then(function () { return api.count('[data-n="task"]', 0, LOSS.length, 600); })
          .then(function () { return api.count('[data-n="b07"]', B07P.net, B07_NORMAL, 1000); });
      }
    }
  ];

  /* ====================================================================
   * 掛載（支援 #step=N／#step=last 直接跳步，方便截圖與驗收）
   * ==================================================================== */
  var jump = String(window.location.hash || '').match(/step=(last|\d+)/);
  function startIndex() {
    if (!jump) return 0;
    if (jump[1] === 'last') return steps.length - 1;
    return Math.max(0, Math.min(steps.length - 1, parseInt(jump[1], 10) - 1));
  }

  var host = document.getElementById('player');
  if (!host) return;
  TP.mount(host, {
    feature: 'f02',
    autoplayMs: 5200,
    start: startIndex(),
    autoplay: !jump,            /* 指定步數時停在那一步，方便看單一畫面 */
    steps: steps
  });
})();
