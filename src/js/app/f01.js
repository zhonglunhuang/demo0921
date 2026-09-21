/* js/app/f01.js — f01 上游租約與到期風險（進系統操作頁）
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）。
 * 只讀 window.DB，所有操作結果存在本檔的 state 裡（重新整理即回到初始狀態）。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D) return;

  var esc = A.esc;
  var icon = A.icon;
  var fmt = A.fmt;

  /* ---------------------------------------------------------------- 基礎層沒有的東西，補在這裡 */
  var EXTRA = {
    /* 續租處理的四個階段（DB 沒有這條流程，f01 自己定義） */
    stages: [
      { key: 'create', title: '建立續租待辦', text: '到期前 60 天自動開一件待辦，指定負責人與期限' },
      { key: 'contact', title: '聯繫屋主', text: '租務管理員找屋主確認要不要續約' },
      { key: 'reply', title: '記錄屋主回覆', text: '把屋主的決定記下來，系統同步更新上游租約' },
      { key: 'done', title: '完成續約', text: '上游到期日延後，先到期的風險解除' }
    ],
    /* 屋主回覆選項 */
    replies: [
      { key: 'renew3', label: '同意續約 3 年', years: 3 },
      { key: 'renew1', label: '同意續約 1 年', years: 1 },
      { key: 'decline', label: '不再續約', years: 0 }
    ],
    /* 可以做續租決策的角色（其餘角色只能看） */
    actionRoles: ['boss', 'manager'],
    /* 預設承辦人：租務管理員 陳○○ */
    ownerStaffId: 'S02',
    filters: [
      { id: 'risk', label: '有風險' },
      { id: 'd30', label: '30 天內到期' },
      { id: 'd90', label: '90 天內到期' },
      { id: 'all', label: '全部' }
    ]
  };

  /* ---------------------------------------------------------------- 狀態（重新整理即重置） */
  var state = {
    filter: 'risk',
    region: '全部',
    q: '',
    selected: 'A03',
    sortKey: null,
    sortDir: 'asc',
    over: {},          /* unitId → { end, stage, reply, renewedAt } */
    /* 沿用基礎層已經自動建立的續租待辦（DB.todos 的 lease 類），本頁只加不改原始資料 */
    tasks: D.todos.filter(function (t) { return t.kind === 'lease'; }).map(function (t) {
      return { id: t.id, unitId: t.unitId, title: t.title, assigneeId: t.assigneeId, due: t.due, status: t.status, auto: true };
    }),
    newTaskId: null
  };
  var taskSeq = 0;

  /* ---------------------------------------------------------------- 小工具 */
  function over(id) { return state.over[id] || (state.over[id] = {}); }
  function upEnd(u) { return over(u.id).end || u.upstream.end; }
  function dnEnd(u) { return u.downstream.end; }
  function isRisk(u) { return !!u.tenantId && upEnd(u) < dnEnd(u); }
  function riskUnits() { return D.units.filter(isRisk); }
  function daysTo(iso) { return A.daysBetween(A.today, iso); }
  function expiringIn(days) {
    return D.units.filter(function (u) { var d = daysTo(upEnd(u)); return d >= 0 && d <= days; });
  }
  /* 最近一份還沒到期的上游租約（空狀態要說得出下一個關卡在哪） */
  function nextExpiring() {
    var best = null;
    D.units.forEach(function (u) {
      if (daysTo(upEnd(u)) < 0) return;
      if (!best || upEnd(u) < upEnd(best)) best = u;
    });
    return best;
  }
  function addYears(iso, n) {
    var p = String(iso).split('-');
    var d = new Date(Date.UTC(+p[0] + n, +p[1] - 1, +p[2]));
    return d.toISOString().slice(0, 10);
  }
  function money(v, dataType) { return fmt.money(A.mask(v, dataType || 'ownerRent')); }
  function canAct() { return EXTRA.actionRoles.indexOf(A.role) >= 0; }
  function staffName(id) { var s = D.staffById(id); return s ? s.name : '未指派'; }
  function taskOf(unitId) {
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].unitId === unitId) return state.tasks[i];
    return null;
  }
  function stageOf(u) {
    var o = over(u.id);
    if (o.stage) return o.stage;
    return taskOf(u.id) ? 'contact' : 'create';
  }
  function unitLabel(u) { return u.region + ' ' + u.building + ' 棟 · ' + u.type + ' ' + fmt.ping(u.ping); }

  /* ---------------------------------------------------------------- 篩選 */
  function filterCount(id) {
    if (id === 'all') return D.units.length;
    if (id === 'risk') return riskUnits().length;
    if (id === 'd30') return expiringIn(30).length;
    if (id === 'd90') return expiringIn(90).length;
    return 0;
  }
  function visibleUnits() {
    var base = D.units;
    if (state.filter === 'risk') base = riskUnits();
    else if (state.filter === 'd30') base = expiringIn(30);
    else if (state.filter === 'd90') base = expiringIn(90);
    var q = state.q.trim().toLowerCase();
    return base.filter(function (u) {
      if (state.region !== '全部' && u.region !== state.region) return false;
      if (!q) return true;
      var owner = D.ownerOf(u.id);
      return u.id.toLowerCase().indexOf(q) >= 0 || (owner && owner.name.indexOf(state.q.trim()) >= 0);
    });
  }

  /* ---------------------------------------------------------------- 頂端警示 */
  function renderAlert() {
    var host = document.getElementById('f01-alert');
    var risks = riskUnits();
    if (!risks.length) {
      host.innerHTML = A.alert('', 'ok', {
        title: '目前沒有上游先到期的物件',
        html: '<p>每一份上游租約都比租客的租約晚到期，不會出現租客還在住、屋主合約卻先結束的情況。</p>'
      });
      return;
    }
    var ids = risks.map(function (r) { return r.id; }).join('、');
    var first = risks[0];
    host.innerHTML = A.alert('', 'danger', {
      title: '有 ' + risks.length + ' 間物件的上游租約比下游先到期',
      html: '<p>' + esc(ids) + ' 的屋主合約會在租客搬走前先結束。先跟屋主談好續約，才不會被迫請租客提前搬家。</p>' +
        '<p class="mt-8"><button type="button" class="btn btn--danger btn--sm" data-f01-goto="' + esc(first.id) + '">處理 ' + esc(first.id) + ' 續約</button></p>'
    });
  }

  /* ---------------------------------------------------------------- KPI */
  function renderKpis() {
    var host = document.getElementById('f01-kpis');
    var risks = riskUnits().length;
    var in90 = expiringIn(90);
    var next = in90.slice().sort(function (a, b) { return upEnd(a) < upEnd(b) ? -1 : 1; })[0];
    host.innerHTML =
      A.kpi({ label: '上游租約', value: fmt.num(D.units.length), unit: ' 份', icon: 'file', hint: '涵蓋 ' + D.company.regions.join('、') + ' 共 ' + fmt.num(D.units.length) + ' 間物件' }) +
      A.kpi({ label: '到期風險', value: fmt.num(risks), unit: ' 間', icon: 'alert', kind: risks ? 'danger' : 'ok', hint: risks ? '上游比下游先到期，租客還在住' : '兩份租約的到期順序都正常' }) +
      A.kpi({ label: '90 天內到期', value: fmt.num(in90.length), unit: ' 份', icon: 'calendar', kind: in90.length ? 'warn' : undefined, hint: next ? '最近一份是 ' + next.id + '，' + fmt.date(upEnd(next)) : '近三個月沒有上游租約到期' }) +
      A.kpi({ label: '本月付屋主租金', value: 'NT$ ' + fmt.num(A.mask(D.stats.ownerRent, 'ownerRent')), icon: 'wallet', hint: fmt.num(D.units.length) + ' 份上游租約合計' });
  }

  /* ---------------------------------------------------------------- 篩選列 */
  function renderFilters() {
    var host = document.getElementById('f01-filters');
    host.innerHTML = A.tabs(EXTRA.filters.map(function (f) {
      var n = filterCount(f.id);
      return { id: f.id, label: f.label, count: fmt.num(n), countKind: f.id === 'risk' && n ? 'danger' : 'neutral' };
    }), { segmented: true, active: state.filter, group: 'f01-filter' });

    var sel = document.getElementById('f01-region');
    if (!sel.options.length) {
      sel.innerHTML = ['全部'].concat(D.company.regions).map(function (r) {
        return '<option value="' + esc(r) + '">' + esc(r === '全部' ? '全部區域' : r) + '</option>';
      }).join('');
    }
    sel.value = state.region;
  }

  /* ---------------------------------------------------------------- 清單 */
  function statusBadge(u) {
    if (isRisk(u)) return A.badge('先到期', 'danger', { dot: true });
    var o = over(u.id);
    if (o.stage === 'done' && o.reply === 'decline') return A.badge('不再續約', 'warn', { dot: true });
    if (o.stage === 'done') return A.badge('已續約', 'ok', { dot: true });
    var d = daysTo(upEnd(u));
    if (d >= 0 && d <= 90) return A.badge('90 天內到期', 'warn', { dot: true });
    return A.badge('正常', 'neutral', { dot: true });
  }

  function renderTable() {
    var rows = visibleUnits();
    document.getElementById('f01-count').textContent =
      '顯示 ' + fmt.num(rows.length) + ' 筆，共 ' + fmt.num(D.units.length) + ' 份上游租約';

    document.getElementById('f01-table').innerHTML = A.table({
      id: 'f01-lease',
      sortable: true,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      onSort: function (k, d) { state.sortKey = k; state.sortDir = d; },
      rows: rows,
      rowClass: function (u) { return (u.id === state.selected ? 'is-selected ' : '') + 'is-clickable'; },
      rowAttrs: function (u) { return 'data-f01-row="' + esc(u.id) + '" tabindex="0"'; },
      empty: {
        icon: 'calendar',
        title: '這個條件下沒有上游租約',
        text: emptyHint()
      },
      columns: [
        {
          label: '物件', key: 'id', primary: true,
          render: function (u) {
            return esc(u.id) + '<span class="cell-sub f01-nw">' + esc(u.region + ' ' + u.building + ' 棟 · ' + u.type) + '</span>';
          }
        },
        {
          label: '屋主', key: 'owner',
          sortValue: function (u) { var o = D.ownerOf(u.id); return o ? o.name : ''; },
          render: function (u) {
            var o = D.ownerOf(u.id);
            return '<span class="f01-nw">' + esc(o ? o.name : '—') + '</span>';
          }
        },
        {
          label: '上游租期', key: 'upEnd',
          sortValue: function (u) { return upEnd(u); },
          render: function (u) {
            return '<span class="f01-nw">' + fmt.date(upEnd(u)) + ' 到期</span>' +
              '<span class="cell-sub f01-nw">' + fmt.date(u.upstream.start) + ' 起</span>';
          }
        },
        {
          label: '付屋主月租', key: 'ownerRent', align: 'num',
          sortValue: function (u) { return u.ownerRent; },
          render: function (u) { return '<span class="f01-nw">' + money(u.ownerRent, 'ownerRent') + '</span>'; }
        },
        {
          label: '押金', key: 'deposit', align: 'num',
          sortValue: function (u) { return u.upstream.deposit; },
          render: function (u) { return '<span class="f01-nw">' + money(u.upstream.deposit, 'deposit') + '</span>'; }
        },
        {
          label: '付款日', key: 'payDay', align: 'center',
          sortValue: function (u) { return u.upstream.payDay; },
          render: function (u) { return '<span class="f01-nw">每月 ' + u.upstream.payDay + ' 日</span>'; }
        },
        {
          label: '續租通知日', key: 'renew',
          sortValue: function (u) { return renewNotice(u); },
          render: function (u) {
            var n = renewNotice(u);
            var d = daysTo(n);
            return '<span class="f01-nw">' + fmt.date(n) + '</span><span class="cell-sub f01-nw">' + (d < 0 ? '已過 ' + fmt.num(-d) + ' 天' : '還有 ' + fmt.num(d) + ' 天') + '</span>';
          }
        },
        {
          label: '狀態', key: 'status', align: 'center',
          sortValue: function (u) { return isRisk(u) ? 0 : 1; },
          render: function (u) {
            /* 有風險的列直接把兩個到期日都講出來 */
            return statusBadge(u) + (isRisk(u)
              ? '<span class="cell-sub f01-nw">租客租約到 ' + fmt.date(dnEnd(u)) + '</span>'
              : '');
          }
        },
        {
          label: '動作', noLabel: true, sortable: false, align: 'center',
          render: function (u) { return '<button type="button" class="btn btn--ghost btn--sm" data-f01-row="' + esc(u.id) + '">看兩份租約</button>'; }
        }
      ]
    });
  }

  function emptyHint() {
    if (state.filter === 'risk') return '每一份上游租約都比租客的租約晚到期，不用處理。';
    if (state.filter === 'd30' || state.filter === 'd90') {
      var n = nextExpiring();
      return n
        ? '最近一份到期的是 ' + n.id + '，' + fmt.date(upEnd(n)) + ' 才到期，現在不用急著處理。'
        : '近期沒有上游租約到期。';
    }
    return '換個區域或搜尋條件再看一次。';
  }

  function renewNotice(u) {
    var o = over(u.id);
    if (o.end) return A.addDays(o.end, -60);
    return u.upstream.renewNoticeDate || A.addDays(u.upstream.end, -60);
  }

  /* ---------------------------------------------------------------- 兩份租約並列時間軸 */
  function ganttHTML(u) {
    var ue = upEnd(u), de = dnEnd(u);
    var min = u.upstream.start < u.downstream.start ? u.upstream.start : u.downstream.start;
    var max = ue > de ? ue : de;
    var t0 = A.addDays(min, -45);
    var t1 = A.addDays(max, 45);
    var span = A.daysBetween(t0, t1) || 1;
    function pos(iso) { return Math.max(0, Math.min(100, (A.daysBetween(t0, iso) / span) * 100)); }
    function bar(from, to, kind) {
      var l = pos(from);
      return '<div class="f01-bar f01-bar--' + kind + '" style="left:' + l.toFixed(2) + '%;width:' + (pos(to) - l).toFixed(2) + '%"></div>';
    }
    var today = pos(A.today);
    var gap = '';
    if (ue < de) {
      var gl = pos(ue);
      gap = '<div class="f01-gap" style="left:' + gl.toFixed(2) + '%;width:' + (pos(de) - gl).toFixed(2) + '%">' +
        '<span>空窗 ' + fmt.num(A.daysBetween(ue, de)) + ' 天</span></div>';
    }
    var ticks = '';
    for (var y = +t0.slice(0, 4) + 1; y <= +t1.slice(0, 4); y++) {
      var yp = pos(y + '-01-01');
      if (Math.abs(yp - today) < 11) continue;            /* 和「今天」擠在一起就不畫 */
      ticks += '<span style="left:' + yp.toFixed(2) + '%">' + y + '</span>';
    }
    ticks += '<span class="is-today" style="left:' + today.toFixed(2) + '%">今天</span>';

    var owner = D.ownerOf(u.id);
    var tenant = D.tenantOf(u.id);
    return '<div class="f01-gantt">' +
      '<div>' +
        '<div class="f01-lease-head"><span class="f01-lease-name f01-lease-name--up">上游租約（屋主 ' + esc(owner ? owner.name : '—') + ' → 公司）</span>' +
        '<span class="f01-lease-range">' + fmt.date(u.upstream.start) + ' — ' + fmt.date(ue) + '</span></div>' +
        '<div class="f01-track">' + gap + bar(u.upstream.start, ue, 'up') +
          '<div class="f01-today" style="left:' + today.toFixed(2) + '%"></div></div>' +
      '</div>' +
      '<div>' +
        '<div class="f01-lease-head"><span class="f01-lease-name f01-lease-name--down">下游租約（公司 → 租客 ' + esc(tenant ? tenant.name : '—') + '）</span>' +
        '<span class="f01-lease-range">' + fmt.date(u.downstream.start) + ' — ' + fmt.date(de) + '</span></div>' +
        '<div class="f01-track">' + bar(u.downstream.start, de, 'down') +
          '<div class="f01-today" style="left:' + today.toFixed(2) + '%"></div></div>' +
      '</div>' +
      '<div class="f01-axis">' + ticks + '</div>' +
      '<p class="f01-gantt-note">' + (ue < de
        ? '紅色是空窗期：上游租約到期後，還有 ' + fmt.num(A.daysBetween(ue, de)) + ' 天租客住在裡面。'
        : '上游租約比租客租約晚 ' + fmt.num(A.daysBetween(de, ue)) + ' 天到期，到期順序正常。') + '</p>' +
      '</div>';
  }

  /* ---------------------------------------------------------------- 續租處理 */
  function flowHTML(u) {
    var stage = stageOf(u);
    var idx = 0;
    EXTRA.stages.forEach(function (s, i) { if (s.key === stage) idx = i; });
    var o = over(u.id);
    var items = EXTRA.stages.map(function (s, i) {
      var done = i < idx || (stage === 'done' && i === idx);
      return {
        title: s.title,
        text: i === idx && o.note ? o.note : s.text,
        kind: done ? 'ok' : (i === idx ? 'accent' : ''),
        current: i === idx && stage !== 'done'
      };
    });

    var btn = '';
    var allowed = canAct();
    if (stage === 'create') btn = actionBtn(u, '建立續租待辦', 'file-plus', allowed);
    else if (stage === 'contact') btn = actionBtn(u, '聯繫屋主', 'phone', allowed);
    else if (stage === 'reply') btn = actionBtn(u, '記錄屋主回覆', 'edit', allowed);

    var result = '';
    if (stage === 'done') {
      result = o.reply === 'decline'
        ? A.alert('', 'warn', { title: '屋主不再續約', html: '<p>已建立退租銜接待辦，請在 ' + fmt.date(upEnd(u)) + ' 前跟租客談搬遷或換房。</p>' })
        : A.alert('', 'ok', { title: '續約完成，風險解除', html: '<p>上游租約已延到 ' + fmt.date(upEnd(u)) + '，比租客租約晚 ' + fmt.num(A.daysBetween(dnEnd(u), upEnd(u))) + ' 天到期。</p>' });
    }

    var owner = D.ownerOf(u.id);
    var t = taskOf(u.id);
    return '<div class="f01-flow">' +
      '<div class="f01-owner">' + '<span class="icon-circle icon-circle--neutral">' + icon('user') + '</span>' +
        '<div><div class="f01-owner-name">屋主 ' + esc(owner ? owner.name : '—') + '</div>' +
        '<div class="f01-owner-meta">' + esc(A.mask(owner ? owner.phone : '', 'phone')) + ' · 名下 ' + fmt.num(owner ? owner.unitIds.length : 0) + ' 間物件</div></div></div>' +
      A.timeline(items) +
      (t ? '<p class="f01-flow-hint"><span class="f01-nw">待辦 ' + esc(t.id) + '</span> · <span class="f01-nw">' + esc(staffName(t.assigneeId)) + ' 負責</span> · <span class="f01-nw">期限 ' + fmt.date(t.due) + '</span> · <span class="f01-nw">' + esc(t.status) + '</span></p>' : '') +
      result +
      btn +
      (allowed ? '' : '<p class="f01-flow-hint">目前是「' + esc(A.roleName()) + '」視角，續租決策由老闆或租務管理員處理。</p>') +
      '</div>';
  }

  function actionBtn(u, label, ic, allowed) {
    return '<button type="button" class="btn btn--primary btn--block" data-f01-act="' + esc(u.id) + '"' +
      (allowed ? '' : ' disabled aria-disabled="true"') + '>' + icon(ic) + '<span>' + esc(label) + '</span></button>';
  }

  /* ---------------------------------------------------------------- 詳情 */
  function termsHTML(u) {
    var us = u.upstream;
    var pairs = [
      ['調租條件', us.adjustClause],
      ['修繕責任', us.repairResp],
      ['房屋稅', us.taxBy + '負擔'],
      ['管理費', us.mgmtFeeBy + '負擔'],
      ['水電費', us.utilitiesBy + '負擔'],
      ['提前解約', us.earlyTermination],
      ['續租通知日', fmt.date(renewNotice(u))],
      ['付款日', '每月 ' + us.payDay + ' 日匯款給屋主']
    ];
    return '<div class="f01-terms">' + pairs.map(function (p) {
      return '<dl class="kv"><dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd></dl>';
    }).join('') + '</div>';
  }

  function renderDetail() {
    var host = document.getElementById('f01-detail');
    var u = D.unit(state.selected);
    if (!u) {
      host.innerHTML = A.emptyState({ icon: 'file', title: '還沒有選物件', text: '在上面的清單點一列，這裡就會顯示兩份租約的並列時間軸。' });
      return;
    }
    var tenant = D.tenantOf(u.id);
    host.innerHTML =
      '<div class="card-head">' +
        '<div><div class="f01-detail-title"><h2 id="f01-detail-title">' + esc(u.id) + '</h2>' +
          '<span class="muted">' + esc(unitLabel(u)) + ' · ' + esc(D.company.buildings[u.building].address) + '</span></div>' +
          '<p class="card-sub">租客 ' + esc(tenant ? tenant.name : '目前沒有租客') + ' · 收租客月租 ' + money(u.rent, 'rent') + ' · 付屋主月租 ' + money(u.ownerRent, 'ownerRent') + '</p></div>' +
        statusBadge(u) +
      '</div>' +
      (isRisk(u) ? '<div class="mb-24">' + A.alert('', 'danger', {
        title: '上游租約 ' + fmt.date(upEnd(u)) + ' 到期，房客租約到 ' + fmt.date(dnEnd(u)) + '，仍有房客在租',
        html: '<p>中間有 ' + fmt.num(A.daysBetween(upEnd(u), dnEnd(u))) + ' 天沒有上游租約。請在 ' + fmt.date(renewNotice(u)) + ' 前跟屋主談續約。</p>'
      }) + '</div>' : '') +
      '<div class="f01-detail-grid">' +
        '<div>' +
          '<p class="f01-sub-title">兩份租約並列</p>' + ganttHTML(u) +
          '<p class="f01-sub-title mt-32">上游租約條款</p>' + termsHTML(u) +
        '</div>' +
        '<div>' +
          '<p class="f01-sub-title">續租處理</p>' + flowHTML(u) +
        '</div>' +
      '</div>';
  }

  /* ---------------------------------------------------------------- 續租待辦清單 */
  function renderTasks() {
    var host = document.getElementById('f01-tasks');
    if (!state.tasks.length) {
      host.innerHTML = A.emptyState({ icon: 'check-circle', title: '沒有待處理的續租待辦', text: '有上游租約進入 60 天到期範圍時，系統會自動建立一件。' });
      return;
    }
    host.innerHTML = state.tasks.map(function (t) {
      var done = t.status === '完成';
      return '<div class="f01-task' + (t.id === state.newTaskId ? ' is-new' : '') + '">' +
        '<span class="icon-circle ' + (done ? 'icon-circle--ok' : 'icon-circle--warn') + '">' + icon(done ? 'check' : 'bell') + '</span>' +
        '<div class="f01-task-body"><div class="f01-task-title">' + esc(t.title) + '</div>' +
        '<div class="f01-task-meta">負責人 ' + esc(staffName(t.assigneeId)) + ' · 期限 ' + fmt.date(t.due) + ' · 物件 ' + esc(t.unitId) + (t.auto ? ' · 系統自動建立' : ' · 手動建立') + '</div></div>' +
        A.badge(t.status, done ? 'ok' : 'warn') +
        '<button type="button" class="btn btn--ghost btn--sm" data-f01-row="' + esc(t.unitId) + '">查看</button>' +
        '</div>';
    }).join('');
    state.newTaskId = null;
  }

  /* ---------------------------------------------------------------- 動作 */
  function doAction(id) {
    var u = D.unit(id);
    if (!u || !canAct()) return;
    var stage = stageOf(u);
    var o = over(id);

    if (stage === 'create') {
      taskSeq++;
      var t = {
        id: 'TD-F' + (taskSeq < 10 ? '0' : '') + taskSeq,
        unitId: id,
        title: '續租通知：' + id + ' 上游租約 ' + fmt.date(upEnd(u)) + ' 到期',
        assigneeId: EXTRA.ownerStaffId,
        due: renewNotice(u),
        status: '待處理',
        auto: false
      };
      state.tasks.unshift(t);
      state.newTaskId = t.id;
      o.stage = 'contact';
      o.note = '待辦 ' + t.id + ' 已建立，指派給 ' + staffName(t.assigneeId);
      A.toast('已建立 ' + id + ' 的續租待辦', 'ok', { sub: staffName(t.assigneeId) + ' 負責，期限 ' + fmt.date(t.due) });
      render();
      return;
    }

    if (stage === 'contact') {
      o.stage = 'reply';
      o.note = '已於 ' + fmt.date(A.today) + ' 聯繫屋主，等待回覆';
      A.toast('已記錄聯繫屋主', 'ok', { sub: '等屋主回覆後再按「記錄屋主回覆」' });
      render();
      return;
    }

    if (stage === 'reply') openReplyModal(u);
  }

  function openReplyModal(u) {
    var owner = D.ownerOf(u.id);
    var body = '<p class="muted">屋主 ' + esc(owner ? owner.name : '—') + ' 對 ' + esc(u.id) + ' 上游租約（' + fmt.date(upEnd(u)) + ' 到期）的回覆：</p>' +
      '<div class="stack stack--sm">' + EXTRA.replies.map(function (r, i) {
        var to = r.years ? fmt.date(addYears(upEnd(u), r.years)) : '';
        return '<label class="checklist-item is-static" style="cursor:pointer">' +
          '<input type="radio" name="f01-reply" value="' + esc(r.key) + '"' + (i === 0 ? ' checked' : '') + ' style="position:static;opacity:1;width:auto;height:auto;margin-right:4px">' +
          '<span class="checklist-label">' + esc(r.label) + (to ? '<span class="checklist-hint">上游租約延到 ' + to + '</span>' : '<span class="checklist-hint">需要安排租客搬遷或換房</span>') + '</span></label>';
      }).join('') + '</div>';

    var close = A.modal({
      title: '記錄屋主回覆',
      body: body,
      actions: [
        { label: '取消', kind: 'ghost' },
        {
          label: '儲存回覆', kind: 'primary',
          onClick: function () {
            var picked = close.element.querySelector('input[name="f01-reply"]:checked');
            applyReply(u, picked ? picked.value : 'renew3');
          }
        }
      ]
    });
  }

  function applyReply(u, key) {
    var r = EXTRA.replies.filter(function (x) { return x.key === key; })[0] || EXTRA.replies[0];
    var o = over(u.id);
    var t = taskOf(u.id);
    o.stage = 'done';
    o.reply = r.key;

    if (r.years) {
      var newEnd = addYears(upEnd(u), r.years);
      o.end = newEnd;
      o.note = '屋主同意續約 ' + r.years + ' 年，上游租約延到 ' + fmt.date(newEnd);
      if (t) { t.status = '完成'; }
      A.toast(u.id + ' 上游租約已續約到 ' + fmt.date(newEnd), 'ok', { sub: '先到期的風險解除，剩 ' + fmt.num(riskUnits().length) + ' 間有風險' });
    } else {
      o.note = '屋主不再續約，需安排租客搬遷或換房';
      if (t) { t.status = '進行中'; t.title = '退租銜接：' + u.id + ' 上游租約 ' + fmt.date(upEnd(u)) + ' 到期'; }
      A.toast(u.id + ' 屋主不再續約', 'warn', { sub: '已改為退租銜接待辦，請盡早與租客溝通' });
    }
    render();
  }

  function select(id) {
    if (!D.unit(id)) return;
    state.selected = id;
    renderTable();
    renderDetail();
    var el = document.getElementById('f01-detail');
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------------------------------------------------------- 綁定與初始化 */
  function render() {
    renderAlert();
    renderKpis();
    renderFilters();
    renderTable();
    renderDetail();
    renderTasks();
  }

  function bind() {
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!(t instanceof Element)) return;

      var act = t.closest('[data-f01-act]');
      if (act) { doAction(act.getAttribute('data-f01-act')); return; }

      var goTo = t.closest('[data-f01-goto]');
      if (goTo) { select(goTo.getAttribute('data-f01-goto')); return; }

      var row = t.closest('[data-f01-row]');
      if (row) { select(row.getAttribute('data-f01-row')); return; }

      var tab = t.closest('.tab[data-tab-group="f01-filter"]');
      if (tab) { state.filter = tab.getAttribute('data-tab'); renderTable(); return; }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var row = e.target instanceof Element && e.target.closest('tr[data-f01-row]');
      if (row) { e.preventDefault(); select(row.getAttribute('data-f01-row')); }
    });

    var search = document.getElementById('f01-search');
    search.addEventListener('input', function () { state.q = search.value; renderTable(); });

    var region = document.getElementById('f01-region');
    region.addEventListener('change', function () { state.region = region.value; renderTable(); });

    A.onRole(function () { render(); });
  }

  document.getElementById('f01-search-icon').innerHTML = icon('search');
  render();
  bind();
  A.reveal();
})();
