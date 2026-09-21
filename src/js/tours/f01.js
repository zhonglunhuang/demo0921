/* js/tours/f01.js — f01 上游租約與到期風險（功能導覽，8 步）
 * 契約：docs/DESIGN.md §4（TourPlayer）、§5（假資料）、§6（文案）。
 * 流程：新增上游租約 → 系統自動比對下游租約 → 出現風險警示 → 一鍵建立續租通知待辦 → 續約完成、風險解除。
 * 只讀 window.DB；畫面元素用 window.App 的共用元件組出來。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D || !window.TourPlayer) return;

  var esc = A.esc;
  var icon = A.icon;
  var fmt = A.fmt;

  /* ---------------------------------------------------------------- 這條導覽的主角資料 */
  var U = D.unit('A03');
  var OWNER = D.ownerOf('A03');
  var TENANT = D.tenantOf('A03');
  var STAFF = D.staffById('S02');

  var F = {
    unitId: U.id,
    place: U.region + ' ' + U.building + ' 棟 · ' + U.type + ' ' + fmt.ping(U.ping),
    owner: OWNER.name,
    ownerPhone: OWNER.phone,
    tenant: TENANT ? TENANT.name : '許○○',
    staff: STAFF ? STAFF.name : '陳○○',
    upStart: U.upstream.start,
    upEnd: U.upstream.end,                       /* 2026-11-30 */
    dnStart: U.downstream.start,
    dnEnd: U.downstream.end,                     /* 2027-06-30 */
    ownerRent: U.ownerRent,
    deposit: U.upstream.deposit,
    payDay: U.upstream.payDay,
    notice: U.upstream.renewNoticeDate,          /* 2026-10-01 */
    renewedEnd: '2029-11-30',                    /* 續約 3 年後的新到期日 */
    total: D.units.length
  };
  F.gapDays = A.daysBetween(F.upEnd, F.dnEnd);   /* 212 天 */

  /* 續租待辦沿用 DB 裡那一件，讓導覽與操作頁的標題、期限完全一致 */
  var RENEW_TASK = D.todos.filter(function (t) { return t.kind === 'lease' && t.unitId === F.unitId; })[0] ||
    { title: '續租通知：' + F.unitId + ' 上游租約 ' + fmt.date(F.upEnd) + ' 到期', due: F.notice, status: '待處理' };

  /* 風險與到期數字：加進 A03 之前／之後／續約之後 */
  var COUNT = { riskBefore: 2, riskAfter: 3, expBefore: 0, expAfter: 1 };

  /* ---------------------------------------------------------------- 共用畫面片段 */
  function head(title, sub) {
    return '<div class="f01-stage-head"><h2>' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }

  function field(label, value, cls) {
    return '<div class="field"><label>' + esc(label) + '</label>' +
      '<div class="f01-input' + (cls ? ' ' + cls : '') + '">' + esc(value) + '</div></div>';
  }

  /* 兩份租約並列時間軸；upEnd 可換成續約後的日期，axisMax 固定軸的右界好做動畫 */
  function gantt(upEnd, axisMax) {
    var t0 = A.addDays(F.upStart < F.dnStart ? F.upStart : F.dnStart, -45);
    var maxEnd = axisMax || (upEnd > F.dnEnd ? upEnd : F.dnEnd);
    var t1 = A.addDays(maxEnd, 45);
    var span = A.daysBetween(t0, t1) || 1;
    function pos(iso) { return Math.max(0, Math.min(100, (A.daysBetween(t0, iso) / span) * 100)); }
    var today = pos(A.today);
    var upL = pos(F.upStart), upR = pos(upEnd);
    var dnL = pos(F.dnStart), dnR = pos(F.dnEnd);
    var gap = upEnd < F.dnEnd
      ? '<div class="f01-gap" data-gap style="left:' + upR.toFixed(2) + '%;width:' + (dnR - upR).toFixed(2) + '%"><span>空窗 ' + fmt.num(A.daysBetween(upEnd, F.dnEnd)) + ' 天</span></div>'
      : '';
    var ticks = '';
    for (var y = +t0.slice(0, 4) + 1; y <= +t1.slice(0, 4); y++) {
      var yp = pos(y + '-01-01');
      if (Math.abs(yp - today) < 11) continue;
      ticks += '<span style="left:' + yp.toFixed(2) + '%">' + y + '</span>';
    }
    ticks += '<span class="is-today" style="left:' + today.toFixed(2) + '%">今天</span>';

    return '<div class="f01-gantt">' +
      '<div>' +
        '<div class="f01-lease-head"><span class="f01-lease-name f01-lease-name--up">上游租約（屋主 ' + esc(F.owner) + ' → 公司）</span>' +
        '<span class="f01-lease-range" data-up-range>' + fmt.date(F.upStart) + ' — ' + fmt.date(upEnd) + '</span></div>' +
        '<div class="f01-track">' + gap +
          '<div class="f01-bar f01-bar--up" data-up-bar style="left:' + upL.toFixed(2) + '%;width:' + (upR - upL).toFixed(2) + '%"></div>' +
          '<div class="f01-today" style="left:' + today.toFixed(2) + '%"></div></div>' +
      '</div>' +
      '<div>' +
        '<div class="f01-lease-head"><span class="f01-lease-name f01-lease-name--down">下游租約（公司 → 租客 ' + esc(F.tenant) + '）</span>' +
        '<span class="f01-lease-range">' + fmt.date(F.dnStart) + ' — ' + fmt.date(F.dnEnd) + '</span></div>' +
        '<div class="f01-track"><div class="f01-bar f01-bar--down" style="left:' + dnL.toFixed(2) + '%;width:' + (dnR - dnL).toFixed(2) + '%"></div>' +
          '<div class="f01-today" style="left:' + today.toFixed(2) + '%"></div></div>' +
      '</div>' +
      '<div class="f01-axis">' + ticks + '</div>' +
      '</div>';
  }
  /* 讓步驟 8 能把上游長條畫到續約後的位置 */
  gantt.posOf = function (iso, upEnd, axisMax) {
    var t0 = A.addDays(F.upStart < F.dnStart ? F.upStart : F.dnStart, -45);
    var maxEnd = axisMax || (upEnd > F.dnEnd ? upEnd : F.dnEnd);
    var t1 = A.addDays(maxEnd, 45);
    var span = A.daysBetween(t0, t1) || 1;
    return Math.max(0, Math.min(100, (A.daysBetween(t0, iso) / span) * 100));
  };

  function matchRow(text) {
    return '<div class="f01-match-row"><span class="check-box">' + icon('check') + '</span>' +
      '<span>' + esc(text) + '</span><b></b></div>';
  }

  function taskCard() {
    return '<div class="card"><div class="card-head"><div class="card-title">' + icon('bell') + 'AI 工作中心 · 今天要處理</div>' +
      A.badge('7 件', 'accent') + '</div>' +
      '<div class="f01-task" data-task>' +
        '<span class="icon-circle icon-circle--warn">' + icon('bell') + '</span>' +
        '<div class="f01-task-body"><div class="f01-task-title">' + esc(RENEW_TASK.title) + '</div>' +
        '<div class="f01-task-meta">負責人 ' + esc(F.staff) + ' · 期限 ' + fmt.date(RENEW_TASK.due) + ' · 物件 ' + esc(F.unitId) + ' · 系統自動建立</div></div>' +
        '<span class="badge badge--warn" data-task-badge>' + esc(RENEW_TASK.status) + '</span></div>' +
      '<div class="f01-task is-muted">' +
        '<span class="icon-circle icon-circle--neutral">' + icon('wallet') + '</span>' +
        '<div class="f01-task-body"><div class="f01-task-title">退租押金尚未結算：D11</div>' +
        '<div class="f01-task-meta">負責人 ' + esc(F.staff) + ' · 期限 2026/09/05 · 物件 D11</div></div>' +
        A.badge('逾期', 'danger') + '</div>' +
      '<div class="f01-task is-muted">' +
        '<span class="icon-circle icon-circle--neutral">' + icon('door') + '</span>' +
        '<div class="f01-task-body"><div class="f01-task-title">空房超過 14 天：C08</div>' +
        '<div class="f01-task-meta">負責人 ' + esc(F.staff) + ' · 期限 2026/09/12 · 物件 C08</div></div>' +
        A.badge('進行中', 'warn') + '</div>' +
      '</div>';
  }

  function kpiRow(risk, exp) {
    return '<div class="grid grid--3">' +
      A.kpi({ label: '上游租約', value: fmt.num(F.total), unit: ' 份', icon: 'file', hint: '涵蓋全部 ' + fmt.num(F.total) + ' 間物件' }) +
      A.kpi({ label: '到期風險', valueHtml: '<span data-k-risk>' + fmt.num(risk) + '</span>', unit: ' 間', icon: 'alert', kind: 'danger', hint: '上游比下游先到期，租客還在住' }) +
      A.kpi({ label: '90 天內到期', valueHtml: '<span data-k-exp>' + fmt.num(exp) + '</span>', unit: ' 份', icon: 'calendar', kind: 'warn', hint: '要先跟屋主談續約的合約' }) +
      '</div>';
  }

  var RISK_SENTENCE = '上游租約 ' + fmt.date(F.upEnd) + ' 到期，房客租約到 ' + fmt.date(F.dnEnd) + '，仍有房客在租';

  /* ---------------------------------------------------------------- 步驟 */
  var steps = [
    {
      title: '新增上游租約',
      text: '管理員把屋主資料和租期輸進系統。這一步只做一次，之後所有提醒都從這裡長出來。',
      render: function (stage) {
        stage.innerHTML = head('新增上游租約', '物件 ' + F.unitId + ' · ' + F.place) +
          '<div class="card">' +
            '<div class="card-head"><div class="card-title">' + icon('file-plus') + '上游租約（屋主 → 公司）</div></div>' +
            '<div class="f01-form">' +
              field('物件編號', F.unitId) +
              field('屋主', F.owner) +
              field('屋主聯絡電話', F.ownerPhone) +
              field('每月付屋主租金', fmt.money(F.ownerRent)) +
              field('租期起', fmt.date(F.upStart)) +
              '<div class="field"><label>租期迄</label><div class="f01-input f01-input--filled" data-end></div></div>' +
              field('押金', fmt.money(F.deposit)) +
              field('付款日', '每月 ' + F.payDay + ' 日') +
              field('修繕責任', '結構與管線由屋主負責') +
            '</div>' +
            '<div class="f01-form-actions"><button type="button" class="btn btn--primary" data-save>' + icon('check') + '<span>儲存租約</span></button></div>' +
          '</div>';
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('.card'))
          .then(function () { return api.type('[data-end]', fmt.date(F.upEnd), 900); })
          .then(function () { return api.cursor(stage.querySelector('[data-save]')); });
      }
    },
    {
      title: '系統自動比對下游',
      text: '按下儲存，系統立刻去對這間房的租客合約，不用人工翻資料夾。',
      render: function (stage) {
        stage.innerHTML = head('系統自動比對', '儲存後 1 秒內完成') +
          '<div class="card">' +
            '<div class="card-head"><div class="card-title">' + icon('refresh') + '比對 ' + esc(F.unitId) + ' 的兩份租約</div>' +
              A.badge('比對中', 'accent', { dot: true }) + '</div>' +
            '<div class="f01-match">' +
              matchRow('讀取 ' + F.unitId + ' 的下游租約') +
              matchRow('比對上游與下游的到期日') +
              matchRow('確認到期後是否仍有租客在住') +
            '</div>' +
          '</div>';
      },
      after: function (stage, api) {
        var rows = stage.querySelectorAll('.f01-match-row');
        var answers = ['租客 ' + F.tenant, '上游早 ' + fmt.num(F.gapDays) + ' 天', '是，住到 ' + fmt.date(F.dnEnd)];
        return api.enter(stage.querySelector('.card'))
          .then(function () { return api.check(rows[0]); })
          .then(function () { return api.type(rows[0].querySelector('b'), answers[0], 300); })
          .then(function () { return api.check(rows[1]); })
          .then(function () { return api.type(rows[1].querySelector('b'), answers[1], 300); })
          .then(function () { return api.check(rows[2]); })
          .then(function () { return api.type(rows[2].querySelector('b'), answers[2], 300); })
          .then(function () { return api.badge(stage.querySelector('.card-head .badge'), '比對完成', 'ok'); });
      }
    },
    {
      title: '發現先到期風險',
      text: '屋主的約先結束，租客卻還住著。系統當場把這間房標成紅色。',
      render: function (stage) {
        stage.innerHTML = head('比對結果', '物件 ' + F.unitId) +
          '<div class="grid grid--2">' +
            '<div class="card"><div class="card-head"><div class="card-title">上游租約</div>' +
              '<span class="badge badge--neutral" data-up-badge>檢查中</span></div>' +
              '<div class="card-body"><p class="muted">屋主 ' + esc(F.owner) + ' → 公司</p>' +
              '<p class="stat-row"><span class="stat"><span class="stat-label">到期日</span><span class="stat-value">' + fmt.date(F.upEnd) + '</span></span></p></div></div>' +
            '<div class="card"><div class="card-head"><div class="card-title">下游租約</div>' +
              A.badge('正常', 'neutral') + '</div>' +
              '<div class="card-body"><p class="muted">公司 → 租客 ' + esc(F.tenant) + '</p>' +
              '<p class="stat-row"><span class="stat"><span class="stat-label">到期日</span><span class="stat-value">' + fmt.date(F.dnEnd) + '</span></span></p></div></div>' +
          '</div>' +
          '<div class="mt-24">' +
            '<div class="alert alert--danger" role="alert">' + icon('alert') +
            '<div class="alert-body"><span class="alert-title" data-risk-title></span>' +
            '<p>中間有 ' + fmt.num(F.gapDays) + ' 天沒有上游租約。請在 ' + fmt.date(F.notice) + ' 前跟屋主談續約。</p></div></div>' +
          '</div>';
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('.card'))
          .then(function () { return api.badge(stage.querySelector('[data-up-badge]'), '先到期', 'danger'); })
          .then(function () { return api.enter(stage.querySelector('.alert')); })
          .then(function () { return api.type('[data-risk-title]', RISK_SENTENCE, 1400); });
      }
    },
    {
      title: '風險數字立刻更新',
      text: '首頁的風險數字從 2 變成 3。老闆不用一份一份翻，一眼知道有幾間要處理。',
      render: function (stage) {
        stage.innerHTML = head('上游租約與到期風險', '租務中樞 · 今天 ' + fmt.date(A.today)) +
          kpiRow(COUNT.riskBefore, COUNT.expBefore) +
          '<div class="mt-24">' +
            '<div class="alert alert--danger" role="alert">' + icon('alert') +
            '<div class="alert-body"><span class="alert-title">有 3 間物件的上游租約比下游先到期</span>' +
            '<p>A03、B07、C12 的屋主合約會在租客搬走前先結束。先跟屋主談好續約，才不會被迫請租客提前搬家。</p></div></div>' +
          '</div>';
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('.kpi'))
          .then(function () { return api.count('[data-k-risk]', COUNT.riskBefore, COUNT.riskAfter, 900); })
          .then(function () { return api.count('[data-k-exp]', COUNT.expBefore, COUNT.expAfter, 700); })
          .then(function () { return api.highlight(stage.querySelectorAll('.kpi')[1]); });
      }
    },
    {
      title: '兩份租約並列看',
      text: '兩份合約畫在同一條時間軸上，紅色那段就是沒有上游租約、租客卻還在住的 ' + F.gapDays + ' 天。',
      render: function (stage) {
        stage.innerHTML = head(F.unitId + ' 物件詳情', F.place) +
          '<div class="card">' +
            '<div class="card-head"><div class="card-title">兩份租約並列</div>' + A.badge('先到期', 'danger', { dot: true }) + '</div>' +
            gantt(F.upEnd) +
            '<p class="f01-gantt-note mt-16">紅色是空窗期：上游租約到期後，還有 ' + fmt.num(F.gapDays) + ' 天租客住在裡面。</p>' +
          '</div>';
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('.card'))
          .then(function () { return api.highlight(stage.querySelector('[data-gap]')); });
      }
    },
    {
      title: '一鍵建立續租待辦',
      text: '按一下就把「找屋主談續約」排成待辦，指定負責人和期限，不會忘記。',
      render: function (stage) {
        stage.innerHTML = head('續租處理', '物件 ' + F.unitId + ' · 屋主 ' + F.owner) +
          '<div class="grid grid--2">' +
            '<div class="card"><div class="card-head"><div class="card-title">續租處理進度</div></div>' +
              A.timeline([
                { title: '建立續租待辦', text: '到期前 60 天自動開一件待辦，指定負責人與期限', kind: 'accent', current: true },
                { title: '聯繫屋主', text: '租務管理員找屋主確認要不要續約' },
                { title: '記錄屋主回覆', text: '把屋主的決定記下來，系統同步更新上游租約' },
                { title: '完成續約', text: '上游到期日延後，先到期的風險解除' }
              ]) + '</div>' +
            '<div class="card"><div class="card-head"><div class="card-title">' + icon('user') + '屋主 ' + esc(F.owner) + '</div></div>' +
              '<div class="card-body"><p class="muted">' + esc(F.ownerPhone) + ' · 名下 ' + fmt.num(OWNER.unitIds.length) + ' 間物件</p>' +
              '<p>續租通知日 ' + fmt.date(F.notice) + '，距離上游到期還有 ' + fmt.num(A.daysBetween(A.today, F.upEnd)) + ' 天。</p></div>' +
              '<div class="card-foot"><button type="button" class="btn btn--primary btn--block" data-make>' + icon('file-plus') + '<span>建立續租待辦</span></button></div>' +
            '</div>' +
          '</div>';
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('.card'))
          .then(function () { return api.cursor(stage.querySelector('[data-make]')); })
          .then(function () { return api.highlight(stage.querySelector('[data-make]')); });
      }
    },
    {
      title: '待辦進入工作中心',
      text: '待辦同步出現在 AI 工作中心，' + F.staff + ' 每天打開就看到，期限 ' + fmt.date(RENEW_TASK.due) + '。',
      render: function (stage) {
        stage.innerHTML = head('AI 工作中心', '今天需要人工處理的事') + taskCard();
      },
      after: function (stage, api) {
        return api.enter(stage.querySelector('.card'))
          .then(function () { return api.enter(stage.querySelector('[data-task]')); })
          .then(function () { return api.highlight(stage.querySelector('[data-task]')); });
      }
    },
    {
      title: '續約完成，風險解除',
      text: '屋主同意續約 3 年，上游延到 ' + fmt.date(F.renewedEnd) + '。紅色警示消失，風險數字回到 2。',
      render: function (stage) {
        stage.innerHTML = head(F.unitId + ' 續約完成', '屋主 ' + F.owner + ' 同意續約 3 年') +
          '<div class="card">' +
            '<div class="card-head"><div class="card-title">兩份租約並列</div>' +
              '<span class="badge badge--danger badge--dot" data-state>先到期</span></div>' +
            gantt(F.upEnd, F.renewedEnd) +
            '<p class="f01-gantt-note mt-16" data-note>紅色是空窗期：上游租約到期後，還有 ' + fmt.num(F.gapDays) + ' 天租客住在裡面。</p>' +
          '</div>' +
          '<div class="mt-16">' + kpiRow(COUNT.riskAfter, COUNT.expAfter) + '</div>';
      },
      after: function (stage, api) {
        var bar = stage.querySelector('[data-up-bar]');
        var gap = stage.querySelector('[data-gap]');
        var range = stage.querySelector('[data-up-range]');
        var left = gantt.posOf(F.upStart, F.upEnd, F.renewedEnd);
        var right = gantt.posOf(F.renewedEnd, F.upEnd, F.renewedEnd);
        return api.enter(stage.querySelector('.card'))
          .then(function () { return api.wait(300); })
          .then(function () {
            if (bar) bar.style.width = (right - left).toFixed(2) + '%';
            if (gap) gap.classList.add('is-cleared');
            if (range) range.textContent = fmt.date(F.upStart) + ' — ' + fmt.date(F.renewedEnd);
            return api.wait(700);
          })
          .then(function () {
            var note = stage.querySelector('[data-note]');
            if (note) note.textContent = '上游租約比租客租約晚 ' + fmt.num(A.daysBetween(F.dnEnd, F.renewedEnd)) + ' 天到期，到期順序正常。';
            return api.badge(stage.querySelector('[data-state]'), '已續約', 'ok');
          })
          .then(function () { return api.count('[data-k-risk]', COUNT.riskAfter, COUNT.riskBefore, 800); })
          .then(function () { return api.count('[data-k-exp]', COUNT.expAfter, COUNT.expBefore, 600); });
      }
    }
  ];

  var player = window.TourPlayer.mount(document.getElementById('player'), {
    feature: 'f01',
    autoplayMs: 5200,
    stageHeight: 510,
    steps: steps
  });

  /* 網址加 #step=3 或 #step=last 可以直接停在某一步（驗收與截圖用） */
  (function () {
    if (!player) return;
    var m = /(?:^|[#&])step=([^&]*)/.exec(window.location.hash || '');
    if (!m) return;
    var raw = decodeURIComponent(m[1] || '');
    var i = raw === 'last' ? player.length - 1 : parseInt(raw, 10) - 1;
    if (!isFinite(i)) return;
    function apply() { player.pause(); player.go(i); player.pause(); }
    apply();
    setTimeout(apply, 1200);
  })();
})();
