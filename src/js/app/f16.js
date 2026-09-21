/* f16.js — 老闆營運儀表板（進系統操作頁）
 * 契約：docs/DESIGN.md §3（App.* 元件）、§5（DB 假資料）、§6（文案）、§6.1（只改自己的檔）。
 * 只讀 DB，不改 data.js / common.js / main.css。基礎層沒有的資料寫在 EXTRA。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D) return;

  var esc = A.esc;
  var icon = A.icon;
  var fmt = A.fmt;

  var ALL = '全部';
  var MONTH = D.currentMonth;                        /* 2026-09 */
  var PREV = D.months[D.months.length - 2];          /* 2026-08 */
  var MASK = '<span class="f16-masked">••••</span>';

  /* ------------------------------------------------------------------ 基礎層沒有的資料 */
  var EXTRA = {
    /* 基礎層只有全公司合計（本月入住 6 戶、退租 4 戶），這裡按區域拆開，合計仍是 6 / 4 */
    moves: {
      '中壢': { moveIn: 3, moveOut: 2 },
      '內壢': { moveIn: 1, moveOut: 1 },
      '平鎮': { moveIn: 1, moveOut: 0 },
      '中原': { moveIn: 1, moveOut: 1 }
    },
    /* 本月到期租約的續租結果，合計 35 / 40 ＝ 87.5%，與 DB.stats.renewalRate 一致 */
    renewal: {
      '中壢': { renewed: 14, due: 16 },
      '內壢': { renewed: 8, due: 9 },
      '平鎮': { renewed: 7, due: 8 },
      '中原': { renewed: 6, due: 7 }
    },
    /* 指派警示時可選的負責人（老闆自己不列入） */
    assignees: ['S02', 'S03', 'S04', 'S05'],
    /* 每一種警示預設建議交給誰 */
    suggest: { risk: 'S02', vacancy: 'S03', loss: 'S04', arrears: 'S04' }
  };

  var state = {
    region: ALL,
    side: 'downstream',
    window: 30,
    assigned: {}                                     /* 警示 id → 負責人 staffId（重新整理即歸零） */
  };

  /* ------------------------------------------------------------------ 小工具 */
  function regionsOf(region) { return region === ALL ? D.company.regions : [region]; }
  function unitsOf(region) {
    return region === ALL ? D.units.slice() : D.units.filter(function (u) { return u.region === region; });
  }
  function inRegion(u) { return !!u && (state.region === ALL || u.region === state.region); }
  function isRented(u) { return u.status === 'rented' || u.status === 'leaving'; }
  function isVacant(u) { return u.status === 'listing' || u.status === 'prep'; }
  function addMonth(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1);
  }
  function endOf(u, side) { return side === 'upstream' ? u.upstream.end : u.downstream.end; }
  function daysLeft(iso) { return A.daysBetween(D.today, iso); }
  function canPnl() {
    var allow = (D.permissions && D.permissions.pnl) || ['boss'];
    return allow.indexOf(A.role) >= 0;
  }
  /* fmt.pct 會把「小於 1」的值當成比例再乘 100（0.7 → 70%），百分點數字自己組 */
  function pct(v) { return (typeof v === 'number' && isFinite(v)) ? fmt.num(v, 1) + '%' : '—'; }
  function pnlMoney(n, unit) { return canPnl() ? esc(fmt.money(n, unit)) : MASK; }
  function rentMoney(n) { return A.can(A.role, 'rent') ? esc(fmt.money(n)) : MASK; }

  /* ------------------------------------------------------------------ 彙總（依區域重算） */
  function sumPnl(units, month) {
    var t = { income: 0, ownerRent: 0, repair: 0, net: 0, cost: 0 };
    units.forEach(function (u) {
      var p = D.pnlOf(u.id, month);
      if (!p) return;
      t.income += p.rentIncome; t.ownerRent += p.ownerRent; t.repair += p.repair;
      t.net += p.net; t.cost += p.cost;
    });
    Object.keys(t).forEach(function (k) { t[k] = Math.round(t[k]); });
    return t;
  }

  function statsFor(region) {
    var units = unitsOf(region);
    var rented = units.filter(isRented);
    var vacant = units.filter(isVacant);
    var vacantDays = vacant.map(function (u) { return u.vacantDays || 0; })
      .concat(units.filter(function (u) { return u.pastVacantDays; }).map(function (u) { return u.pastVacantDays; }));
    var now = sumPnl(units, MONTH);
    var prev = sumPnl(units, PREV);
    var arrears = D.tenants.filter(function (t) {
      var u = D.unit(t.unitId);
      return t.arrearsDays > 0 && u && (region === ALL || u.region === region);
    });
    var moveIn = 0, moveOut = 0, renewed = 0, due = 0;
    regionsOf(region).forEach(function (r) {
      var m = EXTRA.moves[r] || { moveIn: 0, moveOut: 0 };
      var n = EXTRA.renewal[r] || { renewed: 0, due: 0 };
      moveIn += m.moveIn; moveOut += m.moveOut; renewed += n.renewed; due += n.due;
    });
    var arrearsDays = arrears.length
      ? Math.round(arrears.reduce(function (s, t) { return s + t.arrearsDays; }, 0) / arrears.length) : 0;

    return {
      region: region,
      units: units,
      count: units.length,
      rented: rented.length,
      vacant: vacant.length,
      listing: units.filter(function (u) { return u.status === 'listing'; }).length,
      prep: units.filter(function (u) { return u.status === 'prep'; }).length,
      leaving: units.filter(function (u) { return u.status === 'leaving'; }).length,
      occupancy: +(rented.length / units.length * 100).toFixed(1),
      vacancyRate: +(vacant.length / units.length * 100).toFixed(1),
      avgVacantDays: vacantDays.length
        ? Math.round(vacantDays.reduce(function (s, d) { return s + d; }, 0) / vacantDays.length) : 0,
      moveIn: moveIn,
      moveOut: moveOut,
      renewed: renewed,
      renewalDue: due,
      renewalRate: due ? +(renewed / due * 100).toFixed(1) : 0,
      arrearsCount: arrears.length,
      arrearsRate: rented.length ? +(arrears.length / rented.length * 100).toFixed(1) : 0,
      arrearsDays: arrearsDays,
      arrearsAmount: arrears.reduce(function (s, t) { return s + t.arrearsAmount; }, 0),
      income: now.income,
      ownerRent: now.ownerRent,
      otherCost: now.cost - now.ownerRent,
      cost: now.cost,
      gross: now.income - now.ownerRent,
      net: now.net,
      repair: now.repair,
      repairRate: now.income ? +(now.repair / now.income * 100).toFixed(1) : 0,
      repairPerUnit: Math.round(now.repair / units.length),
      netDelta: now.net - prev.net,
      repairDelta: now.repair - prev.repair,
      expiring: {
        downstream: [30, 60, 90].map(function (d) { return expiringList(units, 'downstream', d).length; }),
        upstream: [30, 60, 90].map(function (d) { return expiringList(units, 'upstream', d).length; })
      }
    };
  }

  function expiringList(units, side, days) {
    return units.filter(function (u) {
      var d = daysLeft(endOf(u, side));
      return d >= 0 && d <= days;
    }).sort(function (a, b) { return endOf(a, side) < endOf(b, side) ? -1 : 1; });
  }

  /* 未來 6 個月現金流：與 DB.stats.cashflow 同一組公式，改成可依區域重算 */
  function cashflowFor(region) {
    var units = unitsOf(region);
    var base = sumPnl(units, MONTH);
    var cost0 = base.income - base.net;
    var out = [];
    for (var i = 0; i < 6; i++) {
      var m = addMonth(MONTH, i);
      var expiring = units.filter(function (u) { return u.downstream.end.slice(0, 7) === m; }).length;
      var seasonal = 1 - (i * 0.012) - (expiring * 0.004);
      var income = Math.round(base.income * seasonal);
      var cost = Math.round(cost0 * (1 - i * 0.006));
      out.push({ month: m, income: income, cost: cost, net: income - cost, expiring: expiring, forecast: i > 0 });
    }
    return out;
  }

  /* ------------------------------------------------------------------ 今天要盯的事 */
  function watchItems() {
    var items = [];
    var risk = D.riskUnits().filter(function (r) { return inRegion(r.unit); });
    if (risk.length) {
      items.push({
        id: 'risk', severity: 'danger', icon: 'building',
        title: '屋主租約先到期 ' + risk.length + ' 間',
        text: '最快的是 ' + risk[0].unit.id + '：屋主租約 ' + fmt.date(risk[0].upEnd) + ' 到期，房客卻住到 '
          + fmt.date(risk[0].downEnd) + '，剩 ' + risk[0].daysToUpEnd + ' 天可以談續約',
        units: risk.map(function (r) { return r.unit.id; })
      });
    }
    var longVacant = unitsOf(state.region).filter(function (u) { return isVacant(u) && (u.vacantDays || 0) > 14; })
      .sort(function (a, b) { return b.vacantDays - a.vacantDays; });
    if (longVacant.length) {
      items.push({
        id: 'vacancy', severity: 'warn', icon: 'door',
        title: '空房超過 14 天 ' + longVacant.length + ' 間',
        text: longVacant[0].id + ' 已空 ' + longVacant[0].vacantDays + ' 天，空著也要付屋主租金，建議檢視租金與刊登照片',
        units: longVacant.map(function (u) { return u.id; })
      });
    }
    var loss = unitsOf(state.region).filter(function (u) { return D.pnlOf(u.id).net < 0; })
      .sort(function (a, b) { return D.pnlOf(a.id).net - D.pnlOf(b.id).net; });
    if (loss.length) {
      var withTenant = loss.filter(function (u) { return isRented(u); });
      items.push({
        id: 'loss', severity: 'warn', icon: 'trend-down',
        title: '本月淨利為負 ' + loss.length + ' 間',
        text: withTenant.length + ' 間有租客（多半是修繕吃掉利潤），' + (loss.length - withTenant.length)
          + ' 間是空房或整備中，最虧的是 ' + loss[0].id,
        units: loss.slice(0, 6).map(function (u) { return u.id; })
      });
    }
    var arrears = D.tenants.filter(function (t) { return t.arrearsDays > 0 && inRegion(D.unit(t.unitId)); })
      .sort(function (a, b) { return b.arrearsDays - a.arrearsDays; });
    if (arrears.length) {
      items.push({
        id: 'arrears', severity: 'danger', icon: 'wallet',
        title: '欠租 ' + arrears.length + ' 戶',
        text: arrears[0].unitId + ' ' + arrears[0].name + ' 欠 ' + arrears[0].arrearsDays + ' 天、'
          + fmt.money(arrears[0].arrearsAmount) + '，合計待收 ' + fmt.money(arrears.reduce(function (s, t) { return s + t.arrearsAmount; }, 0)),
        units: arrears.map(function (t) { return t.unitId; })
      });
    }
    return items;
  }

  function staffName(id) { var s = D.staffById(id); return s ? s.name : ''; }
  function staffLabel(id) { var s = D.staffById(id); return s ? s.name + '（' + s.roleName + '）' : ''; }

  /* ------------------------------------------------------------------ 渲染：工具列 */
  function segmentedHTML(items, active, attr, label) {
    return '<div class="segmented" role="tablist"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '>' + items.map(function (it) {
      var on = String(it.id) === String(active);
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '"'
        + ' data-tab="' + esc(it.id) + '" ' + attr + '="' + esc(it.id) + '"><span>' + esc(it.label) + '</span></button>';
    }).join('') + '</div>';
  }

  function renderToolbar() {
    var regions = [{ id: ALL, label: '全部' }].concat(D.company.regions.map(function (r) { return { id: r, label: r }; }));
    document.getElementById('f16-regions').innerHTML = segmentedHTML(regions, state.region, 'data-region', '看哪一區');
    document.getElementById('f16-expiry-side').innerHTML = segmentedHTML(
      [{ id: 'downstream', label: '下游（租客）' }, { id: 'upstream', label: '上游（屋主）' }], state.side, 'data-side', '看哪一份租約');
  }

  function renderMeta(s) {
    document.getElementById('f16-meta').innerHTML =
      '資料月份 ' + esc(fmt.month(MONTH)) + '　今天 ' + esc(fmt.date(D.today)) + '　' + esc(fmt.num(s.count)) + ' 間物件';
  }

  function renderRoleNote() {
    var host = document.getElementById('f16-role-note');
    host.innerHTML = canPnl() ? '' : A.alert(
      '收入、成本與淨利只有老闆看得到，其餘指標照常顯示。切回老闆視角就會回來。',
      'accent', { title: '目前是「' + A.roleName() + '」視角', icon: 'lock', className: 'mb-24' });
  }

  /* ------------------------------------------------------------------ 渲染：本月結果 */
  function renderResult(s) {
    var sentence = '<p class="f16-sentence"><strong>' + esc(s.region === ALL ? '全部四區' : s.region) + ' ' + esc(fmt.num(s.count))
      + ' 間</strong>，本月收入 <strong>' + (canPnl() ? esc(fmt.money(s.income)) : MASK)
      + '</strong>、總成本 <strong>' + (canPnl() ? esc(fmt.money(s.cost)) : MASK)
      + '</strong>、淨利 <strong>' + (canPnl() ? esc(fmt.money(s.net)) : MASK) + '</strong>。</p>';

    var delta = s.netDelta >= 0 ? '+' + fmt.num(s.netDelta) : fmt.num(s.netDelta);
    var hero = '<div class="card card--dark card--static f16-hero">'
      + '<div class="f16-hero__label">' + icon('wallet') + '本月包租淨利 · ' + esc(fmt.month(MONTH)) + '</div>'
      + '<div class="f16-hero__value" id="f16-net">'
      + (canPnl() ? '<span class="f16-hero__unit">NT$</span>' + esc(fmt.num(s.net)) : MASK) + '</div>'
      + (canPnl()
        ? '<div class="kpi-delta kpi-delta--' + (s.netDelta >= 0 ? 'up' : 'down') + '">'
          + icon(s.netDelta >= 0 ? 'arrow-up-right' : 'arrow-down-right') + esc(delta) + ' 元 <span class="muted-2">較上月</span></div>'
        : '')
      + '<div class="f16-hero__breakdown">' + A.statRow([
        { label: '租金收入', html: pnlMoney(s.income) },
        { label: '付屋主租金', html: pnlMoney(s.ownerRent) },
        { label: '其他成本', html: pnlMoney(s.otherCost) }
      ], { sm: true }) + '</div>'
      + sentence
      + '</div>';

    var mix = '<div class="card card--static">'
      + '<div class="card-head"><div><h3 class="card-title">' + icon('pie') + '出租狀況</h3>'
      + '<p class="card-sub">出租率 ' + esc(pct(s.occupancy)) + '，空置率 ' + esc(pct(s.vacancyRate)) + '</p></div></div>'
      + '<div class="f16-mix"><div id="f16-mix-chart"></div>'
      + A.statRow([
        { label: '即將空房', value: s.leaving + ' 間' },
        { label: '整備中', value: s.prep + ' 間' },
        { label: '招租中', value: s.listing + ' 間' }
      ], { sm: true }) + '</div></div>';

    document.getElementById('f16-result').innerHTML = hero + mix;

    A.charts.donut('#f16-mix-chart', {
      size: 176, thickness: 20,
      centerValue: pct(s.occupancy), centerLabel: '出租率',
      valueFormat: function (v) { return fmt.num(v) + ' 間'; },
      data: [
        { label: '出租中', value: s.rented, color: 'var(--ok)' },
        { label: '空房與整備', value: s.vacant, color: 'var(--warn)' }
      ]
    });
  }

  /* ------------------------------------------------------------------ 渲染：13 項指標 */
  function renderKpis(s) {
    var cards = [
      A.kpi({ label: '物件數', value: fmt.num(s.count), unit: '間', icon: 'building', hint: '出租中 ' + s.rented + ' 間、空房 ' + s.vacant + ' 間' }),
      A.kpi({ label: '出租率', value: pct(s.occupancy), icon: 'check-circle', kind: s.occupancy >= 95 ? 'ok' : null, hint: '滿租為 100%' }),
      A.kpi({ label: '空置率', value: pct(s.vacancyRate), icon: 'door', kind: s.vacancyRate >= 5 ? 'warn' : null, hint: '空房與整備中 ' + s.vacant + ' 間' }),
      A.kpi({ label: '平均空置天數', value: fmt.num(s.avgVacantDays), unit: '天', icon: 'clock', kind: s.avgVacantDays >= 20 ? 'warn' : null, hint: '含本月已完成的退租整備' }),
      A.kpi({ label: '本月新增戶數', value: fmt.num(s.moveIn), unit: '戶', icon: 'user-check', hint: '新簽約入住' }),
      A.kpi({ label: '本月退租戶數', value: fmt.num(s.moveOut), unit: '戶', icon: 'logout', hint: '已點交或已通知不續租' }),
      A.kpi({ label: '續租率', value: pct(s.renewalRate), icon: 'refresh', kind: s.renewalRate >= 85 ? 'ok' : null, hint: '本月到期 ' + s.renewalDue + ' 份，續租 ' + s.renewed + ' 份' }),
      A.kpi({ label: '欠租率', value: pct(s.arrearsRate), icon: 'alert-circle', kind: s.arrearsRate >= 3 ? 'warn' : null, hint: s.arrearsCount ? '欠租 ' + s.arrearsCount + ' 戶、' + fmt.money(s.arrearsAmount) : '本月全部收齊' }),
      A.kpi({ label: '平均欠租天數', value: fmt.num(s.arrearsDays), unit: '天', icon: 'history', kind: s.arrearsDays >= 10 ? 'warn' : null, hint: s.arrearsCount ? '從應繳日起算' : '沒有欠租戶' }),
      A.kpi({ label: '修繕費率', value: pct(s.repairRate), icon: 'wrench', kind: s.repairRate >= 6 ? 'warn' : null, hint: '本月修繕 ' + fmt.money(s.repair) + '，' + (s.repairDelta >= 0 ? '較上月多 ' + fmt.money(s.repairDelta) : '較上月少 ' + fmt.money(-s.repairDelta)) }),
      A.kpi({ label: '每戶平均修繕費', valueHtml: esc(fmt.money(s.repairPerUnit)), icon: 'receipt', hint: '修繕總額除以 ' + s.count + ' 間' }),
      A.kpi({ label: '包租毛利', valueHtml: pnlMoney(s.gross), icon: 'dollar', hint: '租金收入扣掉付屋主租金' })
    ];
    document.getElementById('f16-kpis').innerHTML = cards.join('');
  }

  /* ------------------------------------------------------------------ 渲染：今天要盯的事 */
  function renderWatch() {
    var items = watchItems();
    var pending = items.filter(function (it) { return !state.assigned[it.id]; });
    var done = items.filter(function (it) { return state.assigned[it.id]; });
    var host = document.getElementById('f16-watch');

    document.getElementById('f16-watch-count').innerHTML = pending.length
      ? A.badge('待處理 ' + pending.length + ' 件', 'danger', { lg: true })
      : A.badge('已全部指派', 'ok', { lg: true, icon: 'check' });

    var html = '';
    if (!pending.length) {
      html += A.emptyState({
        icon: 'check-circle',
        title: items.length ? '今天沒有要盯的事' : '這一區今天一切正常',
        text: items.length
          ? items.length + ' 件都指派出去了，負責人回報後系統會通知你。'
          : '這一區沒有到期風險、長期空房、虧損或欠租，維持現況就好。'
      });
    } else {
      html += '<div class="f16-watch">' + pending.map(watchItemHTML).join('') + '</div>';
    }
    if (done.length) {
      html += '<p class="muted small mt-24 mb-8">已指派 ' + done.length + ' 件</p>'
        + '<div class="f16-watch">' + done.map(watchItemHTML).join('') + '</div>';
    }
    host.innerHTML = html;
  }

  function watchItemHTML(it) {
    var who = state.assigned[it.id];
    var badge = who ? A.badge('已指派給 ' + staffName(who), 'ok', { icon: 'check' })
      : A.badge(it.severity === 'danger' ? '要先處理' : '要注意', it.severity, { dot: true });
    return '<div class="f16-watch__item' + (who ? ' is-done' : '') + '" data-watch-item="' + esc(it.id) + '">'
      + '<span class="icon-circle icon-circle--' + (who ? 'ok' : it.severity) + '">' + icon(who ? 'check' : it.icon) + '</span>'
      + '<div class="f16-watch__body">'
      + '<div class="f16-watch__title">' + esc(it.title) + badge + '</div>'
      + '<p class="f16-watch__text">' + esc(it.text) + '</p>'
      + '<div class="f16-watch__units">' + it.units.map(function (id) {
        return '<span class="f16-watch__unit">' + esc(id) + '</span>';
      }).join('') + '</div>'
      + '</div>'
      + '<div class="f16-watch__action">'
      + (who
        ? '<button type="button" class="btn btn--ghost btn--sm" data-watch="' + esc(it.id) + '">改指派</button>'
        : '<button type="button" class="btn btn--secondary btn--sm" data-watch="' + esc(it.id) + '">指派負責人</button>')
      + '</div></div>';
  }

  function openAssign(id) {
    var it = null;
    watchItems().forEach(function (x) { if (x.id === id) it = x; });
    if (!it) return;
    var current = state.assigned[id] || EXTRA.suggest[id] || EXTRA.assignees[0];
    var options = EXTRA.assignees.map(function (sid) {
      return '<option value="' + esc(sid) + '"' + (sid === current ? ' selected' : '') + '>' + esc(staffLabel(sid)) + '</option>';
    }).join('');

    A.modal({
      title: '指派：' + it.title,
      size: 'sm',
      body: '<p class="muted">' + esc(it.text) + '</p>'
        + '<div class="field"><label for="f16-assign-to">交給誰</label>'
        + '<select class="select" id="f16-assign-to">' + options + '</select>'
        + '<p class="field-hint">指派後會出現在對方的待辦清單，處理完會回報到這裡。</p></div>',
      actions: [
        { label: '取消', kind: 'ghost' },
        {
          label: '指派',
          kind: 'primary',
          onClick: function (close, btn) {
            /* 從這個對話框裡面找，避免上一個對話框關閉動畫期間還在 DOM 造成抓錯 */
            var box = btn && btn.closest ? btn.closest('.modal') : null;
            var sel = box ? box.querySelector('select') : document.getElementById('f16-assign-to');
            var sid = sel ? sel.value : current;
            state.assigned[id] = sid;
            renderWatch();
            var left = watchItems().filter(function (x) { return !state.assigned[x.id]; }).length;
            A.toast('已指派給 ' + staffName(sid), 'ok', { sub: left ? '還有 ' + left + ' 件要盯' : '今天要盯的事都處理完了' });
          }
        }
      ]
    });
  }

  /* ------------------------------------------------------------------ 渲染：租約到期 */
  function renderExpiry(s) {
    var counts = s.expiring[state.side];
    var labels = ['30 天內', '60 天內', '90 天內'];
    document.getElementById('f16-expiry-counts').innerHTML = [30, 60, 90].map(function (d, i) {
      var on = state.window === d;
      return '<button type="button" class="f16-count' + (on ? ' is-active' : '') + '" data-window="' + d + '"'
        + ' aria-pressed="' + on + '">'
        + '<span class="f16-count__label">' + esc(labels[i]) + '到期</span>'
        + '<span class="f16-count__value">' + esc(fmt.num(counts[i])) + '<small>份</small></span></button>';
    }).join('');

    var rows = expiringList(s.units, state.side, state.window);
    var isUp = state.side === 'upstream';
    var sideName = isUp ? '屋主租約' : '租客租約';
    var html = A.table({
      id: 'f16-expiry-table',
      sortable: true,
      className: 'table--compact',
      columns: [
        { label: '物件', key: 'id', primary: true, render: function (u) { return '<span class="cell-strong">' + esc(u.id) + '</span><span class="cell-sub">' + esc(u.region) + '｜' + esc(u.type) + '</span>'; } },
        {
          label: isUp ? '屋主' : '租客',
          key: 'who',
          render: function (u) {
            var who = isUp ? D.ownerOf(u.id) : D.tenantOf(u.id);
            return who ? esc(who.name) : '<span class="muted-2">空房</span>';
          },
          sortValue: function (u) { var w = isUp ? D.ownerOf(u.id) : D.tenantOf(u.id); return w ? w.name : ''; }
        },
        { label: '到期日', key: 'end', render: function (u) { return esc(fmt.date(endOf(u, state.side))); }, sortValue: function (u) { return endOf(u, state.side); } },
        {
          label: '剩餘天數', key: 'days', align: 'num',
          render: function (u) {
            var d = daysLeft(endOf(u, state.side));
            var kind = d <= 14 ? 'danger' : d <= 45 ? 'warn' : 'neutral';
            return A.badge(fmt.num(d) + ' 天', kind);
          },
          sortValue: function (u) { return daysLeft(endOf(u, state.side)); }
        },
        {
          label: isUp ? '付屋主月租' : '月租', key: 'rent', align: 'num',
          render: function (u) { return isUp ? pnlMoney(u.ownerRent) : rentMoney(u.rent); },
          sortValue: function (u) { return isUp ? u.ownerRent : u.rent; }
        },
        { label: '狀態', key: 'status', render: function (u) { return A.badge(u.funnelStage || D.statusName(u.status), u.status === 'rented' ? 'ok' : 'warn'); }, sortValue: function (u) { return u.status; } }
      ],
      rows: rows,
      sortKey: 'end',
      sortDir: 'asc',
      empty: {
        icon: 'calendar',
        title: '這段期間沒有' + sideName + '到期',
        text: (state.region === ALL ? '全部四區' : state.region) + '未來 ' + state.window + ' 天內沒有要換約的' + sideName + '，換成 60 或 90 天看得更遠。'
      }
    });

    document.getElementById('f16-expiry-list').innerHTML =
      '<p class="muted small mb-8">' + esc(sideName) + '未來 ' + state.window + ' 天內到期 ' + rows.length + ' 份</p>' + html;
  }

  /* ------------------------------------------------------------------ 渲染：現金流 */
  function renderCash(s) {
    var chartHost = document.getElementById('f16-cash-chart');
    var sumHost = document.getElementById('f16-cash-summary');
    if (!canPnl()) {
      chartHost.innerHTML = '<div class="f16-locked">' + icon('lock') + '<p>現金流預估只有老闆看得到，切回老闆視角就會顯示。</p></div>';
      sumHost.innerHTML = '';
      return;
    }
    var cf = cashflowFor(state.region);
    var lowest = cf.slice().sort(function (a, b) { return a.net - b.net; })[0];
    chartHost.innerHTML = '';
    A.charts.line(chartHost, {
      height: 260,
      labels: cf.map(function (r) { return fmt.month(r.month); }),
      valueFormat: function (v) { return fmt.money(v); },
      series: [
        { name: '收入', data: cf.map(function (r) { return r.income; }), color: 'var(--accent)' },
        { name: '支出', data: cf.map(function (r) { return r.cost; }), color: 'var(--danger)' },
        { name: '淨額', data: cf.map(function (r) { return r.net; }), color: 'var(--ok)', area: true }
      ]
    });
    sumHost.innerHTML = '<div class="card-foot">' + A.statRow([
      { label: '六個月收入', html: esc(fmt.money(cf.reduce(function (t, r) { return t + r.income; }, 0))) },
      { label: '六個月支出', html: esc(fmt.money(cf.reduce(function (t, r) { return t + r.cost; }, 0))) },
      { label: '六個月淨額', html: esc(fmt.money(cf.reduce(function (t, r) { return t + r.net; }, 0))), kind: 'ok' },
      { label: '最低的一個月', html: esc(fmt.month(lowest.month)) + ' <small>' + esc(fmt.money(lowest.net)) + '</small>' }
    ], { sm: true }) + '</div>';
  }

  /* ------------------------------------------------------------------ 渲染：四區比一比 */
  function renderRegions() {
    var chartHost = document.getElementById('f16-region-chart');
    var tableHost = document.getElementById('f16-region-table');
    var list = D.company.regions.map(function (r) { return statsFor(r); });

    if (!canPnl()) {
      chartHost.innerHTML = '<div class="f16-locked">' + icon('lock') + '<p>各區收入與淨利只有老闆看得到，出租率等指標不受影響。</p></div>';
    } else {
      chartHost.innerHTML = '';
      A.charts.bar(chartHost, {
        height: 240,
        labels: list.map(function (r) { return r.region; }),
        valueFormat: function (v) { return fmt.money(v); },
        colorOf: function (v, i) {
          if (state.region === ALL) return 'var(--accent)';
          return list[i].region === state.region ? 'var(--accent)' : 'var(--line)';
        },
        series: [{ name: '本月淨利', data: list.map(function (r) { return r.net; }) }],
        showValues: true
      });
    }

    tableHost.innerHTML = '<p class="muted small mt-16 mb-8">點一列就切到那一區</p>' + A.table({
      id: 'f16-region-table-inner',
      className: 'table--compact',
      columns: [
        { label: '區域', key: 'region', primary: true, render: function (r) { return '<span class="cell-strong">' + esc(r.region) + '</span>'; } },
        { label: '物件數', key: 'count', align: 'num', render: function (r) { return esc(fmt.num(r.count)) + ' 間'; } },
        { label: '出租率', key: 'occupancy', align: 'num', render: function (r) { return esc(pct(r.occupancy)); } },
        { label: '本月收入', key: 'income', align: 'num', render: function (r) { return pnlMoney(r.income); } },
        { label: '總成本', key: 'cost', align: 'num', render: function (r) { return pnlMoney(r.cost); } },
        { label: '淨利', key: 'net', align: 'num', render: function (r) { return canPnl() ? '<span class="' + (r.net >= 0 ? 'pos' : 'neg') + '">' + esc(fmt.money(r.net)) + '</span>' : MASK; } }
      ],
      rows: list,
      rowClass: function (r) { return r.region === state.region ? 'is-selected is-clickable' : 'is-clickable'; },
      rowAttrs: function (r) { return 'data-region-row="' + esc(r.region) + '"'; },
      empty: { title: '沒有區域資料' }
    });
  }

  /* ------------------------------------------------------------------ 本月快報 */
  function openReport(s) {
    var cf = cashflowFor(state.region);
    var pending = watchItems().filter(function (it) { return !state.assigned[it.id]; }).length;
    var lines = [
      { icon: 'building', text: (s.region === ALL ? '全部四區' : s.region) + ' 共 ' + fmt.num(s.count) + ' 間，出租中 ' + s.rented + ' 間、空房 ' + s.vacant + ' 間，出租率 ' + pct(s.occupancy) + '。' },
      { icon: 'wallet', text: canPnl()
        ? '本月收入 ' + fmt.money(s.income) + '，付屋主租金 ' + fmt.money(s.ownerRent) + '，其他成本 ' + fmt.money(s.otherCost) + '，淨利 ' + fmt.money(s.net) + '。'
        : '收入與淨利只有老闆看得到。' },
      { icon: 'alert-circle', text: s.arrearsCount ? '欠租 ' + s.arrearsCount + ' 戶、平均 ' + s.arrearsDays + ' 天，待收 ' + fmt.money(s.arrearsAmount) + '。' : '本月租金全部收齊。' },
      { icon: 'wrench', text: '修繕支出 ' + fmt.money(s.repair) + '，占收入 ' + pct(s.repairRate) + '，每間平均 ' + fmt.money(s.repairPerUnit) + '。' },
      { icon: 'calendar', text: '未來 30 天有 ' + s.expiring.downstream[0] + ' 份租客租約到期，90 天內 ' + s.expiring.downstream[2] + ' 份；屋主租約 90 天內 ' + s.expiring.upstream[2] + ' 份。' },
      { icon: 'trend', text: canPnl() ? '未來六個月預估淨額 ' + fmt.money(cf.reduce(function (t, r) { return t + r.net; }, 0)) + '，最低的一個月是 ' + fmt.month(cf.slice().sort(function (a, b) { return a.net - b.net; })[0].month) + '。' : '現金流預估只有老闆看得到。' },
      { icon: 'flag', text: pending ? '今天還有 ' + pending + ' 件要盯，指派後由負責人接手。' : '今天要盯的事都已經指派出去。' }
    ];
    A.modal({
      title: fmt.month(MONTH) + ' 營運快報',
      body: '<div class="f16-report__lines">' + lines.map(function (l) {
        return '<div class="f16-report__line">' + icon(l.icon) + '<span>' + esc(l.text) + '</span></div>';
      }).join('') + '</div>',
      actions: [{ label: '關閉快報', kind: 'primary' }]
    });
  }

  /* ------------------------------------------------------------------ 組合 */
  var current = null;
  function renderAll() {
    current = statsFor(state.region);
    renderMeta(current);
    renderRoleNote();
    renderResult(current);
    renderKpis(current);
    renderWatch();
    renderExpiry(current);
    renderCash(current);
    renderRegions();
  }

  function setRegion(r) {
    if (r === state.region) return;
    state.region = r;
    renderAll();
    renderToolbar();
    A.toast('已切換到「' + (r === ALL ? '全部四區' : r) + '」', 'neutral', { ms: 2000 });
  }

  function bind() {
    document.getElementById('main').addEventListener('click', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;

      var region = t.closest('[data-region]');
      if (region) { setRegion(region.getAttribute('data-region')); return; }

      var side = t.closest('[data-side]');
      if (side) {
        state.side = side.getAttribute('data-side');
        renderExpiry(current);
        return;
      }

      var win = t.closest('[data-window]');
      if (win) {
        state.window = +win.getAttribute('data-window');
        renderExpiry(current);
        return;
      }

      var watch = t.closest('[data-watch]');
      if (watch) { openAssign(watch.getAttribute('data-watch')); return; }

      var row = t.closest('[data-region-row]');
      if (row) { setRegion(row.getAttribute('data-region-row')); return; }
    });

    document.getElementById('f16-report-btn').addEventListener('click', function () { openReport(current); });

    A.onRole(function () { renderAll(); });
  }

  function start() {
    renderToolbar();
    renderAll();
    bind();
    A.reveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
