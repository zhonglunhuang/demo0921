/* js/tours/f13.js — 證據留存（f13）功能導覽 7 步
 * 主角：B11 欠租 12 天的催租通知往返（N-2031 / N-2032）。
 */
(function () {
  'use strict';
  var A = window.App, D = window.DB, TP = window.TourPlayer;
  if (!A || !D || !TP) return;
  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  var UNIT = D.unit('B11');
  var T = D.tenantOf('B11');
  var N1 = D.notifications.filter(function (n) { return n.id === 'N-2031'; })[0];
  var N2 = D.notifications.filter(function (n) { return n.id === 'N-2032'; })[0];

  function card(title, inner, attr) { return '<div class="ts-card"' + (attr || '') + '><h4>' + title + '</h4>' + inner + '</div>'; }
  function row(l, v, cls) { return '<div class="ts-row"><span>' + esc(l) + '</span><span class="' + (cls || '') + '">' + v + '</span></div>'; }
  function msg(m) {
    return '<div class="ts-msg ts-msg--' + (m.me ? 'me' : 'them') + '"' + (m.id ? ' data-msg="' + m.id + '"' : '') + '>' +
      (m.who ? '<span class="ts-msg-who">' + esc(m.who) + '</span>' : '') + esc(m.text) +
      (m.meta ? '<span class="ts-msg-meta">' + esc(m.meta) + '</span>' : '') + '</div>';
  }
  function phone(msgs) {
    return '<div class="ts-phone" data-card="phone"><div class="ts-phone-bar">LINE · 安居包租代管</div>' +
      '<div class="ts-phone-body">' + msgs.map(msg).join('') + '</div></div>';
  }
  function wrap(inner) { return '<div class="ts">' + inner + '</div>'; }

  var STEPS = [
    {
      title: '系統發出催租通知',
      text: '租金到期後第 6 天，系統依規則自動發出第一次提醒。是誰發的、內容寫什麼，當下就記下來。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-split">' +
          card(icon('bell') + '通知 ' + N1.id,
            row('對象', UNIT.id + '　' + T.name) +
            row('管道', N1.channel) +
            row('發送時間', N1.sentAt) +
            '<p class="ts-hint" style="margin-top:12px">' + esc(N1.content) + '</p>', ' data-card="n"') +
          phone([{ who: '安居包租代管', text: N1.content, meta: N1.sentAt }]));
        api.enter('[data-card="n"]');
        return api.wait(400).then(function () { return api.enter('[data-card="phone"]'); });
      }
    },
    {
      title: '送達與已讀都記下來',
      text: '訊息有沒有送到、對方幾點看的，系統各留一筆。後面就不會出現「我沒收到」這種爭議。',
      render: function (stage, api) {
        stage.innerHTML = wrap(card(icon('check-circle') + '送達狀態',
          row('發送', N1.sentAt) +
          row('送達', '<span data-badge="d" class="badge">等待中</span>') +
          row('已讀', '<span data-badge="r" class="badge">等待中</span>') +
          row('回覆', '<span data-badge="rep" class="badge">等待中</span>'), ' data-card="s"'));
        api.enter('[data-card="s"]');
        return api.wait(500)
          .then(function () { return api.badge('[data-badge="d"]', N1.deliveredAt.slice(11) + ' 已送達', 'ok'); })
          .then(function () { return api.badge('[data-badge="r"]', N1.readAt.slice(11) + ' 已讀', 'ok'); })
          .then(function () { return api.badge('[data-badge="rep"]', N1.repliedAt.slice(11) + ' 已回覆', 'accent'); });
      }
    },
    {
      title: '對方回了什麼，一字不差',
      text: '租客說「下週一繳」。這句話本身就是證據——後面如果沒繳，這筆紀錄就是依據。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-split">' +
          phone([
            { who: '安居包租代管', text: N1.content, meta: N1.sentAt },
            { who: T.name, text: N1.reply, meta: N1.repliedAt, id: 'reply' }
          ]) +
          card(icon('message') + '系統記下的回覆',
            row('回覆時間', N1.repliedAt) +
            row('回覆內容', '<span style="font-weight:400">' + esc(N1.reply) + '</span>') +
            '<p class="ts-hint" style="margin-top:12px">原文照存，不做摘要，也不能事後修改。</p>', ' data-card="r"'));
        api.enter('[data-card="phone"]');
        return api.wait(400)
          .then(function () { return api.enter('[data-card="r"]'); })
          .then(function () { return api.highlight('[data-msg="reply"]'); });
      }
    },
    {
      title: '沒繳，第二次通知',
      text: '約定的日子過了還是沒繳。系統照升級規則再發一次，這次對方讀了但沒回。',
      render: function (stage, api) {
        stage.innerHTML = wrap(card(icon('bell') + '通知 ' + N2.id,
          row('發送時間', N2.sentAt) +
          row('內容', '<span style="font-weight:400">' + esc(N2.content) + '</span>') +
          row('送達', N2.deliveredAt.slice(11) + ' 已送達') +
          row('已讀', N2.readAt.slice(11) + ' 已讀') +
          row('回覆', '<span class="badge badge--warn" data-badge="rep">未回覆</span>'), ' data-card="n"'));
        api.enter('[data-card="n"]');
        return api.wait(600).then(function () { return api.highlight('[data-badge="rep"]'); });
      }
    },
    {
      title: '完整往返一頁看完',
      text: '兩次通知、一次回覆、逾期天數，排在同一條時間軸上。不用翻 LINE、不用問同事。',
      render: function (stage, api) {
        stage.innerHTML = wrap(card(icon('clock') + UNIT.id + '　' + T.name + '　欠租往返紀錄',
          '<ol class="ts-tl">' +
          [
            { at: '09/05', text: '9 月租金到期，金額 ' + fmt.money(T.rent), by: '系統', kind: '' },
            { at: '09/11 09:00', text: '第一次催租通知已送達', by: 'AI', kind: 'accent' },
            { at: '09/11 12:35', text: '租客回覆：' + N1.reply, by: T.name, kind: '' },
            { at: '09/16 09:00', text: '第二次催租通知已送達、21:04 已讀', by: 'AI', kind: 'accent' },
            { at: '09/21', text: '仍未繳納，已逾期 ' + T.arrearsDays + ' 天，金額 ' + fmt.money(T.arrearsAmount), by: '系統', kind: 'danger' }
          ].map(function (t) {
            return '<li class="' + (t.kind ? 'is-' + t.kind : '') + '"><span class="ts-tl-time">' + esc(t.at) + '</span>' +
              '<span class="ts-tl-text">' + esc(t.text) + '</span><span class="ts-tl-by">' + esc(t.by) + '</span></li>';
          }).join('') + '</ol>', ' data-card="tl"'));
        return api.enter('[data-card="tl"]');
      }
    },
    {
      title: '照片也一起歸檔',
      text: '點交、報修、完工的照片依日期與物件分好。三年後要找某間房當初交屋的樣子，一秒就找到。',
      render: function (stage, api) {
        var ph = D.photos.slice(0, 6);
        stage.innerHTML = wrap(card(icon('image') + '照片歸檔<span class="ts-right">依日期與物件分組</span>',
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">' + ph.map(function (p, i) {
            return '<figure data-ph="' + i + '" style="margin:0">' +
              '<img src="' + esc(p.src) + '" alt="' + esc(p.tag) + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;border:1px solid var(--line-soft)">' +
              '<figcaption style="font-size:11.5px;color:var(--ink-3);margin-top:4px">' + esc(p.date + '　' + p.unitId + '　' + p.tag) + '</figcaption></figure>';
          }).join('') + '</div>', ' data-card="ph"'));
        return api.enter('[data-card="ph"] [data-ph]');
      }
    },
    {
      title: '要用的時候拿得出來',
      text: '真的走到法律程序，一鍵匯出這件事的完整證據包：通知、回覆、照片、時間軸，含送達證明。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-result" data-card="res">' +
          '<div class="ts-result-icon">' + icon('shield') + '</div>' +
          '<h3>證據包已備妥</h3>' +
          '<p>B11 欠租案件：<span data-count="n">0</span> 則通知、<span data-count="p">0</span> 張照片、完整送達與已讀時間，一次匯出。</p>' +
          '<ul class="ts-files" style="max-width:420px;margin:0 auto;text-align:left">' +
            '<li>' + icon('file') + '<span>B11-催租往返紀錄.pdf</span><span class="ts-file-size">218 KB</span></li>' +
            '<li>' + icon('image') + '<span>B11-照片與點交紀錄.zip</span><span class="ts-file-size">12.4 MB</span></li>' +
          '</ul></div>');
        api.enter('[data-card="res"]');
        return api.wait(500)
          .then(function () { return api.count('[data-count="n"]', 0, 2, 600); })
          .then(function () { return api.count('[data-count="p"]', 0, 10, 600); });
      }
    }
  ];

  function start() {
    var host = document.getElementById('player');
    if (host) TP.mount(host, { feature: 'f13', autoplayMs: 4800, steps: STEPS });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
