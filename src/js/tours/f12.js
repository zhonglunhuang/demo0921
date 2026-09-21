/* js/tours/f12.js — 重大事件管理（f12）功能導覽 8 步
 * 契約：docs/DESIGN.md §4（播放器與 api）、§5（INC-07）、§6（文案）。
 * 主角：INC-07 B04 浴室漏水至樓下 B03。
 */
(function () {
  'use strict';
  var A = window.App, D = window.DB, TP = window.TourPlayer;
  if (!A || !D || !TP) return;
  var esc = A.esc, icon = A.icon;

  var INC = D.incident('INC-07');
  var WO = D.workOrder('WO-1046');
  var MGR = D.staffById('S02');
  var VENDOR = D.vendorById('V01');

  /* ---------------- 舞台元件（960 × 600） ---------------- */
  function phone(msgs) {
    return '<div class="f12t-phone" data-card="phone">' +
      '<div class="f12t-phone-bar">LINE · 安居包租代管</div>' +
      '<div class="f12t-phone-body">' + msgs.map(function (m) {
        return '<div class="f12t-msg f12t-msg--' + (m.me ? 'me' : 'them') + '">' +
          (m.who ? '<span class="f12t-msg-who">' + esc(m.who) + '</span>' : '') +
          '<span class="f12t-msg-text">' + esc(m.text) + '</span></div>';
      }).join('') + '</div></div>';
  }
  function card(title, inner, attr) {
    return '<div class="f12t-card"' + (attr || '') + '><h4>' + title + '</h4>' + inner + '</div>';
  }
  function row(label, value, cls) {
    return '<div class="f12t-row"><span>' + esc(label) + '</span><span class="' + (cls || '') + '">' + value + '</span></div>';
  }
  function tl(items) {
    return '<ol class="f12t-tl">' + items.map(function (t) {
      return '<li' + (t.id ? ' data-tl="' + t.id + '"' : '') + (t.kind ? ' class="is-' + t.kind + '"' : '') + '>' +
        '<span class="f12t-tl-time">' + esc(t.at) + '</span>' +
        '<span class="f12t-tl-text">' + esc(t.text) + '</span>' +
        '<span class="f12t-tl-by">' + esc(t.by) + '</span></li>';
    }).join('') + '</ol>';
  }
  function stageWrap(inner) { return '<div class="f12t-stage">' + inner + '</div>'; }

  var STEPS = [
    {
      title: '樓下住戶通報',
      text: '晚上八點多，B03 的租客在 LINE 說天花板一直滴水。這時候還沒有人知道是誰家的問題。',
      render: function (stage, api) {
        stage.innerHTML = stageWrap(
          '<div class="f12t-split">' +
            phone([{ who: 'B03 租客', text: INC.chat[0].text }]) +
            card(icon('alert') + '系統收到訊息', '<p class="f12t-hint">AI 先判斷這是哪一種問題——是「燈泡壞了」那種日常修繕，還是會牽涉到第三人的重大事件。</p>', ' data-card="ai"') +
          '</div>');
        api.enter('[data-card="phone"]');
        return api.wait(400).then(function () { return api.enter('[data-card="ai"]'); });
      }
    },
    {
      title: 'AI 判定為緊急',
      text: '關鍵字是「滴水」加上「樓下」。牽涉到第三人、而且會越拖越貴，系統直接標成緊急事件。',
      render: function (stage, api) {
        stage.innerHTML = stageWrap(
          card(icon('bot') + 'AI 判定結果',
            row('事件類型', '漏水至樓下') +
            row('牽涉對象', 'B04 租客、B03 租客（第三人）') +
            row('判定等級', '<span class="badge" data-badge="level">判定中</span>') +
            row('處理方式', '立即電話加 LINE 通知值班人員'),
            ' data-card="ai"'));
        api.enter('[data-card="ai"]');
        return api.wait(700).then(function () { return api.badge('[data-badge="level"]', '緊急', 'danger'); });
      }
    },
    {
      title: '立刻找到人',
      text: '緊急事件不等人看系統。系統直接指派負責人，並同時用電話與 LINE 通知——這一層在升級規則裡設定好了。',
      render: function (stage, api) {
        stage.innerHTML = stageWrap(
          '<div class="f12t-split">' +
            card(icon('user') + '指派負責人',
              '<div class="f12t-assignee" data-card="who"><span class="f12t-avatar">' + esc(MGR.name.charAt(0)) + '</span>' +
              '<span><strong>' + esc(MGR.name) + '</strong><small>' + esc(MGR.roleName) + '　' + esc(MGR.phone) + '</small></span></div>') +
            card(icon('bell') + '通知已送出',
              '<div class="f12t-notify" data-card="n1">' + icon('phone') + '<span>電話　08:14 已接通</span></div>' +
              '<div class="f12t-notify" data-card="n2">' + icon('message') + '<span>LINE　08:14 已讀</span></div>') +
          '</div>');
        api.enter('[data-card="who"]');
        return api.wait(500).then(function () { return api.enter('[data-card="n1"], [data-card="n2"]'); });
      }
    },
    {
      title: '先止水，再修',
      text: '管理員到場前先請 B04 關掉進水開關。損害停止擴大，後面的修繕才不會越滾越大。',
      render: function (stage, api) {
        stage.innerHTML = stageWrap(
          '<div class="f12t-split">' +
            phone([
              { who: MGR.name, text: '不好意思打擾，您樓下反映天花板漏水，可以先把浴室進水總開關關起來嗎？', me: true },
              { who: 'B04 租客', text: '好，我關了' }
            ]) +
            card(icon('clock') + '目前時間軸', tl(INC.timeline.slice(0, 3).map(function (t, i) {
              return { at: t.at.slice(11), text: t.text, by: t.by, kind: i === 0 ? 'danger' : '' };
            })), ' data-card="tl"') +
          '</div>');
        api.enter('[data-card="phone"]');
        return api.wait(400).then(function () { return api.enter('[data-card="tl"]'); });
      }
    },
    {
      title: '派工與報價',
      text: '水電師傅到場確認是防水層破損，系統直接開出工單。事件與工單互相連著，不會變成兩本帳。',
      render: function (stage, api) {
        stage.innerHTML = stageWrap(
          card(icon('wrench') + '工單 ' + WO.id,
            row('物件', 'B04　（波及樓下 B03）') +
            row('項目', WO.item) +
            row('廠商', VENDOR.name + '　平均完工 ' + VENDOR.avgDays + ' 天') +
            row('報價', '<span data-count="quote">0</span> 元', 'f12t-num') +
            row('狀態', '<span class="badge" data-badge="wo">待核准</span>'),
            ' data-card="wo"'));
        api.enter('[data-card="wo"]');
        return api.wait(500)
          .then(function () { return api.count('[data-count="quote"]', 0, WO.quote, 900); })
          .then(function () { return api.badge('[data-badge="wo"]', '已核准', 'ok'); });
      }
    },
    {
      title: '照片與對話都留著',
      text: '通報照片、勘查照片、完工照片，加上跟兩邊租客的每一句對話，全部掛在這一件事底下。',
      render: function (stage, api) {
        stage.innerHTML = stageWrap(
          '<div class="f12t-split">' +
            card(icon('image') + '現場照片（3 張）',
              '<div class="f12t-photos">' + INC.photos.map(function (src, i) {
                return '<img data-photo="' + i + '" src="' + esc(src.replace('../', '../')) + '" alt="現場照片 ' + (i + 1) + '">';
              }).join('') + '</div>', ' data-card="ph"') +
            card(icon('message') + '對話紀錄（4 則）',
              '<div class="f12t-chatlog">' + INC.chat.map(function (c) {
                return '<div class="f12t-chatline"><b>' + esc(c.who) + '</b>' + esc(c.text) + '</div>';
              }).join('') + '</div>', ' data-card="ch"') +
          '</div>');
        api.enter('[data-card="ph"]');
        return api.wait(400).then(function () { return api.enter('[data-card="ch"]'); });
      }
    },
    {
      title: '完整時間軸',
      text: '從通報到結案，每一步是誰、幾點做的都在。三個月後屋主問起，不用翻 LINE 也講得清楚。',
      render: function (stage, api) {
        stage.innerHTML = stageWrap(
          card(icon('clock') + '事件 ' + INC.id + ' 完整時間軸',
            tl(INC.timeline.map(function (t, i) {
              return { at: t.at.slice(5).replace('-', '/'), text: t.text, by: t.by, id: i, kind: i === 0 ? 'danger' : (i === INC.timeline.length - 1 ? 'accent' : '') };
            })), ' data-card="tl"'));
        api.enter('[data-card="tl"]');
        return api.wait(600).then(function () { return api.highlight('[data-tl="6"]'); });
      }
    },
    {
      title: '結案，但紀錄不會消失',
      text: '樓下租客確認修好才算結束。事件從「處理中」移除，照片、對話與時間軸永久保留。',
      render: function (stage, api) {
        stage.innerHTML = stageWrap(
          '<div class="f12t-result" data-card="res">' +
            '<div class="f12t-result-icon">' + icon('check-circle') + '</div>' +
            '<h3>INC-07 已結案</h3>' +
            '<p>從通報到結案共 <span data-count="days">0</span> 天，留下 3 張照片、4 則對話、7 筆時間軸紀錄。</p>' +
            '<div class="f12t-result-stats">' +
              '<div><strong data-count="open">1</strong><span>處理中事件</span></div>' +
              '<div><strong>0</strong><span>緊急</span></div>' +
            '</div>' +
          '</div>');
        api.enter('[data-card="res"]');
        return api.wait(500)
          .then(function () { return api.count('[data-count="days"]', 0, 5, 700); })
          .then(function () { return api.count('[data-count="open"]', 1, 0, 600); });
      }
    }
  ];

  function start() {
    var host = document.getElementById('player');
    if (!host) return;
    TP.mount(host, { feature: 'f12', autoplayMs: 4800, steps: STEPS });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
