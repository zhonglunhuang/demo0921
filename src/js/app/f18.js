/* js/app/f18.js — 待辦與員工績效（f18）操作頁
 * 契約：docs/DESIGN.md §3（App 元件）、§5（DB.todos、DB.performance）、§6（文案）。
 * 故事數字：陳○○ 20 件待辦、逾期 3 件。
 * 可從頭點到尾的流程：看到逾期 3 件 → 指派給別人或改期限 → 標記完成 → 統計同步更新。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB;
  if (!A || !D) return;
  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  var EXTRA = {
    kindName: {
      lease: '租約', deposit: '押金', vacancy: '招租', showing: '帶看', prep: '整備',
      repair: '修繕', incident: '事件', arrears: '催租', billing: '帳款',
      moveout: '退租', equipment: '設備', payment: '付款', utility: '水電'
    },
    kindIcon: {
      lease: 'file', deposit: 'dollar', vacancy: 'home', showing: 'calendar', prep: 'refresh',
      repair: 'wrench', incident: 'flag', arrears: 'bell', billing: 'percent',
      moveout: 'external', equipment: 'layers', payment: 'dollar', utility: 'droplet'
    },
    statusKind: { '待處理': 'neutral', '進行中': 'accent', '完成': 'ok' },
    /* 本頁的變更（重新整理即還原） */
    patch: {}
  };

  var state = { staff: '全部', status: '全部', overdueOnly: false };

  function todos() {
    return D.todos.map(function (t) {
      var p = EXTRA.patch[t.id] || {};
      return {
        id: t.id, title: t.title, unitId: t.unitId, kind: t.kind,
        assigneeId: p.assigneeId || t.assigneeId,
        due: p.due || t.due,
        status: p.status || t.status,
        overdue: (p.status || t.status) !== '完成' && (p.due || t.due) < D.today,
        overdueDays: Math.max(0, A.daysBetween(p.due || t.due, D.today))
      };
    });
  }
  function patchOf(id) { return EXTRA.patch[id] || (EXTRA.patch[id] = {}); }
  function managers() { return D.staff.filter(function (s) { return s.role !== 'boss'; }); }

  function filtered() {
    return todos().filter(function (t) {
      if (state.staff !== '全部' && t.assigneeId !== state.staff) return false;
      if (state.status !== '全部' && t.status !== state.status) return false;
      if (state.overdueOnly && !t.overdue) return false;
      return true;
    }).sort(function (a, b) {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if ((a.status === '完成') !== (b.status === '完成')) return a.status === '完成' ? 1 : -1;
      return a.due < b.due ? -1 : 1;
    });
  }

  /* ---------------------------------------------------------------- KPI */
  function renderKpis() {
    var all = todos();
    var open = all.filter(function (t) { return t.status !== '完成'; });
    var overdue = all.filter(function (t) { return t.overdue; });
    var week = open.filter(function (t) { return !t.overdue && A.daysBetween(D.today, t.due) <= 7; });
    var perf = D.performance.totals;
    var doneThisMonth = perf.moveIn + perf.moveOut + perf.repair + perf.dunning + perf.showing + perf.renewal;

    document.getElementById('f18-kpis').innerHTML = [
      A.kpi({ label: '未完成待辦', value: open.length, unit: ' 件', icon: 'list', hint: '全公司' }),
      A.kpi({ label: '已逾期', value: overdue.length, unit: ' 件', icon: 'alert', kind: overdue.length ? 'danger' : 'ok', hint: overdue.length ? '需要今天處理' : '目前沒有逾期' }),
      A.kpi({ label: '7 天內到期', value: week.length, unit: ' 件', icon: 'clock', kind: week.length > 5 ? 'warn' : undefined, hint: '提前安排才不會變逾期' }),
      A.kpi({ label: '本月完成', value: doneThisMonth, unit: ' 件', icon: 'check', kind: 'ok', hint: fmt.month(D.currentMonth) })
    ].join('');
  }

  function renderAlert() {
    var overdue = todos().filter(function (t) { return t.overdue; });
    var host = document.getElementById('f18-alert');
    if (!overdue.length) {
      host.innerHTML = A.alert('目前沒有逾期的待辦，所有事情都還在期限內。', 'ok', { title: '進度正常' });
      return;
    }
    var byStaff = {};
    overdue.forEach(function (t) { byStaff[t.assigneeId] = (byStaff[t.assigneeId] || 0) + 1; });
    var who = Object.keys(byStaff).map(function (id) {
      var s = D.staffById(id);
      return (s ? s.name : id) + ' ' + byStaff[id] + ' 件';
    }).join('、');
    host.innerHTML = A.alert('', 'danger', {
      title: '有 ' + overdue.length + ' 件已經逾期',
      html: '<p>' + esc(who) + '。最久的一件是「' + esc(overdue[0].title) + '」，已逾期 ' + overdue[0].overdueDays + ' 天。</p>',
      action: '<button type="button" class="btn btn--sm btn--danger" data-act="show-overdue">只看逾期</button>'
    });
  }

  /* -------------------------------------------------------------- 清單 */
  function renderList() {
    var rows = filtered();
    document.getElementById('f18-count').textContent = rows.length + ' 件';
    var host = document.getElementById('f18-list');
    if (!rows.length) {
      host.innerHTML = A.emptyState({
        icon: 'check', title: '這個條件下沒有待辦',
        text: '換個負責人或狀態再看。清單空了通常是好消息——代表這個人手上的事都處理完了。'
      });
      return;
    }
    host.innerHTML = A.table({
      columns: [
        { key: 'title', label: '待辦事項', primary: true, render: function (r) {
            return '<span class="f18-title-cell">' +
              '<span class="f18-kind" title="' + esc(EXTRA.kindName[r.kind] || r.kind) + '">' + icon(EXTRA.kindIcon[r.kind] || 'list') + '</span>' +
              '<span><span class="f18-title">' + esc(r.title) + '</span>' +
              '<span class="muted small f18-sub">' + esc(EXTRA.kindName[r.kind] || r.kind) + (r.unitId && r.unitId !== '—' ? '　·　' + esc(r.unitId) : '') + '</span></span></span>';
          } },
        { key: 'assigneeId', label: '負責人', render: function (r) {
            var s = D.staffById(r.assigneeId);
            return s ? esc(s.name) + '<span class="muted small">　' + esc(s.roleName) + '</span>' : '<span class="muted-2">未指派</span>';
          } },
        { key: 'due', label: '期限', align: 'num', render: function (r) {
            if (r.status === '完成') return '<span class="muted">' + esc(fmt.date(r.due)) + '</span>';
            if (r.overdue) return '<span class="f18-overdue">' + esc(fmt.date(r.due)) + '<small>逾期 ' + r.overdueDays + ' 天</small></span>';
            var left = A.daysBetween(D.today, r.due);
            return '<span class="tnum">' + esc(fmt.date(r.due)) + '<small class="muted">' + (left === 0 ? '今天' : '還有 ' + left + ' 天') + '</small></span>';
          } },
        { key: 'status', label: '狀態', render: function (r) { return A.badge(r.status, EXTRA.statusKind[r.status] || 'neutral'); } },
        { key: 'act', label: '動作', sortable: false, render: function (r) {
            if (r.status === '完成') return '<button type="button" class="btn btn--ghost btn--sm" data-act="reopen" data-id="' + esc(r.id) + '">重新開啟</button>';
            return '<span class="f18-row-acts">' +
              '<button type="button" class="btn btn--secondary btn--sm" data-act="done" data-id="' + esc(r.id) + '">標記完成</button>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-act="edit" data-id="' + esc(r.id) + '">改負責人或期限</button>' +
              '</span>';
          } }
      ],
      rows: rows, className: 'f18-table',
      rowClass: function (r) { return r.overdue ? 'f18-row-overdue' : (r.status === '完成' ? 'f18-row-done' : ''); }
    });
  }

  /* ------------------------------------------------------------ 負載圖 */
  function renderLoad() {
    var list = todos();
    var rows = managers().map(function (s) {
      var mine = list.filter(function (t) { return t.assigneeId === s.id && t.status !== '完成'; });
      return { staff: s, open: mine.length, overdue: mine.filter(function (t) { return t.overdue; }).length };
    }).sort(function (a, b) { return b.open - a.open; });
    var max = Math.max.apply(null, rows.map(function (r) { return r.open; }).concat([1]));

    document.getElementById('f18-load').innerHTML = '<div class="f18-load">' + rows.map(function (r) {
      var pct = Math.round(r.open / max * 100);
      var badPct = r.open ? Math.round(r.overdue / r.open * 100) : 0;
      return '<div class="f18-load-row">' +
        '<div class="f18-load-name"><span>' + esc(r.staff.name) + '</span><span class="muted small">' + esc(r.staff.roleName) + '</span></div>' +
        '<div class="f18-load-bar" role="img" aria-label="' + esc(r.staff.name + ' 未完成 ' + r.open + ' 件，其中逾期 ' + r.overdue + ' 件') + '">' +
          '<span class="f18-load-fill" style="width:' + pct + '%">' +
            (r.overdue ? '<span class="f18-load-bad" style="width:' + badPct + '%"></span>' : '') +
          '</span></div>' +
        '<div class="f18-load-num"><strong>' + r.open + '</strong>' + (r.overdue ? '<span class="f18-load-overdue">逾期 ' + r.overdue + '</span>' : '<span class="muted small">無逾期</span>') + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------------ 本月完成 */
  function renderDone() {
    var t = D.performance.totals;
    document.getElementById('f18-month').textContent = D.performance.monthLabel;
    var items = [
      { label: '入住', value: t.moveIn }, { label: '退租', value: t.moveOut },
      { label: '報修處理', value: t.repair }, { label: '催租', value: t.dunning },
      { label: '帶看', value: t.showing }, { label: '續約', value: t.renewal }
    ];
    var max = Math.max.apply(null, items.map(function (i) { return i.value; }));
    document.getElementById('f18-done').innerHTML =
      '<div class="f18-done">' + items.map(function (i) {
        return '<div class="f18-done-row">' +
          '<span class="f18-done-label">' + esc(i.label) + '</span>' +
          '<span class="f18-done-bar"><span style="width:' + Math.round(i.value / max * 100) + '%"></span></span>' +
          '<span class="f18-done-num tnum">' + i.value + '</span></div>';
      }).join('') + '</div>' +
      '<div class="f18-done-staff">' + A.table({
        columns: [
          { key: 'name', label: '員工', render: function (r) { return esc(r.name) + '<span class="muted small">　' + esc(r.role) + '</span>'; } },
          { key: 'open', label: '手上', align: 'num' },
          { key: 'overdue', label: '逾期', align: 'num', render: function (r) { return r.overdue ? '<span class="f18-overdue-n">' + r.overdue + '</span>' : '<span class="muted-2">0</span>'; } },
          { key: 'moveIn', label: '入住', align: 'num' },
          { key: 'repair', label: '報修', align: 'num' },
          { key: 'showing', label: '帶看', align: 'num' }
        ],
        rows: D.performance.byStaff, compact: true, className: 'f18-staff-table'
      }) + '</div>';
  }

  /* -------------------------------------------------------------- 操作 */
  function doDone(id) {
    var t = todos().filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    patchOf(id).status = '完成';
    A.toast('「' + t.title.slice(0, 14) + '…」已標記完成', 'ok');
    renderAll();
  }
  function doReopen(id) { patchOf(id).status = '待處理'; A.toast('已重新開啟', 'neutral'); renderAll(); }

  function doEdit(id) {
    var t = todos().filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    A.modal({
      title: '改負責人或期限',
      body: '<p class="muted small">' + esc(t.title) + '</p>' +
        '<label class="field"><span class="field-hint">負責人</span><select class="select" id="f18-edit-who">' +
          managers().map(function (s) {
            return '<option value="' + esc(s.id) + '"' + (s.id === t.assigneeId ? ' selected' : '') + '>' + esc(s.name + '（' + s.roleName + '）') + '</option>';
          }).join('') + '</select></label>' +
        '<label class="field"><span class="field-hint">期限</span><input class="input" type="date" id="f18-edit-due" value="' + esc(t.due) + '"></label>',
      actions: [
        { label: '取消', kind: 'secondary', close: true },
        { label: '儲存', kind: 'primary', onClick: function (close) {
            var card = close.element;
            var who = card.querySelector('#f18-edit-who').value;
            var due = card.querySelector('#f18-edit-due').value;
            var p = patchOf(id);
            p.assigneeId = who; if (due) p.due = due;
            var s = D.staffById(who);
            A.toast('已改為 ' + s.name + '　期限 ' + fmt.date(due), 'ok');
            renderAll();
          } }
      ]
    });
  }

  function doRemind() {
    var overdue = todos().filter(function (t) { return t.overdue; });
    if (!overdue.length) { A.toast('目前沒有逾期待辦', 'neutral'); return; }
    var names = {};
    overdue.forEach(function (t) { var s = D.staffById(t.assigneeId); if (s) names[s.name] = (names[s.name] || 0) + 1; });
    A.confirm({
      title: '提醒逾期負責人',
      body: '<p>將以 LINE 通知下列同仁各自的逾期待辦：</p><ul class="f18-remind-list">' +
        Object.keys(names).map(function (n) { return '<li>' + esc(n) + '　' + names[n] + ' 件</li>'; }).join('') + '</ul>' +
        '<p class="muted small">提醒內容只列出待辦與期限，不會出現租客的身分證或銀行資料。</p>',
      confirmLabel: '送出提醒'
    }).then(function (yes) {
      if (yes) A.toast('已送出 ' + Object.keys(names).length + ' 則提醒', 'ok');
    });
  }

  /* -------------------------------------------------------------- 綁定 */
  function bind() {
    document.addEventListener('click', function (e) {
      var tab = e.target.closest('#f18-staff-tabs .tab');
      if (tab) { state.staff = tab.getAttribute('data-tab'); renderStaffTabs(); renderList(); return; }
      var act = e.target.closest('[data-act]');
      if (act) {
        var a = act.getAttribute('data-act'), id = act.getAttribute('data-id');
        if (a === 'done') doDone(id);
        else if (a === 'reopen') doReopen(id);
        else if (a === 'edit') doEdit(id);
        else if (a === 'show-overdue') {
          state.overdueOnly = true;
          document.getElementById('f18-overdue-only').checked = true;
          renderList();
          document.getElementById('f18-list').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        return;
      }
      if (e.target.closest('#f18-remind')) doRemind();
    });
    document.getElementById('f18-status').addEventListener('change', function (e) { state.status = e.target.value; renderList(); });
    document.getElementById('f18-overdue-only').addEventListener('change', function (e) { state.overdueOnly = e.target.checked; renderList(); });
  }

  function renderStaffTabs() {
    var list = todos();
    var items = [{ id: '全部', label: '全部' }].concat(managers().map(function (s) { return { id: s.id, label: s.name }; }));
    document.getElementById('f18-staff-tabs').innerHTML = items.map(function (it) {
      var n = it.id === '全部'
        ? list.filter(function (t) { return t.status !== '完成'; }).length
        : list.filter(function (t) { return t.assigneeId === it.id && t.status !== '完成'; }).length;
      var bad = it.id === '全部'
        ? list.filter(function (t) { return t.overdue; }).length
        : list.filter(function (t) { return t.assigneeId === it.id && t.overdue; }).length;
      var on = state.staff === it.id;
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-tab="' + esc(it.id) + '">' +
        '<span>' + esc(it.label) + '</span><span class="f18-tab-n' + (bad ? ' is-bad' : '') + '">' + n + '</span></button>';
    }).join('');
  }

  function renderAll() { renderKpis(); renderAlert(); renderStaffTabs(); renderList(); renderLoad(); renderDone(); }

  function init() {
    document.getElementById('f18-status').innerHTML = ['全部', '待處理', '進行中', '完成'].map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s === '全部' ? '所有狀態' : s) + '</option>';
    }).join('');
    renderAll(); bind(); A.reveal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
