/* tours/f16.js — 老闆營運儀表板 的功能導覽（7 步）
 * 契約：docs/DESIGN.md §4（TourPlayer.mount 與 api）、§5（數字全部取自 DB）、§6（文案）。
 * 流程：早上打開儀表板 → 看淨利 → 看十三項指標 → 看 30／60／90 天到期 → 看現金流 → 切區域比較 → 要盯的事歸零。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  var TP = window.TourPlayer;
  if (!A || !D || !TP) return;

  var esc = A.esc;
  var icon = A.icon;
  var fmt = A.fmt;
  var S = D.stats;

  var REGION = {};
  S.regions.forEach(function (r) { REGION[r.region] = r; });
  var ALL = REGION['全部'];
  var ZL = REGION['中壢'];
  var REGION_NAMES = D.company.regions;

  var TOTAL_COST = ALL.cost;
  var OTHER_COST = TOTAL_COST - S.ownerRent;
  var ZL_OCC = +(ZL.rented / ZL.count * 100).toFixed(1);

  /* 今天要盯的四件事（與操作頁同一組資料） */
  var RISK = D.riskUnits();
  var LONG_VACANT = D.units.filter(function (u) {
    return (u.status === 'listing' || u.status === 'prep') && (u.vacantDays || 0) > 14;
  });
  var LOSS = D.units.filter(function (u) { return D.pnlOf(u.id).net < 0; });
  var ARREARS = D.tenants.filter(function (t) { return t.arrearsDays > 0; });

  var WATCH = [
    { name: '屋主租約先到期', text: RISK.length + ' 間，最快的是 ' + RISK[0].unit.id, to: 'S02' },
    { name: '空房超過 14 天', text: LONG_VACANT.length + ' 間，最久的是 C08 共 33 天', to: 'S03' },
    { name: '本月淨利為負', text: LOSS.length + ' 間，修繕與空置吃掉利潤', to: 'S04' },
    { name: '租客欠租', text: ARREARS.length + ' 戶，待收 ' + fmt.money(ARREARS.reduce(function (s, t) { return s + t.arrearsAmount; }, 0)), to: 'S04' }
  ];
  function who(id) { var s = D.staffById(id); return s ? s.name : ''; }

  /* ------------------------------------------------------------------ 畫面零件 */
  function shell(opts) {
    opts = opts || {};
    return '<div class="f16-stage">'
      + '<div class="f16-stage__bar">'
      + '<span class="f16-stage__brand">' + icon('layers', { size: 22 }) + esc(D.company.system) + '</span>'
      + '<span class="f16-stage__role">老闆視角</span>'
      + '<span class="f16-stage__date">今天 ' + esc(fmt.date(D.today)) + '</span>'
      + '</div>'
      + (opts.title
        ? '<div><div class="f16-stage__title">' + esc(opts.title) + '</div>'
          + (opts.lead ? '<p class="f16-stage__lead">' + esc(opts.lead) + '</p>' : '') + '</div>'
        : '')
      + '<div class="f16-stage__body">' + (opts.body || '') + '</div>'
      + '</div>';
  }

  function seg(items, active) {
    return '<div class="f16-seg">' + items.map(function (it) {
      return '<span class="' + (it === active ? 'is-active' : '') + '" data-seg="' + esc(it) + '">' + esc(it) + '</span>';
    }).join('') + '</div>';
  }

  function tile(o) {
    return '<div class="f16-tile' + (o.kind ? ' f16-tile--' + o.kind : '') + (o.className ? ' ' + o.className : '') + '">'
      + '<div class="f16-tile__label">' + esc(o.label) + '</div>'
      + '<div class="f16-tile__value">' + o.value + '</div>'
      + (o.hint ? '<div class="f16-tile__hint">' + esc(o.hint) + '</div>' : '')
      + '</div>';
  }
  function numTile(o) {
    return tile({
      label: o.label,
      kind: o.kind,
      hint: o.hint,
      className: o.className,
      value: '<span id="' + esc(o.id) + '">' + esc(o.text) + '</span>' + (o.unit ? '<small>' + esc(o.unit) + '</small>' : '') + (o.suffix || '')
    });
  }

  function card(title, body, opts) {
    opts = opts || {};
    return '<div class="f16-card' + (opts.dark ? ' f16-card--dark' : '') + '"' + (opts.id ? ' id="' + esc(opts.id) + '"' : '') + '>'
      + (title ? '<div class="f16-card__title">' + (opts.icon ? icon(opts.icon, { size: 20 }) : '') + esc(title) + (opts.tail || '') + '</div>' : '')
      + body + '</div>';
  }

  function kv(items) {
    return '<div class="f16-kv">' + items.map(function (it) {
      return '<div><span>' + esc(it.label) + '</span><b>' + it.value + '</b></div>';
    }).join('') + '</div>';
  }

  function note(text) {
    return '<p class="f16-note">' + icon('info', { size: 18 }) + esc(text) + '</p>';
  }

  function expiring(side, days) {
    return D.leaseExpiring(days, side).sort(function (a, b) {
      var ea = side === 'upstream' ? a.upstream.end : a.downstream.end;
      var eb = side === 'upstream' ? b.upstream.end : b.downstream.end;
      return ea < eb ? -1 : 1;
    });
  }

  /* ------------------------------------------------------------------ 步驟 */
  var steps = [
    /* 1 ---------------------------------------------------------------- */
    {
      title: '早上打開儀表板',
      text: '早上八點打開系統，' + S.totalUnits + ' 間房的狀況就在同一頁，不用再問任何人。',
      render: function (stage, api) {
        var items = [
          { icon: 'wallet', name: '本月包租淨利', desc: '收入扣掉付屋主租金與所有成本，真正進口袋的錢' },
          { icon: 'chart', name: '十三項營運指標', desc: '出租率、續租率、欠租率、修繕費率一次看完' },
          { icon: 'calendar', name: '租約到期 30／60／90 天', desc: '屋主租約與租客租約分開算，先談續約' },
          { icon: 'trend', name: '未來六個月現金流', desc: '依目前租約往前推，收入、支出與淨額' }
        ];
        stage.innerHTML = shell({
          title: '老闆營運儀表板',
          lead: '一頁看完出租、欠租、修繕與現金流',
          body: seg(['全部'].concat(REGION_NAMES), '全部')
            + '<div class="f16-grid f16-grid--2">' + items.map(function (it) {
              return card(it.name, '<p class="f16-stage__lead">' + esc(it.desc) + '</p>', { icon: it.icon });
            }).join('') + '</div>'
            + note('切換上面的區域，下面所有數字都會跟著換')
        });
        api.enter('.f16-seg');
      },
      after: function (stage, api) {
        return api.enter('.f16-card').then(function () { return api.cursor(0.12, 0.28); });
      }
    },

    /* 2 ---------------------------------------------------------------- */
    {
      title: '淨利自己算出來',
      text: '收入扣掉付屋主租金、水電、修繕與折舊，本月真正賺到 ' + fmt.money(S.netProfit) + '。',
      render: function (stage, api) {
        var hero = card('', '<div class="f16-tile__label" style="color:var(--ink-2-on-dark)">本月包租淨利 · ' + esc(fmt.month(S.month)) + '</div>'
          + '<div class="f16-hero-value"><span class="f16-hero__unit">NT$</span><span id="s2-net">0</span></div>'
          + kv([
            { label: '租金收入', value: '<span id="s2-income">0</span> 元' },
            { label: '付屋主租金', value: esc(fmt.num(S.ownerRent)) + ' 元' },
            { label: '其他成本', value: esc(fmt.num(OTHER_COST)) + ' 元' }
          ]), { dark: true, id: 's2-hero' });

        var mix = card('出租狀況', '<div id="s2-donut"></div>'
          + kv([
            { label: '出租中', value: esc(fmt.num(S.rented)) + ' 間' },
            { label: '空房與整備', value: esc(fmt.num(S.vacant)) + ' 間' }
          ]), { icon: 'pie' });

        stage.innerHTML = shell({
          title: '本月結果',
          body: '<div class="f16-grid f16-grid--hero">' + hero + mix + '</div>'
            + note('這一個數字，是 ' + S.totalUnits + ' 間房逐間算完再加起來的')
        });

        A.charts.donut(stage.querySelector('#s2-donut'), {
          size: 168, thickness: 20,
          centerValue: fmt.num(S.occupancy, 1) + '%', centerLabel: '出租率', legend: false,
          data: [
            { label: '出租中', value: S.rented, color: 'var(--ok)' },
            { label: '空房與整備', value: S.vacant, color: 'var(--warn)' }
          ]
        });
        api.enter('.f16-card');
      },
      after: function (stage, api) {
        api.count('#s2-income', 0, S.income, 1200);
        return api.count('#s2-net', 0, S.netProfit, 1400);
      }
    },

    /* 3 ---------------------------------------------------------------- */
    {
      title: '十三項指標一次看',
      text: '出租率、續租率、欠租率、修繕費率排在一起，哪裡鬆掉一眼看得出來。',
      render: function (stage, api) {
        var tiles = [
          tile({
            className: 'f16-tile--dark f16-tile--wide',
            label: '本月包租淨利',
            value: esc(fmt.money(S.netProfit, 'NT$')),
            hint: '收入 ' + fmt.money(S.income) + '　成本 ' + fmt.money(TOTAL_COST)
          }),
          numTile({ id: 's3-units', label: '物件數', text: fmt.num(S.totalUnits), unit: '間' }),
          numTile({ id: 's3-occ', label: '出租率', text: '0', suffix: '%', kind: 'ok' }),
          numTile({ id: 's3-vac', label: '空置率', text: fmt.num(S.vacancyRate), suffix: '%' }),
          numTile({ id: 's3-vd', label: '平均空置天數', text: fmt.num(S.avgVacantDays), unit: '天' }),
          numTile({ id: 's3-in', label: '本月新增戶數', text: fmt.num(S.newMoveIn), unit: '戶' }),
          numTile({ id: 's3-out', label: '本月退租戶數', text: fmt.num(S.moveOut), unit: '戶' }),
          numTile({ id: 's3-renew', label: '續租率', text: fmt.num(S.renewalRate), suffix: '%', kind: 'ok' }),
          numTile({ id: 's3-arr', label: '欠租率', text: '0', suffix: '%' }),
          numTile({ id: 's3-arrd', label: '平均欠租天數', text: fmt.num(S.arrearsAvgDays), unit: '天' }),
          numTile({ id: 's3-rep', label: '修繕費率', text: fmt.num(S.repairRate), suffix: '%' }),
          numTile({ id: 's3-repu', label: '每戶平均修繕費', text: fmt.num(S.repairPerUnit), unit: '元' }),
          numTile({ id: 's3-gross', label: '包租毛利', text: fmt.num(S.grossProfit), unit: '元' })
        ];
        stage.innerHTML = shell({
          title: '本月營運指標',
          lead: '包租淨利加上下面 12 項，共 13 項，全部依 ' + S.totalUnits + ' 間房的實際紀錄算出來',
          body: '<div class="f16-grid f16-grid--4">' + tiles.join('') + '</div>'
        });
      },
      after: function (stage, api) {
        api.enter('.f16-tile');
        api.count('#s3-occ', 0, S.occupancy, 1100);
        return api.count('#s3-arr', 0, S.arrearsRate, 1100).then(function () {
          return api.highlight('#s3-occ');
        });
      }
    },

    /* 4 ---------------------------------------------------------------- */
    {
      title: '租約到期先看見',
      text: '未來 30 天有 ' + S.expiring30 + ' 份租客租約到期，先找續約，不用等到空房才處理。',
      render: function (stage, api) {
        var rows = expiring('downstream', 30).slice(0, 3);
        var table = '<table class="f16-mini-table"><thead><tr>'
          + '<th>物件</th><th>租客</th><th>到期日</th><th class="num">剩餘天數</th><th class="num">月租</th>'
          + '</tr></thead><tbody>' + rows.map(function (u, i) {
            var t = D.tenantOf(u.id);
            var left = A.daysBetween(D.today, u.downstream.end);
            return '<tr' + (i === 0 ? ' class="is-active"' : '') + '><td>' + esc(u.id) + '</td>'
              + '<td>' + esc(t ? t.name : '—') + '</td>'
              + '<td>' + esc(fmt.date(u.downstream.end)) + '</td>'
              + '<td class="num">' + esc(fmt.num(left)) + ' 天</td>'
              + '<td class="num">' + esc(fmt.money(u.rent)) + '</td></tr>';
          }).join('') + '</tbody></table>';

        stage.innerHTML = shell({
          title: '租約到期',
          body: seg(['下游（租客）', '上游（屋主）'], '下游（租客）')
            + '<div class="f16-grid f16-grid--3">'
            + numTile({ id: 's4-30', label: '30 天內到期', text: '0', unit: '份', kind: 'danger' })
            + numTile({ id: 's4-60', label: '60 天內到期', text: '0', unit: '份', kind: 'warn' })
            + numTile({ id: 's4-90', label: '90 天內到期', text: '0', unit: '份' })
            + '</div>'
            + card('最快到期的三份租客租約', table, { icon: 'calendar' })
            + note('屋主租約 90 天內只有 ' + S.upstreamExpiring90 + ' 份：' + expiring('upstream', 90).map(function (u) { return u.id; }).join('、'))
        });
        api.enter('.f16-tile');
      },
      after: function (stage, api) {
        api.count('#s4-60', 0, S.expiring60, 900);
        api.count('#s4-90', 0, S.expiring90, 900);
        return api.count('#s4-30', 0, S.expiring30, 900).then(function () {
          return api.highlight('#s4-30');
        });
      }
    },

    /* 5 ---------------------------------------------------------------- */
    {
      title: '現金流往前看半年',
      text: '依目前租約往前推六個月，收入、支出與淨額都畫出來，錢夠不夠先知道。',
      render: function (stage, api) {
        var cf = S.cashflow;
        var lowest = cf.slice().sort(function (a, b) { return a.net - b.net; })[0];
        stage.innerHTML = shell({
          title: '未來六個月現金流',
          body: card('收入、支出與淨額', '<div id="s5-chart"></div>'
            + kv([
              { label: '六個月收入', value: esc(fmt.money(cf.reduce(function (t, r) { return t + r.income; }, 0))) },
              { label: '六個月支出', value: esc(fmt.money(cf.reduce(function (t, r) { return t + r.cost; }, 0))) },
              { label: '六個月淨額', value: esc(fmt.money(cf.reduce(function (t, r) { return t + r.net; }, 0))) },
              { label: '最低的一個月', value: esc(fmt.month(lowest.month)) }
            ]), { icon: 'trend', id: 's5-card' })
            + note('滑過線上的點，會顯示那個月的收入、支出與淨額')
        });
        A.charts.line(stage.querySelector('#s5-chart'), {
          height: 196,
          labels: cf.map(function (r) { return fmt.month(r.month); }),
          valueFormat: function (v) { return fmt.money(v); },
          series: [
            { name: '收入', data: cf.map(function (r) { return r.income; }), color: 'var(--accent)' },
            { name: '支出', data: cf.map(function (r) { return r.cost; }), color: 'var(--danger)' },
            { name: '淨額', data: cf.map(function (r) { return r.net; }), color: 'var(--ok)', area: true }
          ]
        });
        api.enter('#s5-card');
      },
      after: function (stage, api) {
        return api.cursor(0.62, 0.55).then(function () { return api.highlight('.f16-kv'); });
      }
    },

    /* 6 ---------------------------------------------------------------- */
    {
      title: '切到中壢比一比',
      text: '點一下區域，全部數字跟著換。中壢 ' + ZL.count + ' 間，本月淨利 ' + fmt.money(ZL.net) + '。',
      render: function (stage, api) {
        stage.innerHTML = shell({
          title: '四區比一比',
          body: seg(['全部'].concat(REGION_NAMES), '中壢')
            + '<div class="f16-grid f16-grid--4">'
            + numTile({ id: 's6-units', label: '物件數', text: fmt.num(ALL.count), unit: '間' })
            + numTile({ id: 's6-occ', label: '出租率', text: fmt.num(S.occupancy), suffix: '%' })
            + numTile({ id: 's6-income', label: '本月收入', text: fmt.num(ALL.income), unit: '元' })
            + numTile({ id: 's6-net', label: '本月淨利', text: fmt.num(ALL.net), unit: '元', kind: 'ok' })
            + '</div>'
            + card('各區本月淨利', '<div id="s6-chart"></div>', { icon: 'chart', id: 's6-card' })
        });
        A.charts.bar(stage.querySelector('#s6-chart'), {
          height: 190,
          labels: REGION_NAMES,
          valueFormat: function (v) { return fmt.money(v); },
          colorOf: function (v, i) { return REGION_NAMES[i] === '中壢' ? 'var(--accent)' : 'var(--line)'; },
          series: [{ name: '本月淨利', data: REGION_NAMES.map(function (r) { return REGION[r].net; }) }],
          legend: false,
          showValues: true
        });
        api.enter('.f16-card');
      },
      after: function (stage, api) {
        var tab = stage.querySelector('[data-seg="中壢"]');
        return api.cursor(tab).then(function () {
          api.count('#s6-units', ALL.count, ZL.count, 700);
          api.count('#s6-occ', S.occupancy, ZL_OCC, 700);
          api.count('#s6-income', ALL.income, ZL.income, 900);
          return api.count('#s6-net', ALL.net, ZL.net, 900);
        });
      }
    },

    /* 7 ---------------------------------------------------------------- */
    {
      title: '要盯的事全部歸零',
      text: '四件事各自指派給負責人，待處理歸零，回報進來時老闆再看一次就好。',
      render: function (stage, api) {
        var rows = WATCH.map(function (w, i) {
          return '<div class="f16-row" id="s7-' + (i + 1) + '">'
            + '<span class="f16-row__name">' + esc(w.name) + '</span>'
            + '<span class="f16-row__text">' + esc(w.text) + '</span>'
            + '<span class="f16-row__tail"><span class="badge badge--neutral" id="s7-b' + (i + 1) + '">待指派</span></span>'
            + '</div>';
        }).join('');

        stage.innerHTML = shell({
          title: '今天要盯的事',
          lead: '系統從 ' + S.totalUnits + ' 間物件裡挑出需要老闆決定的幾件',
          body: card('待處理清單', rows, {
            icon: 'flag',
            id: 's7-card',
            tail: '<span class="badge badge--danger" id="s7-badge">待處理 <b id="s7-left">' + WATCH.length + '</b> 件</span>'
          })
            + note('指派後會進到負責人的待辦清單，處理完自動回報到這一頁')
        });
        api.enter('.f16-row');
      },
      after: function (stage, api) {
        var p = api.wait(250);
        WATCH.forEach(function (w, i) {
          p = p.then(function () {
            return api.check('#s7-' + (i + 1)).then(function () {
              return api.badge('#s7-b' + (i + 1), '已指派給 ' + who(w.to), 'ok');
            });
          });
        });
        return p.then(function () {
          return api.count('#s7-left', WATCH.length, 0, 700);
        }).then(function () {
          return api.badge('#s7-badge', '今天沒有待盯的事', 'ok');
        });
      }
    }
  ];

  /* ------------------------------------------------------------------ 掛載 */
  var start = 0;
  var autoplay = true;
  var hash = /(?:^|[#&])step=(last|\d+)/.exec(window.location.hash || '');
  if (hash) {
    start = hash[1] === 'last' ? steps.length - 1 : Math.max(0, Math.min(steps.length - 1, (+hash[1] || 1) - 1));
    autoplay = false;                       /* 指定步驟時不自動播放，停在那一步 */
  }

  TP.mount(document.getElementById('player'), {
    feature: 'f16',
    autoplayMs: 5200,
    start: start,
    autoplay: autoplay,
    steps: steps
  });
})();
