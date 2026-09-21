/* f11.js（tours）— AI 客服與知識庫的功能導覽，9 步。
 * 契約：docs/DESIGN.md §4（TourPlayer.mount）、票 DEMO-06 的導覽流程 2。
 * 流程：租客問「垃圾怎麼丟」→ AI 依 B 棟回答 → 追問熱水器 → AI 依 A01 設備回答 → 答不出來就轉人工 → 客服量下降。
 * 資料全部來自 window.DB，只讀不改；基礎層沒有的客服量數字放在 STATS。 */
(function () {
  'use strict';

  var A = window.App, D = window.DB, P = window.TourPlayer;
  var host = document.getElementById('player');
  if (!A || !D || !P || !host) return;
  var esc = A.esc, fmt = A.fmt, icon = A.icon;

  /* ------------------------------------------------------------------ 這條導覽用到的資料 */
  var B_UNIT = D.unit('B12'), B_T = D.tenantOf('B12'), B_B = D.company.buildings.B;
  var A_UNIT = D.unit('A01'), A_T = D.tenantOf('A01'), A_B = D.company.buildings.A;
  var KB_B_TRASH = D.kbFor('B', '垃圾')[0];
  var KB_A_TRASH = D.kbFor('A', '垃圾')[0];
  var KB_A_HOT = D.kbFor('A', '熱水器')[0];
  var HEATER = D.equipmentOf('A01').filter(function (e) { return e.kind === '熱水器'; })[0];

  /* 與操作頁 js/app/f11.js 同一組客服量數字 */
  var STATS = { asked: 412, answered: 344, escalated: 68, entries: 45, seconds: 8, topics: 9 };
  var Q_TRASH = KB_B_TRASH.q;
  var Q_HEATER = KB_A_HOT.q;
  var Q_PET = '可以養貓嗎？';
  var HEATER_NOTE = '您這間（A01）的熱水器是 ' + HEATER.brand + ' ' + HEATER.model + '，' +
    fmt.date(HEATER.purchased) + ' 安裝，保固已於 ' + fmt.date(HEATER.warrantyEnd) + ' 到期。';
  var PET_REPLY = '這題公司知識庫裡還沒有答案。我不會上網亂猜，已經把問題轉給管理員，補好答案會回頭通知您。';

  /* ------------------------------------------------------------------ 畫面片段 */
  function head(title, sub, right) {
    return '<div class="f11-stage__head">' +
      '<div><div class="f11-stage__title">' + esc(title) + '</div>' +
      (sub ? '<div class="f11-stage__sub">' + esc(sub) + '</div>' : '') + '</div>' +
      (right || '') + '</div>';
  }
  function panel(title, body, right) {
    return '<div class="f11-panel"><div class="f11-panel__title"><span>' + esc(title) + '</span>' + (right || '') + '</div>' + body + '</div>';
  }
  function phoneFor(unit, msgs) {
    var t = D.tenantOf(unit.id);
    return A.phone({
      title: '租務中樞 AI 客服', sub: unit.id + '　' + t.name, avatar: '中',
      time: '10:12', input: false, messages: msgs
    });
  }
  function bound(unit) { return { from: 'system', text: '已綁定身分：' + unit.id + '　' + D.tenantOf(unit.id).name }; }
  function day() { return { from: 'day', text: fmt.date(D.today) }; }
  function meSlot(at) { return { from: 'me', at: at, html: '<span data-q></span>' }; }
  function meText(text, at) { return { from: 'me', at: at, text: text }; }
  function aiSlot(at) { return { from: 'them', avatar: '中', at: at, html: '<span data-a></span>' }; }
  function cols(phoneHtml, panelsHtml) {
    return '<div class="f11-stage__cols">' + phoneHtml + '<div class="f11-stage__panels">' + panelsHtml + '</div></div>';
  }
  function miniKpi(key, label, value, unit) {
    return '<div class="f11-mini-kpi"><div class="f11-mini-kpi__label">' + esc(label) + '</div>' +
      '<div class="f11-mini-kpi__value"><span data-k="' + esc(key) + '">' + esc(value) + '</span>' +
      (unit ? '<small>' + esc(unit) + '</small>' : '') + '</div></div>';
  }
  function kbRows(code, hitTopic) {
    var rows = D.kbFor(code);
    return '<div class="f11-kb-rows">' + rows.slice(0, 5).map(function (k) {
      var hit = k.topic === hitTopic;
      return '<div class="f11-kb-row' + (hit ? '' : ' is-dim') + '" data-row="' + esc(k.topic) + '">' +
        '<span class="f11-kb-row__b">' + esc(k.buildingName) + '　' + esc(k.topic) + '</span>' +
        '<span class="f11-kb-row__q">' + esc(k.a) + '</span>' +
        (hit ? '<span class="badge badge--accent" data-hit>比對中</span>' : '<span class="badge badge--neutral">未命中</span>') +
        '</div>';
    }).join('') + '</div>';
  }
  function scrollChat(stage) {
    var chat = stage.querySelector('.phone-chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }
  function typing(stage, on) { A.phoneTyping(stage.querySelector('.phone'), on !== false); }

  /* ------------------------------------------------------------------ 9 個步驟 */
  P.mount(host, {
    feature: 'f11',
    autoplayMs: 6000,
    steps: [
      {
        title: '租客在 LINE 問一句',
        text: '租客不用打電話，直接在 LINE 問「垃圾怎麼丟」。',
        render: function (stage, api) {
          stage.innerHTML = '<div class="f11-stage">' +
            head('租客端 LINE', B_UNIT.id + '　' + B_T.name + '　' + B_B.name) +
            cols(phoneFor(B_UNIT, [day(), bound(B_UNIT), meSlot('10:12')]),
              panel('AI 客服值班中',
                A.statRow([
                  { label: '本月提問', value: fmt.num(STATS.asked) + ' 則' },
                  { label: '平均回覆', value: STATS.seconds + ' 秒' },
                  { label: '知識庫', value: STATS.entries + ' 條' }
                ], { divided: true, sm: true })) +
              panel('這通問答會怎麼走',
                '<div class="f11-flow">' +
                  '<span class="f11-flow__step is-on">' + icon('message') + '租客提問</span>' + icon('arrow-right') +
                  '<span class="f11-flow__step">' + icon('user-check') + '認出身分</span>' + icon('arrow-right') +
                  '<span class="f11-flow__step">' + icon('database') + '查知識庫</span>' + icon('arrow-right') +
                  '<span class="f11-flow__step">' + icon('bot') + '回答</span>' +
                '</div>')) +
            '</div>';
          api.enter(stage.querySelectorAll('.f11-panel'));
        },
        after: function (stage, api) {
          return api.type(stage.querySelector('[data-q]'), Q_TRASH, 800).then(function () {
            scrollChat(stage);
            typing(stage, true);
          });
        }
      },
      {
        title: 'AI 先認出是哪一間',
        text: '綁定過身分，系統知道他是 B 棟 B12 的葉○○，不用他自己說。',
        render: function (stage, api) {
          stage.innerHTML = '<div class="f11-stage">' +
            head('比對租客身分', '每一則訊息都先知道是誰、住哪一間') +
            cols(phoneFor(B_UNIT, [day(), bound(B_UNIT), meText(Q_TRASH, '10:12'), { typing: true }]),
              panel('身分比對',
                '<div class="f11-match" data-match>' +
                  '<span class="badge badge--neutral">LINE 帳號</span>' + icon('arrow-right') +
                  '<b>' + esc(B_T.name) + '</b>' + icon('arrow-right') +
                  '<span class="badge badge--accent">' + esc(B_UNIT.id + '　' + B_B.name) + '</span>' +
                '</div>') +
              panel('這間的資料',
                '<dl class="kv">' +
                  '<dt>地址</dt><dd>' + esc(B_B.address) + '</dd>' +
                  '<dt>房型</dt><dd>' + esc(B_UNIT.type + '　' + B_UNIT.floor + ' 樓') + '</dd>' +
                  '<dt>租約到期</dt><dd>' + esc(fmt.date(B_T.contractEnd)) + '</dd>' +
                '</dl>')) +
            '</div>';
          api.enter(stage.querySelectorAll('.f11-panel'));
          scrollChat(stage);
        },
        after: function (stage, api) {
          return api.highlight(stage.querySelector('[data-match]'));
        }
      },
      {
        title: '只查公司知識庫',
        text: 'AI 從 45 條公司條目裡挑出 B 棟那一條，不上網、不亂編。',
        render: function (stage, api) {
          stage.innerHTML = '<div class="f11-stage">' +
            head('比對知識庫', 'AI 只讀這些條目，沒有就不回答') +
            cols(phoneFor(B_UNIT, [day(), bound(B_UNIT), meText(Q_TRASH, '10:12'), { typing: true }]),
              '<div class="f11-mini-kpis">' +
                miniKpi('all', '全部條目', '0', ' 條') +
                miniKpi('b', 'B 棟條目', '0', ' 條') +
                miniKpi('hit', '命中', '0', ' 條') +
                miniKpi('web', '參考網路資料', '0', ' 筆') +
              '</div>' +
              panel('比對中的條目', kbRows('B', '垃圾'))) +
            '</div>';
          api.enter(stage.querySelectorAll('.f11-mini-kpi'));
          scrollChat(stage);
        },
        after: function (stage, api) {
          var all = stage.querySelector('[data-k="all"]');
          var b = stage.querySelector('[data-k="b"]');
          var hit = stage.querySelector('[data-k="hit"]');
          var row = stage.querySelector('[data-row="垃圾"]');
          return api.count(all, 0, STATS.entries, 900)
            .then(function () { return api.count(b, 0, STATS.topics, 600); })
            .then(function () { return api.count(hit, 0, 1, 400); })
            .then(function () {
              row.classList.remove('is-dim');
              row.classList.add('is-hit');
              return api.badge(row.querySelector('[data-hit]'), '命中', 'ok');
            })
            .then(function () { return api.highlight(row); });
        }
      },
      {
        title: '照 B 棟的規定回答',
        text: '垃圾車時間直接照 B 棟的答，租客不必再問一次人。',
        autoplayMs: 8000,
        render: function (stage, api) {
          stage.innerHTML = '<div class="f11-stage">' +
            head('AI 回覆租客', '答案逐字送到租客手機') +
            cols(phoneFor(B_UNIT, [day(), bound(B_UNIT), meText(Q_TRASH, '10:12'), aiSlot('10:12')]),
              panel('這次引用的條目',
                '<div class="f11-kb-row is-hit">' +
                  '<span class="f11-kb-row__b">' + esc(KB_B_TRASH.buildingName + '　垃圾') + '</span>' +
                  '<span class="f11-kb-row__q">' + esc(KB_B_TRASH.q) + '</span>' +
                  '<span class="badge badge--ok">引用中</span>' +
                '</div>') +
              panel('回答依據',
                A.checklist([
                  { label: '公司知識庫：' + KB_B_TRASH.buildingName + ' · 垃圾', static: true },
                  { label: '租客綁定身分：' + B_UNIT.id, static: true },
                  { label: '網路上查到的資料：不採用', static: true }
                ], null, { className: 'f11-src' }))) +
            '</div>';
          api.enter(stage.querySelectorAll('.f11-panel'));
          scrollChat(stage);
        },
        after: function (stage, api) {
          var items = stage.querySelectorAll('.f11-src .checklist-item');
          return api.type(stage.querySelector('[data-a]'), KB_B_TRASH.a, 2600)
            .then(function () {
              scrollChat(stage);
              A.phoneAppend(stage.querySelector('.phone'), { from: 'system', text: '引用知識庫：' + KB_B_TRASH.buildingName + ' · 垃圾' });
              return api.check(items[0]);
            })
            .then(function () { return api.check(items[1]); });
        }
      },
      {
        title: '同一題，A 棟不一樣',
        text: '同一個問題，五棟五個答案。棟別換了，AI 的回答自動跟著換。',
        autoplayMs: 7000,
        render: function (stage, api) {
          stage.innerHTML = '<div class="f11-stage">' +
            head('同一題在不同棟的答案', '知識庫依棟別分組，' + STATS.topics + ' 類問題 × 5 棟') +
            '<div class="f11-compare">' +
              '<div class="f11-compare__card" data-card="B">' +
                '<div class="f11-compare__b">' + icon('building') + esc(B_B.name) + '　' + esc(B_UNIT.id) +
                  '<span class="badge badge--accent" data-b-tag>剛剛問的</span></div>' +
                '<p class="f11-compare__a" data-ans="B"></p></div>' +
              '<div class="f11-compare__card" data-card="A">' +
                '<div class="f11-compare__b">' + icon('building') + esc(A_B.name) + '　' + esc(A_UNIT.id) +
                  '<span class="badge badge--neutral" data-a-tag>另一棟</span></div>' +
                '<p class="f11-compare__a" data-ans="A"></p></div>' +
            '</div>' +
            panel('為什麼要分棟',
              '<p class="muted">' + esc('垃圾車時間、停車方式、網路與熱水器都因棟別而異。統一一套答案，租客照做就會出錯。') + '</p>') +
            '</div>';
          api.enter(stage.querySelectorAll('.f11-compare__card'));
        },
        after: function (stage, api) {
          var bAns = stage.querySelector('[data-ans="B"]');
          var aAns = stage.querySelector('[data-ans="A"]');
          return api.type(bAns, B_B.garbageDays, 1400)
            .then(function () { return api.type(aAns, A_B.garbageDays, 1400); })
            .then(function () { return api.badge(stage.querySelector('[data-a-tag]'), '同一題，不同答案', 'ok'); });
        }
      },
      {
        title: '換 A01 追問熱水器',
        text: '王○○ 接著問熱水器怎麼用，AI 一樣先認出是 A 棟 A01。',
        render: function (stage, api) {
          stage.innerHTML = '<div class="f11-stage">' +
            head('另一位租客', A_UNIT.id + '　' + A_T.name + '　' + A_B.name) +
            cols(phoneFor(A_UNIT, [day(), bound(A_UNIT), meSlot('10:20')]),
              panel('這間登記的設備',
                '<div class="f11-eq" data-eq>' +
                  '<span class="icon-circle icon-circle--neutral">' + icon('thermometer') + '</span>' +
                  '<div class="f11-eq__name">' + esc(HEATER.brand + ' ' + HEATER.model) + '</div>' +
                  '<div class="f11-eq__meta">' + esc(fmt.date(HEATER.purchased) + ' 安裝　保固到 ' + fmt.date(HEATER.warrantyEnd)) + '</div>' +
                '</div>') +
              panel('設備履歷', '<p class="muted">' + esc('A01 共登記 ' + D.equipmentOf('A01').length + ' 台設備，品牌、型號、保固與維修紀錄都在系統裡，AI 回答時直接引用。') + '</p>')) +
            '</div>';
          api.enter(stage.querySelectorAll('.f11-panel'));
        },
        after: function (stage, api) {
          return api.type(stage.querySelector('[data-q]'), Q_HEATER, 800).then(function () {
            scrollChat(stage);
            typing(stage, true);
            return api.highlight(stage.querySelector('[data-eq]'));
          });
        }
      },
      {
        title: '連機型都查得到',
        text: '答案附上這間裝的林內 RU-1602 與保固狀況，客服不用翻資料。',
        autoplayMs: 9000,
        render: function (stage, api) {
          stage.innerHTML = '<div class="f11-stage">' +
            head('依房間回答', '棟別規定加上這一間的設備資料') +
            cols(phoneFor(A_UNIT, [day(), bound(A_UNIT), meText(Q_HEATER, '10:20'), aiSlot('10:20')]),
              panel('回答的兩個來源',
                '<div class="f11-kb-row is-hit"><span class="f11-kb-row__b">' + esc(A_B.name + '　熱水器') + '</span>' +
                  '<span class="f11-kb-row__q">' + esc(KB_A_HOT.q) + '</span><span class="badge badge--ok">知識庫</span></div>' +
                '<div class="f11-kb-row is-hit mt-8" data-eq><span class="f11-kb-row__b">' + esc(A_UNIT.id + '　設備') + '</span>' +
                  '<span class="f11-kb-row__q">' + esc(HEATER.brand + ' ' + HEATER.model) + '</span><span class="badge badge--ok">設備履歷</span></div>') +
              panel('保固狀態',
                A.statRow([
                  { label: '安裝日', value: fmt.date(HEATER.purchased) },
                  { label: '保固', value: HEATER.warrantyEnd >= D.today ? '有效' : '已到期' },
                  { label: '維修紀錄', value: HEATER.repairs.length + ' 次' }
                ], { divided: true, sm: true }))) +
            '</div>';
          api.enter(stage.querySelectorAll('.f11-panel'));
          scrollChat(stage);
        },
        after: function (stage, api) {
          var phone = stage.querySelector('.phone');
          return api.type(stage.querySelector('[data-a]'), KB_A_HOT.a, 2400)
            .then(function () {
              scrollChat(stage);
              var row = A.phoneAppend(phone, { from: 'them', avatar: '中', at: '10:20', html: '<span data-a2></span>' });
              return api.type(row.querySelector('[data-a2]'), HEATER_NOTE, 2200);
            })
            .then(function () {
              scrollChat(stage);
              A.phoneAppend(phone, { from: 'system', text: '引用知識庫：' + A_B.name + ' · 熱水器　＋　' + A_UNIT.id + ' 設備履歷' });
              scrollChat(stage);
              return api.highlight(stage.querySelector('[data-eq]'));
            });
        }
      },
      {
        title: '答不出來就轉人工',
        text: '知識庫沒有的題目，AI 不亂猜，轉給管理員，補完就進知識庫。',
        autoplayMs: 9000,
        render: function (stage, api) {
          stage.innerHTML = '<div class="f11-stage">' +
            head('沒有答案的那一題', 'AI 寧可轉人工，也不亂回') +
            cols(phoneFor(A_UNIT, [day(), meText(Q_PET, '10:26'), aiSlot('10:26')]),
              panel('待補問答',
                '<div class="f11-kb-row"><span class="f11-kb-row__b">' + esc(A_UNIT.id + '　寵物') + '</span>' +
                  '<span class="f11-kb-row__q">' + esc(Q_PET) + '</span>' +
                  '<span class="badge badge--warn" data-pending>待補答案</span></div>') +
              panel('管理員補答案',
                A.checklist([
                  { label: '收到轉人工通知', static: true },
                  { label: '寫下標準答案並選定棟別', static: true },
                  { label: '加入知識庫，下次由 AI 直接回', static: true }
                ], null, { className: 'f11-fix' })) +
              '<div class="f11-mini-kpis">' +
                miniKpi('entries', '知識庫條目', String(STATS.entries), ' 條') +
                miniKpi('esc', '本月轉人工', String(STATS.escalated), ' 則') +
              '</div>') +
            '</div>';
          api.enter(stage.querySelectorAll('.f11-panel'));
          scrollChat(stage);
        },
        after: function (stage, api) {
          var items = stage.querySelectorAll('.f11-fix .checklist-item');
          return api.type(stage.querySelector('[data-a]'), PET_REPLY, 2400)
            .then(function () {
              scrollChat(stage);
              return api.check(items[0]);
            })
            .then(function () { return api.check(items[1]); })
            .then(function () { return api.check(items[2]); })
            .then(function () {
              api.count(stage.querySelector('[data-k="entries"]'), STATS.entries, STATS.entries + 1, 600);
              return api.badge(stage.querySelector('[data-pending]'), '已補上答案', 'ok');
            });
        }
      },
      {
        title: '客服電話少接很多',
        text: '本月 412 則提問，344 則 AI 自己解決，待補問答歸零。',
        autoplayMs: 8000,
        render: function (stage, api) {
          stage.innerHTML = '<div class="f11-stage">' +
            head('這個月的結果', fmt.month(D.currentMonth) + '　' + D.company.name,
              '<span class="badge badge--ok" data-clear>待補問答 0 題</span>') +
            '<div class="f11-mini-kpis">' +
              miniKpi('asked', '租客提問', '0', ' 則') +
              miniKpi('ai', 'AI 直接解決', '0', ' 則') +
              miniKpi('human', '轉人工', '0', ' 則') +
              miniKpi('sec', '平均回覆', '0', ' 秒') +
            '</div>' +
            panel('AI 自己解決的比例',
              A.progress(STATS.answered, { max: STATS.asked, kind: 'ok', lg: true, label: '自助解決率', valueLabel: fmt.pct(STATS.answered / STATS.asked, 1) })) +
            panel('對公司的差別',
              '<dl class="kv">' +
                '<dt>以前</dt><dd>' + esc('每一題都要有人接電話、翻資料、回訊息') + '</dd>' +
                '<dt>現在</dt><dd>' + esc(fmt.num(STATS.answered) + ' 則由 AI 照知識庫回，管理員只處理 ' + STATS.escalated + ' 則') + '</dd>' +
                '<dt>知識庫</dt><dd>' + esc('補一次答案，五棟 ' + D.stats.totalUnits + ' 間的租客都受用') + '</dd>' +
              '</dl>') +
            '</div>';
          api.enter(stage.querySelectorAll('.f11-mini-kpi'));
        },
        after: function (stage, api) {
          api.count(stage.querySelector('[data-k="asked"]'), 0, STATS.asked, 1100);
          api.count(stage.querySelector('[data-k="human"]'), 0, STATS.escalated, 1100);
          api.count(stage.querySelector('[data-k="sec"]'), 0, STATS.seconds, 900);
          return api.count(stage.querySelector('[data-k="ai"]'), 0, STATS.answered, 1100)
            .then(function () { return api.highlight(stage.querySelector('[data-clear]')); });
        }
      }
    ]
  });
})();
