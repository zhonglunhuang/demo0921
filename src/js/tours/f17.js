/* f17.js（tours）— 自動產生文件的功能導覽，6 步。
 * 契約：docs/DESIGN.md §4（TourPlayer.mount）、票 DEMO-02 的導覽流程 3。
 * 流程：選文件類型 → 選租客 → 欄位自動帶入 → 系統核對 → 用 LINE 傳送 → 租客簽回歸檔。
 * 資料全部來自 window.DB，只讀不改。 */
(function () {
  'use strict';

  var A = window.App, D = window.DB, P = window.TourPlayer;
  var host = document.getElementById('player');
  if (!A || !D || !P || !host) return;
  var esc = A.esc, fmt = A.fmt, icon = A.icon;

  /* ------------------------------------------------------------------ 這條導覽用到的資料 */
  var UNIT = D.unit('A01');
  var TENANT = D.tenantOf('A01');
  var ADDR = D.company.buildings[UNIT.building].address + ' ' + UNIT.id + ' 室';
  var OLD_END = UNIT.downstream.end;                       /* 2027-03-31 */
  var NEW_START = A.addDays(OLD_END, 1);
  var NEW_END = A.addDays(addMonths(NEW_START, 12), -1);
  var DOC = D.docHistory.filter(function (h) { return h.unitId === 'A01' && h.type === 'renew'; })[0];
  var REPLY = D.notifications.filter(function (n) { return n.unitId === 'A01' && n.type === '續約'; })[0];

  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function addMonths(iso, n) {
    var d = A.parseDate(iso);
    if (!d) return '';
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function range(a, b) { return fmt.date(a) + ' 至 ' + fmt.date(b); }

  /* 續約作業中的租客：A01 排第一，其餘取下游租約最早到期的四間 */
  var ROWS = (function () {
    var rest = D.units.filter(function (u) {
      return u.tenantId && u.id !== 'A01' && u.status === 'rented';
    }).sort(function (a, b) { return a.downstream.end < b.downstream.end ? -1 : 1; }).slice(0, 4);
    return [UNIT].concat(rest);
  })();

  /* 文件歷史：最後一步用，取本功能相關的三筆 */
  var HISTORY = D.docHistory.slice(0, 3);

  /* ------------------------------------------------------------------ 畫面片段 */
  function head(title, sub, right) {
    return '<div class="f17-stage__head">' +
      '<div><div class="f17-stage__title">' + esc(title) + '</div>' +
      (sub ? '<div class="f17-stage__sub">' + esc(sub) + '</div>' : '') + '</div>' +
      (right || '') + '</div>';
  }
  function typeCards(selectedId) {
    return '<div class="f17-types">' + D.docTypes.map(function (t) {
      var on = t.id === selectedId;
      var ic = { lease: 'doc', renew: 'refresh', adjust: 'dollar', dun: 'bell', moveout: 'logout', handover: 'clipboard', deposit: 'wallet', repair: 'wrench' }[t.id] || 'doc';
      return '<div class="f17-type' + (on ? ' is-selected' : '') + '" data-type="' + esc(t.id) + '">' +
        '<span class="icon-circle' + (on ? '' : ' icon-circle--neutral') + '">' + icon(ic) + '</span>' +
        '<span class="f17-type__name">' + esc(t.name) + '</span>' +
        '<span class="f17-type__meta">' + t.fields.length + ' 個欄位</span>' +
        '<span class="f17-type__check">' + icon('check') + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }
  function tenantRows(selectedId) {
    var hdr = '<div class="f17-row is-head"><span class="f17-row__id">物件</span>' +
      '<span class="f17-row__name">租客</span><span class="f17-row__date">租約到期</span>' +
      '<span>續租意願</span><span class="f17-row__tail">月租</span></div>';
    return '<div class="f17-rows">' + hdr + ROWS.map(function (u) {
      var t = D.tenantOf(u.id);
      var on = u.id === selectedId;
      var willing = u.id === 'A01'
        ? '<span class="badge badge--ok" data-will="' + esc(u.id) + '">已回覆想續租</span>'
        : '<span class="badge badge--neutral" data-will="' + esc(u.id) + '">等待回覆</span>';
      return '<div class="f17-row' + (on ? ' is-selected' : '') + '" data-row="' + esc(u.id) + '">' +
        '<span class="f17-row__id">' + esc(u.id) + '</span>' +
        '<span class="f17-row__name">' + esc(t.name) + '</span>' +
        '<span class="f17-row__date">' + esc(fmt.date(u.downstream.end)) + '</span>' +
        willing +
        '<span class="f17-row__tail">' + esc(fmt.money(u.rent)) + '</span>' +
        '</div>';
    }).join('') + '</div>';
  }
  function field(key, label, value, src, wide) {
    return '<div class="f17-field' + (wide ? ' f17-field--wide' : '') + '">' +
      '<div class="f17-field__label">' + esc(label) + '</div>' +
      '<div class="f17-field__value" data-f="' + esc(key) + '">' + (value === null ? '' : esc(value)) + '</div>' +
      '<div class="f17-field__src">' + icon('sparkles') + esc('自動帶入・' + src) + '</div>' +
      '</div>';
  }
  /* filled = false 時欄位留白，交給 api.type／api.count 一格一格填進去；
   * compact = true 收起資料來源與附註，讓畫面塞得下手機外框 */
  function docPaper(filled, docId, compact) {
    var v = function (s) { return filled ? s : null; };
    return '<article class="f17-doc' + (compact ? ' f17-doc--compact' : '') + '">' +
      '<header class="f17-doc__head">' +
        '<div class="f17-doc__org">' + esc(D.company.name) + '</div>' +
        '<h3 class="f17-doc__title">續約書</h3>' +
        '<p class="f17-doc__meta">' + esc((docId ? '文件編號 ' + docId + '　' : '') + '產生日期 ' + fmt.date(DOC.createdAt)) + '</p>' +
      '</header>' +
      '<div class="f17-fields">' +
        field('name', '租客姓名', v(TENANT.name), '租客資料') +
        field('addr', '物件地址', v(ADDR), '物件資料', true) +
        field('old', '原租期', v(range(UNIT.downstream.start, OLD_END)), '下游租約') +
        field('new', '新租期', v(range(NEW_START, NEW_END)), '系統自動推算') +
        '<div class="f17-field"><div class="f17-field__label">新月租金</div>' +
          '<div class="f17-field__value"><span data-f="rent">' + (filled ? fmt.num(UNIT.rent) : '0') + '</span> 元</div>' +
          '<div class="f17-field__src">' + icon('sparkles') + '自動帶入・下游租約</div></div>' +
        field('adj', '調整幅度', v('0 元（維持原租金）'), '續約條件') +
      '</div>' +
      (compact ? '' : '<p class="f17-doc__note">' + esc('上游租約調租條款：' + UNIT.upstream.adjustClause + '。') + '</p>') +
      '</article>';
  }
  function panel(title, body) {
    return '<div class="f17-panel"><div class="f17-panel__title">' + esc(title) + '</div>' + body + '</div>';
  }
  function miniKpi(label, value, unit, kind) {
    return '<div class="f17-mini-kpi"><div class="f17-mini-kpi__label">' + esc(label) + '</div>' +
      '<div class="f17-mini-kpi__value"><span data-k="' + esc(kind) + '">' + esc(value) + '</span><small>' + esc(unit) + '</small></div></div>';
  }

  /* ------------------------------------------------------------------ 6 個步驟 */
  P.mount(host, {
    feature: 'f17',
    autoplayMs: 5200,
    steps: [
      {
        title: '先選文件類型',
        text: '八種常用文件都在系統裡，這次要幫王○○發續約書。',
        render: function (stage, api) {
          stage.innerHTML = '<div class="f17-stage">' +
            head('文件中心', '選一種文件，欄位由系統自己帶') +
            typeCards(null) + '</div>';
          api.enter(stage.querySelectorAll('.f17-type'));
        },
        after: function (stage, api) {
          var card = stage.querySelector('[data-type="renew"]');
          return api.cursor(card).then(function () {
            card.classList.add('is-selected');
            card.querySelector('.icon-circle').classList.remove('icon-circle--neutral');
            return api.highlight(card);
          });
        }
      },
      {
        title: '挑要續約的租客',
        text: '王○○ 在 LINE 回覆想續租一年，租約到 2027 年 3 月 31 日。',
        render: function (stage, api) {
          stage.innerHTML = '<div class="f17-stage">' +
            head('選租客與物件', '續約作業中的租客', '<span class="badge badge--accent">續約書</span>') +
            tenantRows(null) +
            '<p class="f17-stage__sub">' + esc('LINE 回覆：' + REPLY.reply + '（' + fmt.dateTime(REPLY.repliedAt) + '）') + '</p>' +
            '</div>';
          api.enter(stage.querySelectorAll('.f17-row'));
        },
        after: function (stage, api) {
          var row = stage.querySelector('[data-row="A01"]');
          return api.cursor(row).then(function () {
            row.classList.add('is-selected');
            return api.badge(row.querySelector('[data-will="A01"]'), '已選取', 'accent');
          });
        }
      },
      {
        title: '欄位自動帶入',
        text: '姓名、地址、租期、租金從系統直接帶進來，一欄都不用重打。',
        autoplayMs: 9000,
        render: function (stage, api) {
          stage.innerHTML = '<div class="f17-stage">' +
            head('產生續約書', '資料來源：租客資料、下游租約、上游條款') +
            '<div class="f17-stage__cols">' + docPaper(false, null) +
              panel('帶入進度',
                '<div class="stat-row stat-row--divided">' +
                  '<div class="stat"><span class="stat-label">自動帶入</span><span class="stat-value"><span data-k="auto">0</span> 欄</span></div>' +
                  '<div class="stat"><span class="stat-label">要手打</span><span class="stat-value"><span data-k="manual">6</span> 欄</span></div>' +
                '</div>' +
                '<ul class="f17-srcs">' +
                  '<li>' + icon('check-circle') + '租客資料：姓名、聯絡方式</li>' +
                  '<li>' + icon('check-circle') + '下游租約：租期、月租、押金</li>' +
                  '<li>' + icon('check-circle') + '上游租約：調租上限 5%</li>' +
                '</ul>') +
            '</div></div>';
          api.enter(stage.querySelector('.f17-doc'));
        },
        after: function (stage, api) {
          /* 先抓好元素：切到下一步時這串動畫可能還在跑，抓舊元素才不會洗掉新畫面的內容 */
          var name = stage.querySelector('[data-f="name"]');
          var addr = stage.querySelector('[data-f="addr"]');
          var oldTerm = stage.querySelector('[data-f="old"]');
          var newTerm = stage.querySelector('[data-f="new"]');
          var rent = stage.querySelector('[data-f="rent"]');
          var adj = stage.querySelector('[data-f="adj"]');
          var auto = stage.querySelector('[data-k="auto"]');
          var manual = stage.querySelector('[data-k="manual"]');
          return api.type(name, TENANT.name, 400)
            .then(function () { return api.type(addr, ADDR, 900); })
            .then(function () { return api.type(oldTerm, range(UNIT.downstream.start, OLD_END), 700); })
            .then(function () { return api.type(newTerm, range(NEW_START, NEW_END), 700); })
            .then(function () { return api.count(rent, 0, UNIT.rent, 900); })
            .then(function () { return api.type(adj, '0 元（維持原租金）', 500); })
            .then(function () {
              api.count(manual, 6, 0, 600);
              return api.count(auto, 0, 6, 600);
            });
        }
      },
      {
        title: '系統先幫你核對',
        text: '新租期與租金自動核對過，也比對了上游租約的調租上限。',
        autoplayMs: 6500,
        render: function (stage, api) {
          var items = [
            { label: '原租期與下游租約一致', hint: '到期日 ' + fmt.date(OLD_END) },
            { label: '新租期接續一年', hint: range(NEW_START, NEW_END) },
            { label: '租金維持 ' + fmt.money(UNIT.rent), hint: '未超過上游 5% 調租上限' }
          ];
          stage.innerHTML = '<div class="f17-stage">' +
            head('核對續約條件', '三項條件由系統自動比對') +
            '<div class="f17-stage__cols">' + docPaper(true, null) +
              panel('自動核對', A.checklist(items, null, { className: 'f17-check' })) +
            '</div></div>';
          api.enter(stage.querySelector('.f17-panel'));
        },
        after: function (stage, api) {
          var items = stage.querySelectorAll('.checklist-item');
          return api.check(items[0])
            .then(function () { return api.wait(260); })
            .then(function () { return api.check(items[1]); })
            .then(function () { return api.wait(260); })
            .then(function () { return api.check(items[2]); });
        }
      },
      {
        title: '用 LINE 傳給租客',
        text: '按一下就傳出去，不用列印、不用約時間拿紙本。',
        autoplayMs: 7500,
        render: function (stage, api) {
          stage.innerHTML = '<div class="f17-stage">' +
            '<div class="f17-stage__cols">' +
              '<div class="stack">' +
                head('送出文件', '文件編號 ' + DOC.id + '　狀態：待傳送') +
                docPaper(true, DOC.id, true) +
                '<div class="row">' +
                  '<button type="button" class="btn btn--secondary" data-btn="pdf">' + icon('download') + '下載 PDF</button>' +
                  '<button type="button" class="btn btn--primary" data-btn="line">' + icon('send') + '以 LINE 傳送</button>' +
                '</div>' +
              '</div>' +
              A.phone({
                title: TENANT.name, sub: UNIT.id + '　租務中樞', avatar: '安', input: false,
                messages: [{ from: 'day', text: fmt.date(DOC.createdAt) }]
              }) +
            '</div></div>';
          api.enter(stage.querySelector('.f17-doc'));
        },
        after: function (stage, api) {
          var btn = stage.querySelector('[data-btn="line"]');
          var phone = stage.querySelector('.phone');
          return api.cursor(btn)
            .then(function () { return api.highlight(btn); })
            .then(function () {
              A.phoneTyping(phone, true);
              return api.wait(900);
            })
            .then(function () {
              A.phoneAppend(phone, { from: 'them', avatar: '安', text: '續約書已經產生，點開就能線上簽署。', at: '10:32' });
              return api.wait(700);
            })
            .then(function () {
              A.phoneAppend(phone, {
                from: 'them', avatar: '安', at: '10:32',
                card: {
                  title: '續約書 ' + DOC.id,
                  lines: [UNIT.id + '　續約一年', '月租 ' + fmt.money(UNIT.rent)]
                },
                buttons: [{ label: '查看並簽署' }]
              });
            });
        }
      },
      {
        title: '租客簽回就歸檔',
        text: '王○○ 線上簽回，文件自動歸檔，待簽回從 2 份降到 1 份。',
        autoplayMs: 7000,
        render: function (stage, api) {
          stage.innerHTML = '<div class="f17-stage">' +
            head('文件已歸檔', '簽回狀態自動更新，不用人工追') +
            '<div class="f17-mini-kpis">' +
              miniKpi('待租客簽回', '2', ' 份', 'wait') +
              miniKpi('本月已簽回', '2', ' 份', 'signed') +
              miniKpi('這份文件手打欄位', '0', ' 欄', 'manual') +
            '</div>' +
            '<div class="f17-rows">' +
              '<div class="f17-row is-head"><span class="f17-row__id">編號</span>' +
                '<span class="f17-row__name">類型</span><span class="f17-row__date">產生時間</span>' +
                '<span>租客</span><span class="f17-row__tail">狀態</span></div>' +
              HISTORY.map(function (h) {
                var on = h.id === DOC.id;
                return '<div class="f17-row' + (on ? ' is-selected' : '') + '">' +
                  '<span class="f17-row__id">' + esc(h.id) + '</span>' +
                  '<span class="f17-row__name">' + esc(h.typeName) + '</span>' +
                  '<span class="f17-row__date">' + esc(fmt.dateTime(h.createdAt)) + '</span>' +
                  '<span>' + esc(h.tenantName) + '</span>' +
                  '<span class="f17-row__tail"><span class="badge ' + (h.signed ? 'badge--ok' : 'badge--warn') + '" data-doc="' + esc(h.id) + '">' +
                    (h.signed ? '已簽回' : '待簽回') + '</span></span>' +
                  '</div>';
              }).join('') +
            '</div></div>';
          api.enter(stage.querySelectorAll('.f17-mini-kpi'));
        },
        after: function (stage, api) {
          var docBadge = stage.querySelector('[data-doc="' + DOC.id + '"]');
          var signed = stage.querySelector('[data-k="signed"]');
          var wait = stage.querySelector('[data-k="wait"]');
          var firstKpi = stage.querySelector('.f17-mini-kpi');
          return api.badge(docBadge, '已簽回', 'ok')
            .then(function () {
              api.count(signed, 2, 3, 700);
              return api.count(wait, 2, 1, 700);
            })
            .then(function () { return api.highlight(firstKpi); });
        }
      }
    ]
  });
})();
