/* js/tours/f18.js — 待辦與員工績效（f18）功能導覽 7 步
 * 主角：陳○○ 20 件待辦、逾期 3 件 → 指派 → 完成 → 統計同步。
 */
(function () {
  'use strict';
  var A = window.App, D = window.DB, TP = window.TourPlayer;
  if (!A || !D || !TP) return;
  var esc = A.esc, icon = A.icon;

  var MGR = D.staffById('S02'), MGR2 = D.staffById('S03');
  var OVERDUE = D.todos.filter(function (t) { return t.overdue; });

  function card(title, inner, attr) { return '<div class="ts-card"' + (attr || '') + '><h4>' + title + '</h4>' + inner + '</div>'; }
  function wrap(i) { return '<div class="ts">' + i + '</div>'; }
  function kpi(label, value, hint, kind, id) {
    return '<div class="ts-kpi' + (kind ? ' ts-kpi--' + kind : '') + '" data-kpi="' + (id || '') + '">' +
      '<span class="ts-kpi-label">' + esc(label) + '</span>' +
      '<span class="ts-kpi-value"><span data-count="' + (id || '') + '">' + value + '</span><small> 件</small></span>' +
      '<span class="ts-kpi-hint">' + esc(hint) + '</span></div>';
  }
  function todoItem(t, opts) {
    opts = opts || {};
    var s = D.staffById(t.assigneeId);
    return '<li class="ts-item' + (opts.bad ? ' is-bad' : '') + (opts.good ? ' is-good' : '') + '"' + (opts.id ? ' data-todo="' + opts.id + '"' : '') + '>' +
      '<span class="ts-item-main"><b>' + esc(t.title) + '</b><small>' + esc((s ? s.name : '未指派') + '　期限 ' + t.due.slice(5).replace('-', '/')) + '</small></span>' +
      '<span class="ts-item-side">' + (opts.sideHtml !== undefined ? opts.sideHtml : (t.overdue ? '逾期 ' + t.overdueDays + ' 天' : '')) + '</span></li>';
  }

  var STEPS = [
    {
      title: '事情散在群組裡',
      text: '沒有系統的時候，待辦都在 LINE 群組。訊息往下捲就不見了，最後誰也不知道誰在處理。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-split">' +
          '<div class="ts-phone" data-card="p"><div class="ts-phone-bar">LINE · 租務群組</div><div class="ts-phone-body">' +
            '<div class="ts-msg ts-msg--them"><span class="ts-msg-who">老闆</span>D11 的押金結算好了嗎</div>' +
            '<div class="ts-msg ts-msg--me">我今天比較忙，明天處理</div>' +
            '<div class="ts-msg ts-msg--them"><span class="ts-msg-who">會計</span>C08 的租金要不要調？</div>' +
            '<div class="ts-msg ts-msg--them"><span class="ts-msg-who">老闆</span>（三天後）D11 押金呢</div>' +
          '</div></div>' +
          card(icon('alert') + '問題不是不認真',
            '<p class="ts-hint">是沒有人被指定負責、沒有期限、也沒有地方看得到「還有什麼沒做完」。訊息一多就沉下去了。</p>', ' data-card="h"') + '</div>');
        api.enter('[data-card="p"]');
        return api.wait(400).then(function () { return api.enter('[data-card="h"]'); });
      }
    },
    {
      title: '每件事都有人、有期限',
      text: '系統裡每一件待辦都綁一個負責人與一個日期。沒有期限的事，等於沒有人會做。',
      render: function (stage, api) {
        stage.innerHTML = wrap(card(icon('list') + '待辦清單<span class="ts-right">全公司 ' + D.todos.filter(function (t) { return t.status !== '完成'; }).length + ' 件</span>',
          '<ul class="ts-list">' + D.todos.slice(0, 5).map(function (t, i) { return todoItem(t, { id: i }); }).join('') + '</ul>', ' data-card="l"'));
        return api.enter('[data-card="l"] .ts-item');
      }
    },
    {
      title: '逾期的自己會跳出來',
      text: '期限過了還沒完成，系統標紅並排到最前面。今天有 3 件在陳○○手上、1 件在會計手上。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">' +
            kpi('未完成待辦', D.todos.filter(function (t) { return t.status !== '完成'; }).length, '全公司', '', 'open') +
            kpi('已逾期', 0, '需要今天處理', 'danger', 'od') +
            kpi('7 天內到期', 15, '提前安排才不會變逾期', '', 'soon') +
          '</div>' +
          card(icon('alert') + '已逾期',
            '<ul class="ts-list">' + OVERDUE.map(function (t, i) { return todoItem(t, { bad: true, id: 'od' + i }); }).join('') + '</ul>', ' data-card="o"'));
        api.enter('[data-kpi]');
        return api.wait(400)
          .then(function () { return api.count('[data-count="od"]', 0, OVERDUE.length, 700); })
          .then(function () { return api.enter('[data-card="o"] .ts-item'); });
      }
    },
    {
      title: '誰手上壓最多，一眼看出',
      text: '陳○○ 手上 20 件、逾期 3 件；劉○○ 只有 12 件、沒有逾期。這不是考績，是看哪裡塞住了。',
      render: function (stage, api) {
        var rows = D.performance.byStaff;
        var max = Math.max.apply(null, rows.map(function (r) { return r.open; }));
        stage.innerHTML = wrap(card(icon('users') + '每個人手上壓了幾件<span class="ts-right">紅色是逾期</span>',
          '<div class="ts-bars">' + rows.map(function (r, i) {
            return '<div class="ts-bar-row"><span><b>' + esc(r.name) + '</b><br><small style="color:var(--ink-3)">' + esc(r.role) + '</small></span>' +
              '<span class="ts-bar"><span data-bar="' + i + '" style="width:0%"></span></span>' +
              '<span class="ts-bar-num">' + r.open + (r.overdue ? '<br><small style="color:var(--danger)">逾期 ' + r.overdue + '</small>' : '') + '</span></div>';
          }).join('') + '</div>', ' data-card="b"'));
        api.enter('[data-card="b"]');
        return api.wait(500).then(function () {
          rows.forEach(function (r, i) {
            var el = stage.querySelector('[data-bar="' + i + '"]');
            if (el) { el.style.width = Math.round(r.open / max * 100) + '%'; if (r.overdue) el.classList.add('is-bad'); }
          });
          return api.wait(700);
        });
      }
    },
    {
      title: '塞住了就換手',
      text: '押金結算已經逾期 16 天。老闆看到後把它轉給比較有空的劉○○，並把期限訂在明天。',
      render: function (stage, api) {
        var t = OVERDUE[0];
        stage.innerHTML = wrap('<div class="ts-split">' +
          card(icon('user') + '改負責人與期限',
            '<p class="ts-hint">' + esc(t.title) + '</p>' +
            '<div class="ts-row"><span>原負責人</span><span class="ts-strike">' + esc(MGR.name) + '</span></div>' +
            '<div class="ts-row"><span>改為</span><span data-badge="who" class="badge">選擇中</span></div>' +
            '<div class="ts-row"><span>期限</span><span data-badge="due" class="badge">2026/09/05</span></div>', ' data-card="e"') +
          card(icon('check-circle') + '調整後',
            '<ul class="ts-list"><li class="ts-item is-good" data-todo="done">' +
            '<span class="ts-item-main"><b>' + esc(t.title) + '</b><small>' + esc(MGR2.name) + '　期限 09/22</small></span>' +
            '<span class="ts-item-side">已重新指派</span></li></ul>', ' data-card="r"'));
        api.enter('[data-card="e"]');
        return api.wait(600)
          .then(function () { return api.badge('[data-badge="who"]', MGR2.name + '（租務管理員）', 'accent'); })
          .then(function () { return api.badge('[data-badge="due"]', '2026/09/22', 'ok'); })
          .then(function () { return api.enter('[data-card="r"]'); });
      }
    },
    {
      title: '做完打勾，數字跟著動',
      text: '劉○○ 當天完成並標記完成。逾期件數從 4 降到 3，本月完成數加一——不用另外填報表。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:18px">' +
            kpi('未完成待辦', 24, '全公司', '', 'open') +
            kpi('已逾期', 4, '需要今天處理', 'danger', 'od') +
            kpi('本月完成', 51, '2026 年 9 月', 'ok', 'done') +
          '</div>' +
          card(icon('check') + '押金結算：D11',
            '<ul class="ts-list"><li class="ts-item is-good" data-todo="x">' +
            '<span class="ts-item-main"><b>押金結算：D11 退租已 45 天</b><small>' + esc(MGR2.name) + '　完成於今天</small></span>' +
            '<span class="ts-item-side"><span class="badge" data-badge="st">進行中</span></span></li></ul>', ' data-card="c"'));
        api.enter('[data-card="c"]');
        return api.wait(500)
          .then(function () { return api.badge('[data-badge="st"]', '完成', 'ok'); })
          .then(function () { return api.count('[data-count="od"]', 4, 3, 600); })
          .then(function () { return api.count('[data-count="open"]', 24, 23, 400); })
          .then(function () { return api.count('[data-count="done"]', 51, 52, 400); });
      }
    },
    {
      title: '目的不是盯人',
      text: '是讓事情有人接手、有期限、做完會被記得。100 間以上的規模，靠記性一定會掉東西。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-result" data-card="res">' +
          '<div class="ts-result-icon">' + icon('check-circle') + '</div>' +
          '<h3>沒有一件事只留在群組裡</h3>' +
          '<p>每件待辦都有負責人與期限，逾期會被標紅並往上提醒。本月已完成 <span data-count="m">0</span> 件，逾期 <span data-count="o2">0</span> 件。</p>' +
          '<div class="ts-result-stats">' +
            '<div><strong>100%</strong><span>有負責人</span></div>' +
            '<div><strong>100%</strong><span>有期限</span></div>' +
          '</div></div>');
        api.enter('[data-card="res"]');
        return api.wait(500)
          .then(function () { return api.count('[data-count="m"]', 0, 52, 700); })
          .then(function () { return api.count('[data-count="o2"]', 0, 3, 500); });
      }
    }
  ];

  function start() {
    var host = document.getElementById('player');
    if (host) TP.mount(host, { feature: 'f18', autoplayMs: 4800, steps: STEPS });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
