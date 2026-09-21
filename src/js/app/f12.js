/* js/app/f12.js — 重大事件管理（f12）操作頁
 * 契約：docs/DESIGN.md §3（App API 與元件）、§5（假資料）、§6（文案）。
 * 主角：INC-07（B04 浴室漏水至樓下 B03，緊急，時間軸 7 步）。
 * 可從頭點到尾的流程：選事件 → 指派負責人 → 加註處理紀錄 → 調整等級 → 結案。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB;
  if (!A || !D) return;
  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  /* 事件等級的顏色與排序（基礎層沒有，寫在這裡） */
  var EXTRA = {
    levelKind: { '緊急': 'danger', '重大': 'warn', '一般': 'neutral' },
    levelOrder: { '緊急': 0, '重大': 1, '一般': 2 },
    statusKind: { '處理中': 'warn', '已結案': 'ok' },
    /* 事件 vs 修繕工單：說明為什麼要分開管 */
    compare: [
      { aspect: '典型例子', incident: '漏水到樓下、深夜噪音、警察到場、租客失聯', workorder: '燈泡不亮、紗窗破洞、馬桶漏水' },
      { aspect: '要不要立刻找人', incident: '緊急事件立即電話加 LINE 通知值班人員', workorder: '照排程派工，24 小時內回覆即可' },
      { aspect: '牽涉到誰', incident: '常牽涉第三人：樓下住戶、鄰居、警消、屋主', workorder: '通常只有租客與廠商' },
      { aspect: '要留什麼', incident: '對話逐則、照片、到場時間、處理人，日後要交代', workorder: '報價、完工照片、發票' },
      { aspect: '結束的條件', incident: '對方接受處理結果才算結案', workorder: '完工並付款即結案' }
    ]
  };

  /* 可變狀態：這一頁的操作只活在記憶體，重新整理回到初始 */
  var state = {
    level: '全部',
    type: '全部',
    selected: 'INC-07',
    /* 事件 id → 本頁新增的異動 */
    patch: {}
  };

  function incidents() {
    return D.incidents.slice().sort(function (a, b) {
      var s = (a.status === '已結案' ? 1 : 0) - (b.status === '已結案' ? 1 : 0);
      if (s) return s;
      var l = EXTRA.levelOrder[levelOf(a)] - EXTRA.levelOrder[levelOf(b)];
      if (l) return l;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }
  function patchOf(id) { return state.patch[id] || (state.patch[id] = {}); }
  function levelOf(inc) { var p = state.patch[inc.id]; return (p && p.level) || inc.level; }
  function statusOf(inc) { var p = state.patch[inc.id]; return (p && p.status) || inc.status; }
  function assigneeOf(inc) { var p = state.patch[inc.id]; return (p && p.assigneeId) || inc.assigneeId; }
  function timelineOf(inc) {
    var p = state.patch[inc.id];
    return inc.timeline.concat((p && p.added) || []);
  }
  function filtered() {
    return incidents().filter(function (i) {
      if (state.level !== '全部' && levelOf(i) !== state.level) return false;
      if (state.type !== '全部' && i.type !== state.type) return false;
      return true;
    });
  }

  /* ---------------------------------------------------------------- KPI */
  function renderKpis() {
    var all = incidents();
    var open = all.filter(function (i) { return statusOf(i) !== '已結案'; });
    var urgent = open.filter(function (i) { return levelOf(i) === '緊急'; });
    var thisMonth = all.filter(function (i) { return i.createdAt.slice(0, 7) === D.currentMonth; });
    var closed = all.filter(function (i) { return statusOf(i) === '已結案'; });
    var days = closed.map(function (i) {
      var last = timelineOf(i)[timelineOf(i).length - 1];
      return A.daysBetween(i.createdAt.slice(0, 10), last.at.slice(0, 10));
    });
    var avg = days.length ? Math.round(days.reduce(function (a, b) { return a + b; }, 0) / days.length) : 0;

    document.getElementById('f12-kpis').innerHTML = [
      A.kpi({ label: '處理中事件', value: open.length, unit: ' 件', icon: 'flag', kind: open.length ? 'warn' : undefined, hint: '結案前都留在這裡' }),
      A.kpi({ label: '緊急', value: urgent.length, unit: ' 件', icon: 'alert', kind: urgent.length ? 'danger' : 'ok', hint: urgent.length ? '已通知值班人員' : '目前沒有緊急事件' }),
      A.kpi({ label: '本月新增', value: thisMonth.length, unit: ' 件', icon: 'calendar', hint: fmt.month(D.currentMonth) }),
      A.kpi({ label: '平均結案天數', value: avg, unit: ' 天', icon: 'clock', hint: '從通報到對方接受' })
    ].join('');
  }

  /* -------------------------------------------------------------- 警示條 */
  function renderAlert() {
    var urgent = incidents().filter(function (i) { return levelOf(i) === '緊急' && statusOf(i) !== '已結案'; });
    var host = document.getElementById('f12-alert');
    if (!urgent.length) { host.innerHTML = ''; return; }
    var i = urgent[0];
    host.innerHTML = A.alert('', 'danger', {
      title: '緊急事件處理中',
      html: '<p>' + esc(i.id + '　' + i.title) + '——' + esc(i.summary) + '</p>',
      action: '<button type="button" class="btn btn--sm btn--danger" data-open="' + esc(i.id) + '">查看事件</button>'
    });
  }

  /* -------------------------------------------------------------- 清單 */
  function renderList() {
    var rows = filtered();
    document.getElementById('f12-count').textContent = rows.length + ' 件';
    var host = document.getElementById('f12-items');
    if (!rows.length) {
      host.innerHTML = A.emptyState({
        sm: true, icon: 'flag', title: '這個條件下沒有事件',
        text: '換個等級或類型再看看。沒有事件是好事，代表這段期間沒有需要特別處理的狀況。'
      });
      return;
    }
    host.innerHTML = rows.map(function (i) {
      var unit = D.unit(i.unitId);
      var on = i.id === state.selected;
      return '<button type="button" class="f12-item' + (on ? ' is-active' : '') + '" data-open="' + esc(i.id) + '" aria-current="' + on + '">' +
        '<span class="f12-item-top">' +
          A.badge(levelOf(i), EXTRA.levelKind[levelOf(i)]) +
          '<span class="f12-item-id">' + esc(i.id) + '</span>' +
          A.badge(statusOf(i), EXTRA.statusKind[statusOf(i)] || 'neutral') +
        '</span>' +
        '<span class="f12-item-title">' + esc(i.title) + '</span>' +
        '<span class="f12-item-meta">' + esc(i.type) + '　·　' + esc(unit ? unit.region + ' ' + i.unitId : i.unitId) + '　·　' + esc(fmt.date(i.createdAt.slice(0, 10))) + '</span>' +
        '</button>';
    }).join('');
  }

  /* -------------------------------------------------------------- 詳情 */
  function renderDetail() {
    var inc = D.incident(state.selected);
    var host = document.getElementById('f12-detail');
    if (!inc) { host.innerHTML = A.emptyState({ icon: 'flag', title: '選一件事件查看', text: '左邊清單點一下，這裡會顯示完整的處理過程。' }); return; }

    var unit = D.unit(inc.unitId);
    var staff = D.staffById(assigneeOf(inc));
    var level = levelOf(inc), status = statusOf(inc);
    var closed = status === '已結案';
    var wo = inc.workOrderId ? D.workOrder(inc.workOrderId) : null;

    var head = '<div class="f12-detail-head">' +
      '<div class="f12-detail-badges">' + A.badge(level, EXTRA.levelKind[level], { lg: true }) + A.badge(status, EXTRA.statusKind[status] || 'neutral') + '<span class="f12-detail-id">' + esc(inc.id) + '</span></div>' +
      '<h2 class="f12-detail-title">' + esc(inc.title) + '</h2>' +
      '<p class="f12-detail-summary">' + esc(inc.summary) + '</p>' +
      '</div>';

    var facts = A.statRow([
      { label: '事件類型', value: inc.type },
      { label: '發生物件', value: (unit ? unit.region + ' ' : '') + inc.unitId + (inc.relatedUnitId ? '（波及 ' + inc.relatedUnitId + '）' : '') },
      { label: '通報時間', value: fmt.dateTime(inc.createdAt) },
      { label: '負責人', value: staff ? staff.name + '　' + staff.roleName : '尚未指派' }
    ], { divided: true });

    var actions = '<div class="f12-actions">' +
      (closed ? '' : '<button type="button" class="btn btn--primary btn--sm" data-act="note">加註處理紀錄</button>') +
      (closed ? '' : '<button type="button" class="btn btn--secondary btn--sm" data-act="assign">指派負責人</button>') +
      (closed ? '' : '<button type="button" class="btn btn--secondary btn--sm" data-act="level">調整等級</button>') +
      (closed ? '<button type="button" class="btn btn--secondary btn--sm" data-act="reopen">重新開啟</button>'
              : '<button type="button" class="btn btn--secondary btn--sm" data-act="close">結案</button>') +
      (wo ? '<a class="btn btn--ghost btn--sm" href="' + A.link('f07', 'app') + '">查看工單 ' + esc(wo.id) + ' ›</a>' : '') +
      '</div>';

    var photos = inc.photos && inc.photos.length
      ? '<div class="f12-photos">' + inc.photos.map(function (src, n) {
          return '<figure class="f12-photo"><img src="' + esc(src) + '" alt="' + esc(inc.id + ' 現場照片 ' + (n + 1)) + '" loading="lazy"><figcaption>' + esc(['通報照片', '勘查照片', '完工照片'][n] || ('照片 ' + (n + 1))) + '</figcaption></figure>';
        }).join('') + '</div>'
      : '<p class="muted small">這件事沒有照片。</p>';

    var chat = inc.chat && inc.chat.length
      ? '<div class="f12-chat">' + inc.chat.map(function (c) {
          var me = c.who.indexOf('○○') > 0;
          return '<div class="bubble-row bubble-row--' + (me ? 'me' : 'them') + '">' +
            '<div class="bubble bubble--' + (me ? 'me' : 'them') + '">' +
              '<span class="bubble-name">' + esc(c.who) + '</span>' + esc(c.text) +
              '<span class="bubble-meta">' + esc(fmt.dateTime(c.at)) + '</span>' +
            '</div></div>';
        }).join('') + '</div>'
      : '<p class="muted small">這件事沒有留下對話紀錄，處理過程都在右邊的時間軸。</p>';

    var tl = timelineOf(inc).map(function (t, n, arr) {
      var kind = n === 0 ? 'danger' : (n === arr.length - 1 ? (closed ? 'ok' : 'accent') : '');
      return { at: t.at, title: t.text, by: t.by, kind: kind || undefined, current: n === arr.length - 1 && !closed };
    });

    host.innerHTML = '<article class="card card--static f12-detail-card">' +
      head + facts + actions +
      '<div class="f12-detail-grid">' +
        '<section class="f12-block"><h3 class="f12-block-title">' + icon('image') + '現場照片</h3>' + photos + '</section>' +
        '<section class="f12-block"><h3 class="f12-block-title">' + icon('message') + '對話紀錄</h3>' + chat + '</section>' +
      '</div>' +
      '<section class="f12-block"><h3 class="f12-block-title">' + icon('clock') + '完整時間軸</h3>' + A.timeline(tl, { rawTime: false }) + '</section>' +
      '</article>';
  }

  function renderCompare() {
    document.getElementById('f12-compare-body').innerHTML =
      '<p class="muted f12-compare-lead">同樣是「有人回報有問題」，處理方式完全不同。把兩者分開管，緊急的才追得動，日常的才不會被淹沒。</p>' +
      A.table({
        columns: [
          { key: 'aspect', label: '比較項目' },
          { key: 'incident', label: '重大事件' },
          { key: 'workorder', label: '修繕工單' }
        ],
        rows: EXTRA.compare, className: 'f12-compare-table'
      });
  }

  function renderAll() { renderKpis(); renderAlert(); renderList(); renderDetail(); }

  /* -------------------------------------------------------------- 操作 */
  function addNote(inc, text, by) {
    var p = patchOf(inc.id);
    p.added = (p.added || []).concat([{ at: D.today + ' ' + nowClock(), text: text, by: by || '陳○○' }]);
  }
  var clockMin = 9 * 60 + 30;
  function nowClock() { clockMin += 7; var h = Math.floor(clockMin / 60), m = clockMin % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }

  function doAssign(inc) {
    var options = D.staff.filter(function (s) { return s.role === 'manager' || s.role === 'maintenance' || s.role === 'boss'; });
    var cur = assigneeOf(inc);
    A.modal({
      title: '指派負責人',
      body: '<p class="muted small">事件一定要有人負責，否則只會留在群組裡沒人動。</p>' +
        '<div class="f12-radio-list">' + options.map(function (s) {
          return '<label class="f12-radio"><input type="radio" name="f12-assignee" value="' + esc(s.id) + '"' + (s.id === cur ? ' checked' : '') + '>' +
            '<span><strong>' + esc(s.name) + '</strong><span class="muted small">　' + esc(s.roleName) + '　' + esc(s.phone) + '</span></span></label>';
        }).join('') + '</div>',
      actions: [
        { label: '取消', kind: 'secondary', close: true },
        { label: '指派', kind: 'primary', onClick: function (close) {
            var card = close.element;
            var sel = card.querySelector('input[name="f12-assignee"]:checked');
            if (!sel) { A.toast('請先選一位負責人', 'warn'); return false; }
            var s = D.staffById(sel.value);
            patchOf(inc.id).assigneeId = s.id;
            addNote(inc, '指派 ' + s.name + '（' + s.roleName + '）為負責人', '系統');
            A.toast('已指派給 ' + s.name, 'ok');
            renderAll();
          } }
      ]
    });
  }

  function doLevel(inc) {
    var cur = levelOf(inc);
    A.modal({
      title: '調整事件等級',
      body: '<p class="muted small">等級決定通知誰、多快通知。調高之後，逾時未處理會往上通知老闆。</p>' +
        '<div class="f12-radio-list">' + ['緊急', '重大', '一般'].map(function (lv) {
          var desc = { '緊急': '立即電話加 LINE 通知值班人員', '重大': '當日內通知租務管理員', '一般': '依排程處理，逾時才提醒' }[lv];
          return '<label class="f12-radio"><input type="radio" name="f12-level" value="' + esc(lv) + '"' + (lv === cur ? ' checked' : '') + '>' +
            '<span><strong>' + esc(lv) + '</strong><span class="muted small">　' + esc(desc) + '</span></span></label>';
        }).join('') + '</div>',
      actions: [
        { label: '取消', kind: 'secondary', close: true },
        { label: '更新等級', kind: 'primary', onClick: function (close) {
            var card = close.element;
            var sel = card.querySelector('input[name="f12-level"]:checked');
            if (!sel || sel.value === cur) { A.toast('等級沒有變更', 'neutral'); return; }
            patchOf(inc.id).level = sel.value;
            addNote(inc, '事件等級由「' + cur + '」調整為「' + sel.value + '」', '陳○○');
            A.toast('等級已改為 ' + sel.value, 'ok');
            renderAll();
          } }
      ]
    });
  }

  function doNote(inc) {
    A.modal({
      title: '加註處理紀錄',
      body: '<p class="muted small">每一筆都會留在時間軸上，日後要跟屋主或租客交代時拿得出來。</p>' +
        '<label class="field"><span class="field-hint">處理內容</span>' +
        '<textarea class="textarea" id="f12-note-text" rows="3" placeholder="例：已聯繫 B03 租客確認天花板乾燥，約定下週一油漆修復"></textarea></label>',
      actions: [
        { label: '取消', kind: 'secondary', close: true },
        { label: '新增紀錄', kind: 'primary', onClick: function (close) {
            var card = close.element;
            var t = card.querySelector('#f12-note-text');
            var v = (t && t.value || '').trim();
            if (!v) { A.toast('請先寫下處理內容', 'warn'); return false; }
            addNote(inc, v, '陳○○');
            A.toast('已加入時間軸', 'ok');
            renderAll();
          } }
      ]
    });
  }

  function doClose(inc) {
    A.confirm({
      title: '確定要結案嗎',
      text: '結案代表對方已接受處理結果。結案後這件事會從「處理中」移除，但紀錄與照片永久保留。'
    }).then(function (yes) {
      if (!yes) return;
      patchOf(inc.id).status = '已結案';
      addNote(inc, '對方確認處理結果，事件結案', '陳○○');
      A.toast(inc.id + ' 已結案', 'ok');
      renderAll();
    });
  }

  function doReopen(inc) {
    patchOf(inc.id).status = '處理中';
    addNote(inc, '同樣狀況再次發生，事件重新開啟', '陳○○');
    A.toast(inc.id + ' 已重新開啟', 'warn');
    renderAll();
  }

  function doNew() {
    A.modal({
      title: '建立事件',
      body: '<p class="muted small">通常由租客 LINE 通報後由系統自動建立；這裡示範管理員手動建立。</p>' +
        '<label class="field"><span class="field-hint">事件類型</span><select class="select" id="f12-new-type">' +
          D.incidentTypes.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span class="field-hint">發生物件</span><input class="input" id="f12-new-unit" value="B08" placeholder="例：B08"></label>' +
        '<label class="field"><span class="field-hint">簡述</span><input class="input" id="f12-new-desc" placeholder="例：住戶反映夜間有異味"></label>',
      actions: [
        { label: '取消', kind: 'secondary', close: true },
        { label: '建立', kind: 'primary', onClick: function () {
            A.toast('示範用畫面，這裡不會真的建立事件', 'neutral');
          } }
      ]
    });
  }

  /* -------------------------------------------------------------- 綁定 */
  function bind() {
    document.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open]');
      if (open) { state.selected = open.getAttribute('data-open'); renderList(); renderDetail(); document.getElementById('f12-detail').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }

      var tab = e.target.closest('#f12-level-tabs .tab');
      if (tab) { state.level = tab.getAttribute('data-tab'); renderLevelTabs(); renderList(); return; }

      var act = e.target.closest('[data-act]');
      if (act) {
        var inc = D.incident(state.selected);
        if (!inc) return;
        var a = act.getAttribute('data-act');
        if (a === 'assign') doAssign(inc);
        else if (a === 'level') doLevel(inc);
        else if (a === 'note') doNote(inc);
        else if (a === 'close') doClose(inc);
        else if (a === 'reopen') doReopen(inc);
        return;
      }
      if (e.target.closest('#f12-new')) doNew();
    });
    document.getElementById('f12-type').addEventListener('change', function (e) {
      state.type = e.target.value; renderList();
    });
  }

  function renderLevelTabs() {
    var all = incidents();
    var counts = { '全部': all.length };
    ['緊急', '重大', '一般'].forEach(function (lv) {
      counts[lv] = all.filter(function (i) { return levelOf(i) === lv; }).length;
    });
    document.getElementById('f12-level-tabs').innerHTML = ['全部', '緊急', '重大', '一般'].map(function (lv) {
      var on = state.level === lv;
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-tab="' + esc(lv) + '">' +
        '<span>' + esc(lv) + '</span><span class="f12-tab-n">' + counts[lv] + '</span></button>';
    }).join('');
  }

  function init() {
    renderLevelTabs();
    document.getElementById('f12-type').innerHTML = ['全部'].concat(D.incidentTypes).map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t === '全部' ? '所有類型' : t) + '</option>';
    }).join('');
    renderCompare();
    renderAll();
    bind();
    A.reveal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
