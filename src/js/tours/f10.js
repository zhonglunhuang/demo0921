/* js/tours/f10.js — 租客 LINE 自助中心（f10）功能導覽 8 步
 * 契約：docs/DESIGN.md §4（播放器與 api）、§5（假資料）、§6（文案）。
 * 主角：A01 王○○（LINE 已綁定、本月 13,000 已繳、租約到 2027-03-31、A 棟、林內熱水器）。
 * 每一步都把「當下的系統畫面」重新組出來，再用 api 讓畫面真的動：逐字輸入、對話逐則出現、
 * 標籤變色、數字跳動、清單打勾、游標示意點擊。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D || !window.TourPlayer) return;

  var esc = A.esc;
  var icon = A.icon;
  var fmt = A.fmt;

  var UNIT = D.unit('A01');
  var TENANT = D.tenantOf('A01');
  var BUILDING = D.company.buildings[UNIT.building];
  var HEATER = D.equipmentOf(UNIT.id).filter(function (e) { return e.kind === '熱水器'; })[0];
  var UTIL = (function () {
    var rows = (D.utilityOf(UNIT.id) || { rows: [] }).rows;
    return rows[rows.length - 1] || { water: 0, elec: 0 };
  })();

  var CODE = String(TENANT.phone).slice(-3);        /* 手機末三碼 473 */
  var TOTAL_TENANTS = D.tenants.length;             /* 99 位 */
  var BOUND_AFTER = D.tenants.filter(function (t) { return t.lineBound; }).length;   /* 85 位 */
  var BOUND_BEFORE = BOUND_AFTER - 1;               /* 綁定 A01 之前 */
  var WO_ID = 'WO-1054';
  var MANAGER = D.staffById('S02');

  /* ================================================================
   * 1. 手機畫面（LINE）
   * ================================================================ */
  var OA_HTML =
    '<div class="f10-oa">' +
      '<span class="f10-oa-logo">' + icon('building') + '</span>' +
      '<strong>' + esc(D.company.name) + '</strong>' +
      '<p>' + esc(D.company.system) + ' · 官方帳號</p>' +
      '<ul>' +
        '<li>' + icon('check') + '綁定房號後，帳單與租約自己查</li>' +
        '<li>' + icon('check') + '報修拍張照就送出，不用打電話</li>' +
      '</ul>' +
    '</div>';

  function M() {
    return {
      day: { from: 'day', text: '今天 · ' + fmt.date(D.today) },
      oaBtn: {
        from: 'them', avatar: '安',
        html: OA_HTML + '<div class="row" style="gap:6px"><button type="button" class="btn btn--secondary btn--sm" data-addfriend>加入好友</button></div>'
      },
      oa: { from: 'them', avatar: '安', html: OA_HTML },
      welcome: { from: 'them', avatar: '安', at: '09:41', text: '歡迎加入' + D.company.name + '。這裡可以查帳單、報修、續租與退租。' },
      ask: { from: 'them', avatar: '安', at: '09:41', text: '請先綁定身分：輸入房號與手機末三碼，中間空一格。' },
      meBind: { from: 'me', at: '09:42', read: true, text: UNIT.id + ' ' + CODE },
      bound: {
        from: 'them', avatar: '安', at: '09:42',
        text: '綁定成功。您是 ' + UNIT.id + ' 的房客 ' + TENANT.name + '。',
        card: {
          title: BUILDING.name + ' ' + UNIT.id + ' · ' + UNIT.type,
          lines: [
            '租期 ' + fmt.date(UNIT.downstream.start) + ' 至 ' + fmt.date(UNIT.downstream.end),
            '月租 ' + fmt.money(TENANT.rent)
          ]
        }
      },
      meBill: { from: 'me', at: '09:43', read: true, text: '本月帳單' },
      bill: {
        from: 'them', avatar: '安', at: '09:43',
        text: '2026 年 9 月的帳單如下。',
        card: {
          title: UNIT.id + ' · 2026 年 9 月',
          lines: [
            '月租金 ' + fmt.money(TENANT.rent) + '　狀態：已繳',
            '繳費日 ' + fmt.date(TENANT.paidAt),
            '本月用水 ' + UTIL.water + ' 度、用電 ' + UTIL.elec + ' 度'
          ]
        }
      },
      meRepair: { from: 'me', at: '09:45', read: true, text: '報修' },
      askKind: { from: 'them', avatar: '安', at: '09:45', text: '請問是哪一類問題？點一下最接近的就好。' },
      meKind: { from: 'me', at: '09:46', read: true, text: '熱水器' },
      askPhoto: { from: 'them', avatar: '安', at: '09:46', text: '方便拍一張照片嗎？看得到狀況才好派對廠商。' },
      mePhoto: function (desc) {
        return {
          from: 'me', at: '09:47', read: true,
          html: '<span data-desc>' + esc(desc || '') + '</span>' +
            '<img class="f10-shot" src="../assets/f10-photo-heater.svg" alt="租客拍的熱水器照片">' +
            '<span class="f10-bubble-note">已附照片 1 張</span>'
        };
      },
      accepted: {
        from: 'them', avatar: '安', at: '09:47',
        text: '已收到報修，工單 ' + WO_ID + ' 已建立。',
        card: {
          title: WO_ID + ' · 熱水器檢修',
          lines: [
            'AI 判斷類別：水電',
            '設備：' + HEATER.brand + ' ' + HEATER.model,
            '今天下午廠商會用這個 LINE 跟您約時間'
          ]
        }
      }
    };
  }

  function phoneHTML(msgs, opts) {
    opts = opts || {};
    var o = {
      title: D.company.name,
      sub: opts.bound ? '已綁定 ' + UNIT.id : '官方帳號',
      avatar: '安',
      time: '9:41',
      messages: msgs,
      typing: !!opts.typing,
      input: false
    };
    if (opts.menu) o.menu = D.lineMenu.map(function (m) { return { label: m.name, action: m.key, icon: m.icon }; });
    return A.phone(o);
  }

  /* 假的輸入列：逐字打字用（真的輸入交給操作頁） */
  function addField(stage) {
    var screen = stage.querySelector('.phone-screen');
    if (!screen) return;
    screen.insertAdjacentHTML('beforeend',
      '<div class="f10s-fake-input"><div class="f10s-field" data-field></div>' +
      '<span data-send>' + icon('send') + '</span></div>');
  }

  /* ================================================================
   * 2. 右側系統畫面
   * ================================================================ */
  function kpi(key, label, value, unit, ok) {
    return '<div class="f10s-kpi' + (ok ? ' is-ok' : '') + '" data-kpi="' + key + '">' +
      '<div class="f10s-kpi-label">' + esc(label) + '</div>' +
      '<div class="f10s-kpi-value"><span data-v>' + value + '</span><small>' + esc(unit) + '</small></div></div>';
  }

  function panel(o) {
    o = o || {};
    return '<div class="f10s-panel">' +
      '<div class="f10s-head"><h3>' + esc(D.company.system) + ' · 租客服務</h3>' +
        '<span class="muted">' + esc(fmt.date(D.today)) + '</span></div>' +
      '<div class="f10s-kpis">' +
        kpi('bound', '已綁定 LINE', o.bound, '／ ' + TOTAL_TENANTS + ' 位') +
        kpi('self', '今日自助處理', o.self, '件') +
        kpi('human', '等人工回覆', o.human, '件', o.humanOk) +
      '</div>' +
      (o.body || '') +
      (o.alert || '') +
      '</div>';
  }

  function tenantCard(bound) {
    return '<div class="f10s-card">' +
      '<h4>' + icon('user') + ' 這位租客</h4>' +
      '<div class="f10s-row"><span>' + esc(UNIT.id + ' ' + TENANT.name) + '</span>' +
        '<span class="badge badge--' + (bound ? 'ok' : 'neutral') + '" data-bind-badge>' + (bound ? '已綁定' : '未綁定') + '</span></div>' +
      '<div class="f10s-row"><span class="muted">' + esc(BUILDING.name + ' · ' + UNIT.type + ' ' + fmt.ping(UNIT.ping)) + '</span>' +
        '<span class="muted">' + esc('月租 ' + fmt.money(TENANT.rent)) + '</span></div>' +
      '<div class="f10s-row"><span class="muted">租約到 ' + esc(fmt.date(UNIT.downstream.end)) + '</span>' +
        '<span class="muted">本月 ' + esc(TENANT.paid) + '</span></div>' +
      '</div>';
  }

  function menuCard(pending) {
    return '<div class="f10s-card">' +
      '<h4>' + icon('grid') + (pending ? ' 綁定後可以自己做的九件事' : ' 租客可以自己做的九件事') + '</h4>' +
      '<ul class="f10s-list">' + D.lineMenu.map(function (m) {
        return '<li>' + icon('check') + esc(m.name) + '</li>';
      }).join('') + '</ul></div>';
  }

  function billCard() {
    return '<div class="f10s-card">' +
      '<h4>' + icon('dollar') + ' 租客剛查的資料</h4>' +
      '<div class="f10s-row"><span class="muted">2026 年 9 月租金</span><strong>' + esc(fmt.money(TENANT.rent)) + '</strong></div>' +
      '<div class="f10s-row"><span class="muted">繳費狀態</span><span class="badge badge--ok">已繳（' + esc(fmt.date(TENANT.paidAt)) + '）</span></div>' +
      '<div class="f10s-row"><span class="muted">本月水電</span><span>' + UTIL.water + ' 度、' + UTIL.elec + ' 度</span></div>' +
      '<div class="muted" style="margin-top:8px">這一題不用人接，租客自己看得到。</div></div>';
  }

  function woCard(status, kind, cat) {
    return '<div class="f10s-card" data-card="wo">' +
      '<h4>' + icon('wrench') + ' 系統自動開出的工單</h4>' +
      '<div class="f10s-row"><strong>' + esc(WO_ID + ' 熱水器檢修') + '</strong>' +
        '<span class="badge badge--' + kind + '" data-wo-status>' + esc(status) + '</span></div>' +
      '<div class="f10s-row"><span class="muted">' + esc(UNIT.id + ' · 來源：租客 LINE 報修 · 附照片 1 張') + '</span>' +
        '<span class="badge badge--neutral" data-wo-cat>' + esc(cat) + '</span></div>' +
      '<ul class="f10s-check">' +
        '<li data-check="1"><span class="f10s-box checkbox">' + icon('check') + '</span>收到租客報修與照片</li>' +
        '<li data-check="2"><span class="f10s-box checkbox">' + icon('check') + '</span>AI 判斷派工類別</li>' +
        '<li data-check="3"><span class="f10s-box checkbox">' + icon('check') + '</span>回覆租客受理時間</li>' +
      '</ul></div>';
  }

  function alertBox(kind, text) {
    return '<div class="f10s-alert' + (kind === 'ok' ? ' f10s-alert--ok' : '') + '" data-alert>' +
      icon(kind === 'ok' ? 'check-circle' : 'alert-circle') + '<span data-alert-text>' + esc(text) + '</span></div>';
  }

  /* 數字與逐字：動畫跑完後把最終值定住，避免 rAF 被節流時停在中途 */
  function settle(el, text) {
    var fresh = el.cloneNode(false);
    fresh.textContent = text;
    if (el.parentNode) el.parentNode.replaceChild(fresh, el);
    return fresh;
  }
  function countTo(api, el, from, to, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? 700 : ms;
    api.count(el, from, to, dur);
    return api.wait(dur + 80).then(function () {
      settle(el, String(to).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    });
  }
  function typeTo(api, el, text, ms) {
    if (!el) return api.wait(0);
    var dur = ms == null ? Math.min(2000, Math.max(400, text.length * 60)) : ms;
    api.type(el, text, dur);
    return api.wait(dur + 120).then(function () { settle(el, text); });
  }

  function stageHTML(phone, right) {
    return '<div class="f10s">' + phone + right + '</div>';
  }

  function scrollChat(stage) {
    var chat = stage.querySelector('.phone-chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }
  function phoneEl(stage) { return stage.querySelector('.phone'); }
  function append(stage, msg) {
    var b = A.phoneAppend(phoneEl(stage), msg);
    scrollChat(stage);
    return b;
  }
  function typing(stage, on) {
    A.phoneTyping(phoneEl(stage), on !== false);
    scrollChat(stage);
  }

  /* ================================================================
   * 3. 八個步驟
   * ================================================================ */
  var steps = [
    {
      title: '租客加 LINE 好友',
      text: '租客在 LINE 加入公司官方帳號。之後查帳單、報修都在這裡，不用再裝別的東西。',
      render: function (stage, api) {
        var m = M();
        stage.innerHTML = stageHTML(
          phoneHTML([m.day, m.oaBtn], {}),
          panel({ bound: BOUND_BEFORE, self: 127, human: 0, body: tenantCard(false) + menuCard(true) })
        );
        scrollChat(stage);
        return api.enter([stage.querySelector('.phone'), stage.querySelector('.f10s-panel')]);
      },
      after: function (stage, api) {
        var m = M();
        return api.cursor(stage.querySelector('[data-addfriend]'))
          .then(function () { return api.wait(200); })
          .then(function () { append(stage, m.welcome); return api.wait(500); })
          .then(function () { append(stage, m.ask); });
      }
    },

    {
      title: '輸入房號與末三碼',
      text: '輸入 ' + UNIT.id + ' 與手機末三碼就完成驗證。只有本人綁得起來，別人查不到這間房。',
      render: function (stage, api) {
        var m = M();
        stage.innerHTML = stageHTML(
          phoneHTML([m.day, m.oa, m.welcome, m.ask], {}),
          panel({ bound: BOUND_BEFORE, self: 127, human: 0, body: tenantCard(false) + menuCard(true) })
        );
        addField(stage);
        scrollChat(stage);
        return api.enter(stage.querySelector('.f10s-fake-input'));
      },
      after: function (stage, api) {
        return typeTo(api, stage.querySelector('[data-field]'), UNIT.id + ' ' + CODE, 900)
          .then(function () { return api.cursor(stage.querySelector('[data-send]')); })
          .then(function () {
            var f = stage.querySelector('[data-field]');
            if (f) f.textContent = '';
            append(stage, M().meBind);
          });
      }
    },

    {
      title: '系統認得這位租客',
      text: '綁定後系統知道他是 ' + UNIT.id + ' 的' + TENANT.name + '，之後每一句話都自動對到這間房。',
      render: function (stage, api) {
        var m = M();
        stage.innerHTML = stageHTML(
          phoneHTML([m.day, m.oa, m.welcome, m.ask, m.meBind], {}),
          panel({ bound: BOUND_BEFORE, self: 127, human: 0, body: tenantCard(false) + menuCard(true) })
        );
        scrollChat(stage);
        return api.enter(stage.querySelector('[data-bind-badge]').closest('.f10s-card'));
      },
      after: function (stage, api) {
        typing(stage, true);
        return api.wait(800)
          .then(function () { append(stage, M().bound); return api.wait(400); })
          .then(function () { return api.badge(stage.querySelector('[data-bind-badge]'), '已綁定', 'ok'); })
          .then(function () { return countTo(api, stage.querySelector('[data-kpi="bound"] [data-v]'), BOUND_BEFORE, BOUND_AFTER, 800); });
      }
    },

    {
      title: '圖文選單九件事',
      text: '帳單、繳費、租約、報修、續租、退租都排在選單上，租客自己點就有答案。',
      render: function (stage, api) {
        var m = M();
        stage.innerHTML = stageHTML(
          phoneHTML([m.day, m.oa, m.welcome, m.ask, m.meBind, m.bound], { menu: true, bound: true }),
          panel({ bound: BOUND_AFTER, self: 127, human: 0, body: menuCard() })
        );
        scrollChat(stage);
        return api.enter(stage.querySelectorAll('.phone-menu button'));
      },
      after: function (stage, api) {
        return api.enter(stage.querySelectorAll('.f10s-list li'))
          .then(function () { return api.highlight(stage.querySelector('.phone-menu')); });
      }
    },

    {
      title: '一秒查到本月帳單',
      text: '9 月租金 ' + fmt.money(TENANT.rent) + '已繳，租客自己看得到。這種電話每個月少接好幾十通。',
      render: function (stage, api) {
        var m = M();
        stage.innerHTML = stageHTML(
          phoneHTML([m.day, m.oa, m.welcome, m.ask, m.meBind, m.bound], { menu: true, bound: true }),
          panel({ bound: BOUND_AFTER, self: 127, human: 0, body: tenantCard(true) + menuCard() })
        );
        scrollChat(stage);
        return api.wait(0);
      },
      after: function (stage, api) {
        var m = M();
        return api.cursor(stage.querySelector('.phone-menu button[data-phone-menu="bill"]'))
          .then(function () { append(stage, m.meBill); typing(stage, true); return api.wait(800); })
          .then(function () { append(stage, m.bill); return api.wait(300); })
          .then(function () {
            var body = stage.querySelector('[data-bind-badge]').closest('.f10s-card');
            body.outerHTML = billCard();
            return api.enter(stage.querySelector('.f10s-card'));
          })
          .then(function () { return countTo(api, stage.querySelector('[data-kpi="self"] [data-v]'), 127, 128, 700); });
      }
    },

    {
      title: '拍張照就能報修',
      text: '選個類別、拍張照就送出。照片直接進系統，師傅不用先跑一趟看狀況。',
      render: function (stage, api) {
        var m = M();
        stage.innerHTML = stageHTML(
          phoneHTML([m.day, m.oa, m.meBind, m.bound, m.meBill, m.bill], { menu: true, bound: true }),
          panel({ bound: BOUND_AFTER, self: 128, human: 0, body: billCard() + menuCard() })
        );
        scrollChat(stage);
        return api.wait(0);
      },
      after: function (stage, api) {
        var m = M();
        return api.cursor(stage.querySelector('.phone-menu button[data-phone-menu="repair"]'))
          .then(function () { append(stage, m.meRepair); typing(stage, true); return api.wait(700); })
          .then(function () { append(stage, m.askKind); return api.wait(400); })
          .then(function () { append(stage, m.meKind); typing(stage, true); return api.wait(600); })
          .then(function () { append(stage, m.askPhoto); return api.wait(400); })
          .then(function () {
            append(stage, m.mePhoto(''));
            return typeTo(api, stage.querySelector('[data-desc]'), '洗澡洗到一半忽冷忽熱', 900);
          })
          .then(function () { scrollChat(stage); });
      }
    },

    {
      title: '工單自動開好',
      text: 'AI 判斷是水電類，工單 ' + WO_ID + ' 當場建立。管理員打開就能派工，不用重打一次。',
      render: function (stage, api) {
        var m = M();
        stage.innerHTML = stageHTML(
          phoneHTML([m.day, m.meBind, m.bound, m.meBill, m.bill, m.meRepair, m.askKind, m.meKind, m.askPhoto, m.mePhoto('洗澡洗到一半忽冷忽熱')], { menu: true, bound: true, typing: true }),
          panel({
            bound: BOUND_AFTER, self: 129, human: 1,
            body: woCard('待派工', 'warn', '判斷中'),
            alert: alertBox('warn', '租客還在等回覆，這件事還沒有人回。')
          })
        );
        scrollChat(stage);
        return api.enter(stage.querySelector('[data-card="wo"]'));
      },
      after: function (stage, api) {
        return countTo(api, stage.querySelector('[data-kpi="self"] [data-v]'), 128, 129, 600)
          .then(function () { return api.check(stage.querySelector('[data-check="1"]')); })
          .then(function () { return api.badge(stage.querySelector('[data-wo-cat]'), '水電', 'accent'); })
          .then(function () { return api.check(stage.querySelector('[data-check="2"]')); });
      }
    },

    {
      title: '租客收到受理回覆',
      text: '系統自動回覆受理時間，等人工回覆歸零。整件事沒有人接電話，也走完了。',
      render: function (stage, api) {
        var m = M();
        var card = woCard('待派工', 'warn', '水電');
        stage.innerHTML = stageHTML(
          phoneHTML([m.day, m.meBind, m.bound, m.meBill, m.bill, m.meRepair, m.askKind, m.meKind, m.askPhoto, m.mePhoto('洗澡洗到一半忽冷忽熱')], { menu: true, bound: true, typing: true }),
          panel({
            bound: BOUND_AFTER, self: 129, human: 1,
            body: card,
            alert: alertBox('warn', '租客還在等回覆，這件事還沒有人回。')
          })
        );
        stage.querySelector('[data-check="1"]').classList.add('is-done');
        stage.querySelector('[data-check="2"]').classList.add('is-done');
        scrollChat(stage);
        return api.wait(0);
      },
      after: function (stage, api) {
        return api.wait(600)
          .then(function () { append(stage, M().accepted); return api.wait(400); })
          .then(function () { return api.check(stage.querySelector('[data-check="3"]')); })
          .then(function () { return api.badge(stage.querySelector('[data-wo-status]'), '已受理，待派工', 'accent'); })
          .then(function () {
            var box = stage.querySelector('[data-alert]');
            box.className = 'f10s-alert f10s-alert--ok';
            box.innerHTML = icon('check-circle') + '<span data-alert-text>已自動回覆受理，租客不用等，管理員接手派工就好。</span>';
            return api.enter(box);
          })
          .then(function () {
            var k = stage.querySelector('[data-kpi="human"]');
            k.classList.add('is-ok');
            return countTo(api, k.querySelector('[data-v]'), 1, 0, 700);
          });
      }
    }
  ];

  /* 直接看某一步：網址加 #step=last 或 #step=3（截圖與分享用） */
  var start = 0;
  var autoplay = true;
  var m = /step=(last|\d+)/.exec(window.location.hash || '');
  if (m) {
    start = m[1] === 'last' ? steps.length - 1 : Math.max(0, Math.min(steps.length - 1, parseInt(m[1], 10) - 1));
    autoplay = false;
  }

  TourPlayer.mount(document.getElementById('player'), {
    feature: 'f10',
    autoplayMs: 6000,
    start: start,
    autoplay: autoplay,
    steps: steps
  });
})();
