/*
 * f02.js — 每間房真正損益（進系統操作）
 * ------------------------------------------------------------
 * 資料只讀 window.DB，元件只用 window.App（docs/DESIGN.md §3、§6.1）。
 * 基礎層沒有的東西（成本項目的說明與明細來源、改善做法選單）放在本檔的 EXTRA。
 * 檢討狀態只存在記憶體，重新整理回到初始狀態。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB;
  if (!A || !D) return;

  var esc = A.esc, icon = A.icon, fmt = A.fmt;
  var MONTHS = D.months.slice();
  var REGIONS = ['全部'].concat(D.company.regions);
  var THIN_LINE = 2000;                 /* 淨利低於這個數字就算「快沒利潤」 */

  /* ====================================================================
   * EXTRA：基礎層沒有的資料（不改 data.js／common.js）
   * ==================================================================== */
  var EXTRA = {
    /* 損益公式的七項成本＋一項收入；source() 回傳這一項的明細來源 */
    items: [
      {
        key: 'rentIncome', label: '租客租金收入', sign: '＋', perm: 'rent', tone: 'in',
        hint: '下游租約（公司→租客）',
        source: function (u, p) {
          var t = D.tenantOf(u.id);
          var days = daysInMonth(p.month);
          if (p.vacantDays > 0) {
            return {
              rows: [
                ['租約月租', fmt.money(u.rent)],
                ['本月在租', (days - p.vacantDays) + ' 天／共 ' + days + ' 天'],
                ['實收租金', fmt.money(p.rentIncome)]
              ],
              note: '本月空置 ' + p.vacantDays + ' 天，只收到在租那幾天的租金。'
            };
          }
          return {
            rows: [
              ['租客', t ? t.name + '（' + (t.paid === '已繳' ? '本月已繳' : t.paid === '逾期' ? '逾期 ' + t.arrearsDays + ' 天' : '本月未繳') + '）' : '目前沒有租客'],
              ['下游租約', fmt.date(u.downstream.start) + '～' + fmt.date(u.downstream.end)],
              ['月租', fmt.money(u.rent)]
            ],
            note: '全月在租，收入等於租約月租。'
          };
        }
      },
      {
        key: 'ownerRent', label: '付屋主租金', sign: '−', perm: 'ownerRent',
        hint: '上游租約（屋主→公司）',
        source: function (u, p) {
          var o = D.ownerOf(u.id);
          return {
            rows: [
              ['屋主', o ? o.name : '—'],
              ['上游租約', fmt.date(u.upstream.start) + '～' + fmt.date(u.upstream.end)],
              ['付款日', '每月 ' + u.upstream.payDay + ' 日'],
              ['月付金額', fmt.money(p.ownerRent)]
            ],
            note: '不論房子有沒有租出去，這筆每月都要付給屋主。'
          };
        }
      },
      {
        key: 'utilityDiff', label: '水電差額', sign: '−',
        hint: '抄表超出基準的部分由公司吸收',
        source: function (u, p) {
          return {
            rows: [
              ['基準用量', '水 ' + u.baseline.water + ' 度、電 ' + u.baseline.elec + ' 度'],
              ['本月差額', fmt.money(p.utilityDiff)]
            ],
            note: '用量異常會在「水電異常偵測」另外開警示。'
          };
        }
      },
      {
        key: 'internet', label: '網路', sign: '−',
        hint: '全棟網路月費分攤',
        source: function (u, p) {
          return {
            rows: [['分攤方式', u.building + ' 棟固定分攤'], ['房型', u.type], ['每月', fmt.money(p.internet)]],
            note: '租約寫明網路由公司提供。'
          };
        }
      },
      {
        key: 'mgmtFee', label: '管理費', sign: '−',
        hint: '大樓管理費由公司負擔',
        source: function (u, p) {
          return {
            rows: [['所在地', u.region + '　' + u.building + ' 棟 ' + u.floor + ' 樓'], ['負擔方', u.upstream.mgmtFeeBy], ['每月', fmt.money(p.mgmtFee)]],
            note: '上游租約約定管理費由公司負擔。'
          };
        }
      },
      {
        key: 'repair', label: '修繕', sign: '−', perm: 'repairCost',
        hint: '來自本月已完工的工單',
        source: function (u, p) {
          var wos = workOrdersIn(u.id, p.month);
          var listed = 0;
          var rows = wos.map(function (w) {
            listed += w.quote || 0;
            var v = D.vendorById(w.vendorId);
            return [w.id, w.title + '　' + fmt.money(w.quote) + '　' + (v ? v.name : '未指定廠商') + '　' + fmt.date(w.completedAt)];
          });
          var rest = Math.round((p.repair || 0) - listed);
          if (rest > 0) rows.push(['零星修繕', fmt.money(rest) + '　未另開工單的小額項目']);
          if (!rows.length) rows.push(['本月工單', '沒有修繕紀錄']);
          return { rows: rows, note: wos.length ? '點「廠商與修繕工單」可看完整派工與報價紀錄。' : '這間房本月沒有花到修繕費。' };
        }
      },
      {
        key: 'depreciation', label: '家具折舊', sign: '−',
        hint: '裝修與家具投入分 60 個月攤提',
        source: function (u, p) {
          return {
            rows: [['裝修與家具投入', fmt.money(u.setupCost)], ['攤提期間', '60 個月'], ['每月認列', fmt.money(p.depreciation)]],
            note: '這是帳面成本，不是本月真的付出去的錢。'
          };
        }
      },
      {
        key: 'vacancyCost', label: '空置成本', sign: '−',
        hint: '招租刊登、清潔與水電基本費',
        source: function (u, p) {
          if (!p.vacantDays) {
            return { rows: [['本月空置', '0 天']], note: '這間房本月滿租，沒有空置成本。' };
          }
          return {
            rows: [
              ['空置起算', fmt.date(u.vacantSince)],
              ['本月空置', p.vacantDays + ' 天'],
              ['本月金額', fmt.money(p.vacancyCost)]
            ],
            note: '空置期間屋主租金照付，招租與清潔還要再花錢。'
          };
        }
      }
    ],

    /* 改善做法：檢討虧損物件時挑一個，系統據此建立待辦 */
    actions: [
      { id: 'equipment', label: '汰換老舊設備', task: '評估汰換設備並取得報價', owner: 'S05' },
      { id: 'negotiate', label: '與屋主議價', task: '與屋主協商調整上游租金或分攤修繕', owner: 'S02' },
      { id: 'reprice', label: '檢視租金建議', task: '檢視租金建議並加強刊登曝光', owner: 'S02' },
      { id: 'share', label: '請屋主分攤修繕', task: '依上游租約請屋主分攤結構與管線修繕', owner: 'S02' }
    ],
    dueDate: '2026-09-30'
  };

  /* ====================================================================
   * 小工具
   * ==================================================================== */
  function daysInMonth(m) { var p = m.split('-'); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  function workOrdersIn(unitId, month) {
    return D.workOrders.filter(function (w) {
      return w.unitId === unitId && w.completedAt && w.completedAt.slice(0, 7) === month &&
        (w.status === '完成' || w.status === '待付款');
    });
  }
  function canSee(type) { return A.can(A.role, type); }
  /* 看不到這類金額的角色一律顯示打碼，不用尾數暗示金額 */
  function money(v, perm) { return (perm && !canSee(perm)) ? '••••' : fmt.money(v); }
  function netVisible() { return canSee('rent') && canSee('ownerRent'); }
  function $(id) { return document.getElementById(id); }

  /* ====================================================================
   * 狀態
   * ==================================================================== */
  var state = {
    month: D.currentMonth,
    region: '全部',
    scope: 'all',              /* all | loss | thin | top */
    selected: 'B07',
    sortKey: 'net',
    sortDir: 'asc',
    reviewed: {},              /* unitId -> { actionId, at } */
    openItem: null             /* 詳情卡展開中的成本項目 */
  };

  var SCOPES = [
    { id: 'all', label: '全部物件' },
    { id: 'loss', label: '本月虧損' },
    { id: 'thin', label: '快沒利潤' },
    { id: 'top', label: '最賺前五' }
  ];

  /* ====================================================================
   * 資料計算
   * ==================================================================== */
  function rowsOf(month) {
    return D.units.map(function (u) {
      var p = D.pnlOf(u.id, month);
      return {
        id: u.id, unit: u, pnl: p,
        region: u.region, type: u.type,
        rentIncome: p.rentIncome, ownerRent: p.ownerRent, utilityDiff: p.utilityDiff,
        internet: p.internet, mgmtFee: p.mgmtFee, repair: p.repair,
        depreciation: p.depreciation, vacancyCost: p.vacancyCost,
        net: p.net, annualReturn: p.annualReturn
      };
    });
  }
  function lossRows(month, region) {
    return filterRegion(rowsOf(month), region).filter(function (r) { return r.net < 0; })
      .sort(function (a, b) { return a.net - b.net; });
  }
  function thinRows(month, region) {
    return filterRegion(rowsOf(month), region).filter(function (r) { return r.net < THIN_LINE; })
      .sort(function (a, b) { return a.net - b.net; });
  }
  function topRows(month, region) {
    return filterRegion(rowsOf(month), region).slice().sort(function (a, b) { return b.net - a.net; });
  }
  function filterRegion(rows, region) {
    if (!region || region === '全部') return rows;
    return rows.filter(function (r) { return r.region === region; });
  }
  function visibleRows() {
    var rows = filterRegion(rowsOf(state.month), state.region);
    if (state.scope === 'loss') rows = rows.filter(function (r) { return r.net < 0; });
    if (state.scope === 'thin') rows = rows.filter(function (r) { return r.net < THIN_LINE; });
    if (state.scope === 'top') {
      rows = rows.slice().sort(function (a, b) { return b.net - a.net; }).slice(0, 5);
    }
    return rows;
  }
  function summaryOf(month, region) {
    var rows = filterRegion(rowsOf(month), region);
    var income = 0, cost = 0, net = 0, repair = 0, setup = 0;
    rows.forEach(function (r) {
      income += r.rentIncome; cost += r.pnl.cost; net += r.net;
      repair += r.repair; setup += r.unit.setupCost;
    });
    return {
      count: rows.length,
      income: Math.round(income), cost: Math.round(cost), net: Math.round(net),
      repair: Math.round(repair),
      margin: income ? net / income : 0,
      annual: setup ? (net * 12) / setup : 0,
      loss: rows.filter(function (r) { return r.net < 0; }).length,
      thin: rows.filter(function (r) { return r.net >= 0 && r.net < THIN_LINE; }).length
    };
  }
  /* 本月虧損物件（不受區域篩選影響，警示條與主流程都以整體為準） */
  function allLoss() { return lossRows(state.month, '全部'); }
  function pendingLoss() {
    return allLoss().filter(function (r) { return !state.reviewed[r.id]; });
  }

  /* ====================================================================
   * 畫面：警示條
   * ==================================================================== */
  function renderBanner() {
    var host = $('f02-banner');
    var loss = allLoss(), pending = pendingLoss();
    var monthName = D.pnlOf('A01', state.month).monthLabel;
    var html = '';

    if (!loss.length) {
      html = A.alert(monthName + '沒有任何一間房是虧的，最低的一間仍有淨利。', 'ok', { title: '本月全數獲利' });
    } else if (pending.length) {
      html = A.alert('', 'danger', {
        title: monthName + '有 ' + loss.length + ' 間房淨利為負',
        html: '<p>還有 ' + pending.length + ' 間沒有排定改善做法。最嚴重的是 ' + esc(loss[0].id) + '，本月淨利 ' +
          esc(money(loss[0].net, 'rent')) + '。</p>',
        action: '<button type="button" class="btn btn--danger btn--sm" data-f02-review-next>檢討 ' + esc(pending[0].id) + '</button>'
      });
    } else {
      html = A.alert('', 'ok', {
        title: '虧損物件都已排定改善做法',
        html: '<p>' + monthName + '的 ' + loss.length + ' 間虧損物件全部建立了改善待辦，負責人可以在「待辦與員工績效」追進度。</p>'
      });
    }

    if (!netVisible()) {
      html += '<div class="mt-16">' + A.alert('修繕人員看得到修繕費用，看不到租金與付屋主租金，所以這頁的淨利以打碼顯示。', 'accent', { title: '目前是修繕人員視角' }) + '</div>';
    }
    host.innerHTML = html;

    var btn = $('f02-start-review');
    if (!loss.length) {
      btn.disabled = true;
      btn.textContent = '本月沒有虧損物件';
    } else if (!pending.length) {
      btn.disabled = true;
      btn.textContent = '虧損都已檢討';
    } else {
      btn.disabled = false;
      btn.textContent = '檢討虧損物件';
    }
  }

  /* ====================================================================
   * 畫面：工具列
   * ==================================================================== */
  function renderToolbar() {
    var host = $('f02-toolbar');
    host.innerHTML =
      '<div class="f02-field"><span>月份（' + MONTHS[0].slice(0, 4) + ' 年）</span>' +
        A.tabs(MONTHS.map(function (m) { return { id: m, label: (+m.slice(5)) + ' 月' }; }),
          { segmented: true, active: state.month, group: 'f02-month' }) +
      '</div>' +
      '<div class="f02-field"><label for="f02-region">區域</label>' +
        '<select class="select" id="f02-region">' + REGIONS.map(function (r) {
          return '<option value="' + esc(r) + '"' + (r === state.region ? ' selected' : '') + '>' + esc(r) + '</option>';
        }).join('') + '</select>' +
      '</div>' +
      '<div class="f02-field"><label for="f02-scope">清單範圍</label>' +
        '<select class="select" id="f02-scope">' + SCOPES.map(function (s) {
          return '<option value="' + esc(s.id) + '"' + (s.id === state.scope ? ' selected' : '') + '>' + esc(s.label) + '</option>';
        }).join('') + '</select>' +
      '</div>';

    host.querySelectorAll('.segmented .tab').forEach(function (b) {
      b.addEventListener('click', function () {
        state.month = b.getAttribute('data-tab');
        state.openItem = null;
        renderAll();
        A.toast('已切換到 ' + D.pnlOf('A01', state.month).monthLabel, 'neutral', { ms: 2000 });
      });
    });
    $('f02-region').addEventListener('change', function () {
      state.region = this.value;
      renderAll();
    });
    $('f02-scope').addEventListener('change', function () {
      state.scope = this.value;
      renderTable();
    });
  }

  /* ====================================================================
   * 畫面：KPI 與「唸得出來的那一句」
   * ==================================================================== */
  function renderSummary() {
    var s = summaryOf(state.month, state.region);
    var label = state.region === '全部' ? '全部區域' : state.region;

    $('f02-kpis').innerHTML =
      A.kpi({ label: label + '本月收入', value: 'NT$ ' + fmt.num(s.income), icon: 'wallet', hint: s.count + ' 間物件' }) +
      A.kpi({ label: '總成本', value: 'NT$ ' + fmt.num(s.cost), icon: 'receipt', hint: '含付屋主租金與七項成本' }) +
      A.kpi({ label: '本月淨利', value: netVisible() ? 'NT$ ' + fmt.num(s.net) : '••••', icon: 'trend', hint: '淨利率 ' + fmt.pct(s.margin), kind: s.net >= 0 ? 'ok' : 'danger' }) +
      A.kpi({ label: '虧損物件', value: s.loss, unit: ' 間', icon: 'alert', hint: '另有 ' + s.thin + ' 間淨利不到 ' + fmt.num(THIN_LINE) + ' 元', kind: s.loss ? 'danger' : 'ok' });

    $('f02-say').innerHTML =
      '<p class="f02-say">' +
        '<span>' + esc(label) + '</span><b>' + fmt.num(s.count) + ' 間</b>' +
        '<span class="f02-say-sep">｜</span><span>本月收入</span><b>' + esc(money(s.income, 'rent')) + '</b>' +
        '<span class="f02-say-sep">｜</span><span>總成本</span><b>' + esc(money(s.cost, 'rent')) + '</b>' +
        '<span class="f02-say-sep">｜</span><span>淨利</span>' +
        '<b class="f02-say-net' + (s.net < 0 ? ' is-neg' : '') + '">' + esc(money(s.net, 'rent')) + '</b>' +
      '</p>' +
      '<p class="f02-say-note">' + esc(D.pnlOf('A01', state.month).monthLabel) + '：淨利率 ' + esc(fmt.pct(s.margin)) +
        '，年化報酬 ' + esc(fmt.pct(s.annual)) + '，本月修繕合計 ' + esc(money(s.repair, 'repairCost')) + '。</p>';
  }

  /* ====================================================================
   * 畫面：排行
   * ==================================================================== */
  function rankItemHTML(r, i) {
    var reviewed = state.reviewed[r.id];
    return '<button type="button" class="f02-rank-item' + (r.id === state.selected ? ' is-selected' : '') + '" data-f02-unit="' + esc(r.id) + '">' +
      '<span class="f02-rank-no">' + (i + 1) + '</span>' +
      '<span class="f02-rank-name">' + esc(r.id) +
        (reviewed ? ' ' + A.badge('已排定', 'ok') : '') +
        '<small>' + esc(r.region + '　' + r.type + '　' + (r.unit.status === 'rented' ? '出租中' : D.statusName(r.unit.status))) + '</small>' +
      '</span>' +
      '<span class="f02-rank-net ' + (r.net >= 0 ? 'pos' : 'neg') + '">' + esc(money(r.net, 'rent')) +
        '<small>年化 ' + esc(netVisible() ? fmt.pct(r.annualReturn) : '••••') + '</small>' +
      '</span>' +
    '</button>';
  }
  function renderRanks() {
    var region = state.region === '全部' ? '全部' : state.region;
    var top = topRows(state.month, region).slice(0, 5);
    var thin = thinRows(state.month, region).slice(0, 5);
    var scopeName = state.region === '全部' ? '' : state.region + '　';

    $('f02-rank-top').innerHTML =
      '<div class="card-head"><div><h2 class="card-title">' + icon('trend') + '最賺 5 間</h2>' +
        '<p class="card-sub">' + esc(scopeName) + '本月淨利最高的五間</p></div></div>' +
      (top.length
        ? '<div class="f02-rank">' + top.map(function (r, i) { return rankItemHTML(r, i); }).join('') + '</div>'
        : A.emptyState({ sm: true, title: '這個區域沒有物件', text: '換一個區域再看。' }));

    $('f02-rank-thin').innerHTML =
      '<div class="card-head"><div><h2 class="card-title">' + icon('trend-down') + '快沒利潤 5 間</h2>' +
        '<p class="card-sub">' + esc(scopeName) + '淨利為負或不到 ' + fmt.num(THIN_LINE) + ' 元</p></div>' +
        A.badge('共 ' + thinRows(state.month, region).length + ' 間', thin.length ? 'danger' : 'ok') + '</div>' +
      (thin.length
        ? '<div class="f02-rank">' + thin.map(function (r, i) { return rankItemHTML(r, i); }).join('') + '</div>'
        : A.emptyState({ sm: true, icon: 'check-circle', title: '沒有快沒利潤的物件', text: '這個範圍每間房的淨利都超過 ' + fmt.num(THIN_LINE) + ' 元。' }));
  }

  /* ====================================================================
   * 畫面：成本結構詳情
   * ==================================================================== */
  function formulaHTML(u, p) {
    var html = '<div class="f02-formula">';
    EXTRA.items.forEach(function (it) {
      var v = p[it.key];
      var open = state.openItem === it.key;
      html += '<div class="f02-line">' +
        '<button type="button" class="f02-line-head" data-f02-item="' + esc(it.key) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="f02-sign">' + it.sign + '</span>' +
          '<span class="f02-name">' + esc(it.label) + '<small>' + esc(it.hint) + '</small></span>' +
          '<span class="f02-amt' + (it.tone === 'in' ? '' : ' is-cost') + '">' + esc(money(v, it.perm)) + '</span>' +
          '<span class="f02-caret">' + icon('chevron-down') + '</span>' +
        '</button>' +
        '<div class="f02-src"' + (open ? '' : ' hidden') + '>' + srcHTML(it, u, p) + '</div>' +
      '</div>';
    });
    html += '</div>';
    html += '<div class="f02-line--total">' +
      '<span class="f02-sign">＝</span>' +
      '<span class="f02-name">' + esc(p.monthLabel) + '淨利<small>年化報酬 ' + esc(netVisible() ? fmt.pct(p.annualReturn) : '••••') + '</small></span>' +
      '<span class="f02-amt ' + (p.net >= 0 ? 'pos' : 'neg') + '">' + esc(money(p.net, 'rent')) + '</span>' +
      '<span></span>' +
    '</div>';
    return html;
  }
  function srcHTML(it, u, p) {
    if (it.perm && !canSee(it.perm)) {
      return '<p>目前角色看不到這一項的金額與明細。</p>';
    }
    var s = it.source(u, p);
    return '<dl>' + s.rows.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('') + '</dl>' + (s.note ? '<p class="f02-src-note">' + esc(s.note) + '</p>' : '');
  }

  function renderDetail() {
    var host = $('f02-detail');
    var u = D.unit(state.selected);
    if (!u) { host.innerHTML = A.emptyState({ title: '找不到這間物件', text: '從下方表格挑一間再看一次。' }); return; }
    var p = D.pnlOf(u.id, state.month);
    var reviewed = state.reviewed[u.id];
    var t = D.tenantOf(u.id);

    host.innerHTML =
      '<div class="card-head">' +
        '<div><h2 class="card-title">' + icon('chart') + esc(u.id) + '　成本結構</h2>' +
          '<p class="card-sub">' + esc(u.region + '　' + u.building + ' 棟 ' + u.floor + ' 樓　' + u.type + '　' + fmt.ping(u.ping) +
            (t ? '　租客 ' + t.name : '　目前沒有租客')) + '　·　點下方表格任一列，這裡就換成那一間</p></div>' +
        A.badge(D.statusName(u.status), u.status === 'rented' ? 'ok' : u.status === 'listing' ? 'warn' : 'neutral') +
      '</div>' +
      '<div class="f02-detail-grid">' +
        '<div>' + formulaHTML(u, p) + reviewBoxHTML(u, p, reviewed) + '</div>' +
        '<div>' +
          '<div class="f02-chart"><p class="f02-chart-title">成本結構（合計 ' + esc(money(p.cost, 'rent')) + '）</p>' +
            '<div id="f02-donut"></div></div>' +
          '<div class="f02-chart"><p class="f02-chart-title">近三個月淨利</p>' +
            '<div id="f02-trend"></div></div>' +
        '</div>' +
      '</div>';

    drawCharts(u, p);
  }

  function reviewBoxHTML(u, p, reviewed) {
    if (p.net >= 0) {
      return '<div class="f02-review-box">' +
        '<p class="f02-review-title">' + esc(u.id) + ' 本月淨利 ' + esc(money(p.net, 'rent')) + '</p>' +
        '<p class="small muted">這間房還在賺，不需要排改善做法。想看賠錢的，把清單範圍切到「本月虧損」。</p>' +
      '</div>';
    }
    if (reviewed) {
      var act = EXTRA.actions.filter(function (a) { return a.id === reviewed.actionId; })[0];
      var owner = D.staffById(act.owner);
      return '<div class="f02-review-box">' +
        '<p class="f02-review-title">' + icon('check-circle') + ' 已排定改善做法</p>' +
        '<p class="small">' + esc(act.label) + '　·　待辦「' + esc(act.task) + '」已指派給 ' + esc(owner ? owner.name : '') +
          '，期限 ' + esc(fmt.date(EXTRA.dueDate)) + '。</p>' +
        '<div><button type="button" class="btn btn--secondary btn--sm" data-f02-cancel="' + esc(u.id) + '">取消這筆待辦</button></div>' +
      '</div>';
    }
    var disabled = !netVisible();
    return '<div class="f02-review-box">' +
      '<p class="f02-review-title">這間房本月賠 ' + esc(money(Math.abs(p.net), 'rent')) + '，排一個改善做法</p>' +
      (u.lossReason ? '<p class="small muted">主要原因：' + esc(u.lossReason) + '</p>' : '') +
      '<div class="row">' +
        '<select class="select" id="f02-action" aria-label="改善做法"' + (disabled ? ' disabled' : '') + '>' +
          EXTRA.actions.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.label) + '</option>'; }).join('') +
        '</select>' +
        '<button type="button" class="btn btn--primary" data-f02-task="' + esc(u.id) + '"' + (disabled ? ' disabled' : '') + '>建立改善待辦</button>' +
      '</div>' +
      (disabled ? '<p class="small muted">修繕人員看不到租金資料，改善待辦由老闆或租務管理員建立。</p>' : '') +
    '</div>';
  }

  function drawCharts(u, p) {
    var donut = $('f02-donut'), trend = $('f02-trend');
    if (!donut || !trend) return;

    if (!netVisible()) {
      donut.innerHTML = '<p class="small muted">目前角色看不到租金與付屋主租金，成本結構不顯示。</p>';
      trend.innerHTML = '<p class="small muted">目前角色看不到淨利趨勢。</p>';
      return;
    }

    var parts = [
      { label: '付屋主租金', value: p.ownerRent, color: 'var(--accent)' },
      { label: '修繕', value: p.repair, color: 'var(--danger)' },
      { label: '家具折舊', value: p.depreciation, color: 'var(--ink-3)' },
      { label: '空置成本', value: p.vacancyCost, color: 'var(--warn)' },
      { label: '水電差額', value: p.utilityDiff, color: 'var(--ok)' },
      { label: '網路', value: p.internet, color: 'var(--ink)' },
      { label: '管理費', value: p.mgmtFee, color: 'var(--line)' }
    ].filter(function (d) { return d.value > 0; });

    A.charts.donut(donut, {
      data: parts, size: 180, thickness: 20,
      title: u.id + ' 本月成本結構',
      centerValue: fmt.moneyShort(p.cost), centerLabel: '總成本',
      valueFormat: function (v) { return fmt.money(v); }
    });

    A.charts.bar(trend, {
      labels: u.monthly.map(function (r) { return (+r.month.slice(5)) + ' 月'; }),
      series: [{ name: '淨利', data: u.monthly.map(function (r) { return r.net; }) }],
      height: 180, showValues: true, legend: false,
      valueFormat: function (v) { return fmt.money(v); },
      title: u.id + ' 近三個月淨利'
    });
  }

  /* ====================================================================
   * 畫面：主表格
   * ==================================================================== */
  function amtCol(label, key, perm, sign) {
    return {
      label: sign ? sign + ' ' + label : label, key: key, align: 'num', sortable: true,
      sortValue: function (r) { return r[key]; },
      render: function (r) { return esc(money(r[key], perm)); }
    };
  }
  function renderTable() {
    var rows = visibleRows();
    var scopeLabel = SCOPES.filter(function (s) { return s.id === state.scope; })[0].label;
    $('f02-table-count').textContent = scopeLabel + '　' + rows.length + ' 間　·　' +
      (state.region === '全部' ? '全部區域' : state.region) + '　·　' + D.pnlOf('A01', state.month).monthLabel;

    $('f02-table').innerHTML = A.table({
      id: 'f02-pnl-table',
      className: 'f02-table',
      compact: true,
      sortable: true,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      onSort: function (key, dir) { state.sortKey = key; state.sortDir = dir; },
      rowClass: function (r) {
        return (r.id === state.selected ? 'is-selected ' : '') + 'is-clickable' + (r.net < 0 ? ' is-danger' : '');
      },
      rowAttrs: function (r) { return 'data-f02-unit="' + esc(r.id) + '" tabindex="0"'; },
      columns: [
        {
          label: '物件', key: 'id', primary: true, sortable: true,
          render: function (r) {
            return '<span class="cell-strong">' + esc(r.id) + '</span>' +
              (state.reviewed[r.id] ? ' ' + A.badge('已排定', 'ok') : '') +
              '<span class="cell-sub">' + esc(r.region + '　' + r.type + '　' + D.statusName(r.unit.status)) + '</span>';
          }
        },
        amtCol('租金收入', 'rentIncome', 'rent', '＋'),
        amtCol('付屋主租金', 'ownerRent', 'ownerRent', '−'),
        amtCol('水電差額', 'utilityDiff', null, '−'),
        amtCol('網路', 'internet', null, '−'),
        amtCol('管理費', 'mgmtFee', null, '−'),
        amtCol('修繕', 'repair', 'repairCost', '−'),
        amtCol('家具折舊', 'depreciation', null, '−'),
        amtCol('空置成本', 'vacancyCost', null, '−'),
        {
          label: '＝ 本月淨利', key: 'net', align: 'num', sortable: true,
          render: function (r) {
            return '<span class="cell-strong ' + (r.net >= 0 ? 'pos' : 'neg') + '">' + esc(money(r.net, 'rent')) + '</span>';
          }
        },
        {
          label: '年化報酬', key: 'annualReturn', align: 'num', sortable: true,
          render: function (r) { return netVisible() ? esc(fmt.pct(r.annualReturn)) : '••••'; }
        }
      ],
      rows: rows,
      empty: {
        icon: 'search',
        title: '這個範圍沒有物件',
        text: '換一個區域，或把清單範圍切回「全部物件」。'
      }
    });
  }

  /* ====================================================================
   * 互動
   * ==================================================================== */
  function select(unitId, opts) {
    if (!D.unit(unitId)) return;
    state.selected = unitId;
    state.openItem = null;
    renderRanks();
    renderDetail();
    renderTable();
    if (opts && opts.scroll) {
      var el = $('f02-detail');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function createTask(unitId) {
    var sel = $('f02-action');
    var actionId = sel ? sel.value : EXTRA.actions[0].id;
    var act = EXTRA.actions.filter(function (a) { return a.id === actionId; })[0];
    var u = D.unit(unitId), p = D.pnlOf(unitId, state.month);
    var owner = D.staffById(act.owner);

    A.modal({
      title: '建立改善待辦',
      size: 'sm',
      body:
        '<dl class="kv">' +
          '<dt>物件</dt><dd>' + esc(u.id + '　' + u.region + '　' + u.type) + '</dd>' +
          '<dt>本月淨利</dt><dd class="neg">' + esc(money(p.net, 'rent')) + '</dd>' +
          '<dt>改善做法</dt><dd>' + esc(act.label) + '</dd>' +
          '<dt>待辦內容</dt><dd>' + esc(act.task) + '</dd>' +
          '<dt>負責人</dt><dd>' + esc(owner ? owner.name + '（' + A.roleName(owner.role) + '）' : '') + '</dd>' +
          '<dt>期限</dt><dd>' + esc(fmt.date(EXTRA.dueDate)) + '</dd>' +
        '</dl>' +
        '<p class="small muted mt-16">建立後會出現在待辦清單，這裡的狀態改成「已排定」。</p>',
      actions: [
        { label: '取消', kind: 'secondary' },
        {
          label: '建立待辦', kind: 'primary',
          onClick: function () {
            state.reviewed[unitId] = { actionId: actionId, at: D.today };
            renderAll();
            var left = pendingLoss().length;
            A.toast('已為 ' + unitId + ' 建立改善待辦，負責人 ' + (owner ? owner.name : '') +
              (left ? '。還有 ' + left + ' 間待檢討' : '。虧損物件都檢討完了'), 'ok');
          }
        }
      ]
    });
  }

  function undoTask(unitId) {
    delete state.reviewed[unitId];
    renderAll();
    A.toast('已取消 ' + unitId + ' 的改善待辦', 'neutral');
  }

  function reviewNext() {
    var pending = pendingLoss();
    if (!pending.length) { A.toast('虧損物件都已排定改善做法', 'ok'); return; }
    select(pending[0].id, { scroll: true });
    A.toast('先看 ' + pending[0].id + '：本月淨利 ' + money(pending[0].net, 'rent'), 'warn');
  }

  function bind() {
    $('f02-start-review').addEventListener('click', reviewNext);

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;

      var next = t.closest('[data-f02-review-next]');
      if (next) { reviewNext(); return; }

      var task = t.closest('[data-f02-task]');
      if (task) { createTask(task.getAttribute('data-f02-task')); return; }

      var undo = t.closest('[data-f02-cancel]');
      if (undo) { undoTask(undo.getAttribute('data-f02-cancel')); return; }

      var item = t.closest('[data-f02-item]');
      if (item) {
        var key = item.getAttribute('data-f02-item');
        state.openItem = state.openItem === key ? null : key;
        var box = item.nextElementSibling;
        item.setAttribute('aria-expanded', state.openItem === key ? 'true' : 'false');
        if (box) box.hidden = state.openItem !== key;
        if (state.openItem === key) {
          item.parentNode.parentNode.querySelectorAll('.f02-line-head').forEach(function (h) {
            if (h === item) return;
            h.setAttribute('aria-expanded', 'false');
            if (h.nextElementSibling) h.nextElementSibling.hidden = true;
          });
        }
        return;
      }

      var unit = t.closest('[data-f02-unit]');
      if (unit) { select(unit.getAttribute('data-f02-unit')); return; }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var t = e.target;
      if (!(t instanceof Element)) return;
      var row = t.closest('tr[data-f02-unit]');
      if (row) { e.preventDefault(); select(row.getAttribute('data-f02-unit')); }
    });

    var lastVisible = netVisible();
    A.onRole(function () {
      renderAll();
      var now = netVisible();
      if (now !== lastVisible) {
        A.toast(now ? '這個視角看得到完整金額' : '修繕人員看不到租金與付屋主租金，金額改為打碼', 'neutral', { ms: 2800 });
      }
      lastVisible = now;
    });
  }

  /* ====================================================================
   * 啟動
   * ==================================================================== */
  function renderAll() {
    renderBanner();
    renderSummary();
    renderRanks();
    renderDetail();
    renderTable();
  }

  function boot() {
    renderToolbar();
    renderAll();
    bind();
    A.reveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
