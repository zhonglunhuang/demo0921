/* js/tours/f20.js — 資料匯出與所有權（f20）功能導覽 6 步
 * 主角：勾選全部資料 → 完整備份 → 匯出 → API → 三句承諾。
 */
(function () {
  'use strict';
  var A = window.App, D = window.DB, TP = window.TourPlayer;
  if (!A || !D || !TP) return;
  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  function card(title, inner, attr) { return '<div class="ts-card"' + (attr || '') + '><h4>' + title + '</h4>' + inner + '</div>'; }
  function wrap(i) { return '<div class="ts">' + i + '</div>'; }

  var SETS = D.exportSets;
  var totalRows = SETS.reduce(function (n, s) { return n + s.count(); }, 0);

  var STEPS = [
    {
      title: '先問一個不舒服的問題',
      text: '做到 300 戶之後想換系統商，資料帶得走嗎？這件事要在簽約前講清楚，不是出事才問。',
      render: function (stage, api) {
        stage.innerHTML = wrap(card(icon('alert') + '換系統商時最怕的三件事',
          '<ul class="ts-list">' +
            '<li class="ts-item is-bad"><span class="ts-item-main"><b>資料要不回來</b><small>只能看畫面，沒有匯出功能</small></span></li>' +
            '<li class="ts-item is-bad"><span class="ts-item-main"><b>只給部分資料</b><small>給了租客名單，照片與歷史紀錄不給</small></span></li>' +
            '<li class="ts-item is-bad"><span class="ts-item-main"><b>格式打不開</b><small>給一份自訂格式的檔案，沒有人讀得懂</small></span></li>' +
          '</ul>', ' data-card="c"'));
        return api.enter('[data-card="c"] .ts-item');
      }
    },
    {
      title: '勾選要帶走的資料',
      text: '六類資料全部都能匯：租客、租約、帳款、修繕、事件、照片。不必提出申請，自己來。',
      render: function (stage, api) {
        stage.innerHTML = wrap(card(icon('database') + '匯出中心<span class="ts-right">共 ' + fmt.num(totalRows) + ' 筆</span>',
          '<ul class="ts-list">' + SETS.map(function (s, i) {
            return '<li class="ts-item" data-set="' + i + '">' +
              '<span class="ts-item-main"><b>' + esc(s.name) + '</b><small>' + esc(s.note) + '</small></span>' +
              '<span class="ts-item-side">' + fmt.num(s.count()) + ' 筆</span></li>';
          }).join('') + '</ul>', ' data-card="s"'));
        api.enter('[data-card="s"] .ts-item');
        var seq = Promise.resolve();
        SETS.forEach(function (s, i) {
          seq = seq.then(function () { return api.check('[data-set="' + i + '"]'); });
        });
        return seq;
      }
    },
    {
      title: '選格式：要能打得開',
      text: 'CSV 給會計用 Excel 開、JSON 給工程師接、完整備份 ZIP 連照片原檔一起帶走。',
      render: function (stage, api) {
        stage.innerHTML = wrap(card(icon('download') + '檔案格式',
          '<ul class="ts-list">' + D.exportFormats.map(function (f, i) {
            return '<li class="ts-item' + (f.key === 'zip' ? ' is-good' : '') + '" data-fmt="' + i + '">' +
              '<span class="ts-item-main"><b>' + esc(f.name) + '</b><small>' + esc(f.note) + '</small></span>' +
              '<span class="ts-item-side">' + (f.key === 'zip' ? '<span class="badge badge--ok" data-badge="pick">已選擇</span>' : '') + '</span></li>';
          }).join('') + '</ul>', ' data-card="f"'));
        api.enter('[data-card="f"] .ts-item');
        return api.wait(600).then(function () { return api.highlight('[data-fmt="2"]'); });
      }
    },
    {
      title: '按下去，進度跑完',
      text: '六個資料集依序打包。照片原檔比較大，所以完整備份大約 390 MB——這是真的把東西給你。',
      render: function (stage, api) {
        stage.innerHTML = wrap(card(icon('refresh') + '匯出中',
          '<div class="ts-progress"><span data-prog style="width:0%"></span></div>' +
          '<p class="ts-hint" style="margin-top:12px" data-prog-text>準備中…</p>' +
          '<div class="ts-row" style="margin-top:14px"><span>已處理</span><span class="ts-num"><span data-count="rows">0</span> 筆</span></div>', ' data-card="p"'));
        api.enter('[data-card="p"]');
        var bar = stage.querySelector('[data-prog]');
        var txt = stage.querySelector('[data-prog-text]');
        var seq = api.wait(300);
        SETS.forEach(function (s, i) {
          seq = seq.then(function () {
            if (bar) bar.style.width = Math.round((i + 1) / SETS.length * 100) + '%';
            if (txt) txt.textContent = '正在匯出「' + s.name + '」（' + fmt.num(s.count()) + ' 筆）…';
            return api.wait(420);
          });
        });
        return seq.then(function () {
          if (txt) txt.textContent = '打包中…';
          return api.count('[data-count="rows"]', 0, totalRows, 900);
        });
      }
    },
    {
      title: '檔案在你手上',
      text: '一個 ZIP，裡面是六個資料集加照片原檔。這份檔案跟系統無關，誰都打得開。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-split ts-split--wide">' +
          card(icon('check-circle') + '匯出完成',
            '<ul class="ts-files">' +
              '<li>' + icon('file') + '<span>zwzs-backup-2026-09-21.zip</span><span class="ts-file-size">389.4 MB</span></li>' +
              '<li>' + icon('file') + '<span>├ tenants.csv</span><span class="ts-file-size">99 筆</span></li>' +
              '<li>' + icon('file') + '<span>├ leases.csv</span><span class="ts-file-size">206 筆</span></li>' +
              '<li>' + icon('file') + '<span>├ billing.csv</span><span class="ts-file-size">309 筆</span></li>' +
              '<li>' + icon('image') + '<span>└ photos/</span><span class="ts-file-size">10 張原檔</span></li>' +
            '</ul>', ' data-card="d"') +
          card(icon('cloud') + '或者不用匯，直接接 API',
            '<pre class="ts-code">GET /api/v1/units\n\n{\n  "id": "A01",\n  "region": "中壢",\n  "status": "rented",\n  "rent": 13000\n}</pre>', ' data-card="a"'));
        api.enter('[data-card="d"]');
        return api.wait(400).then(function () { return api.enter('[data-card="a"]'); });
      }
    },
    {
      title: '三句話寫進合約',
      text: '匯出功能是技術問題，所有權是合約問題。兩個都談好，才不會做到一半被綁住。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div data-card="res">' +
          '<h3 style="font-size:26px;font-weight:600;margin:0 0 20px;text-align:center">資料是你的</h3>' +
          '<div class="ts-promise">' + D.ownershipPromises.map(function (p, i) {
            return '<div class="ts-promise-item" data-p="' + i + '"><h5>' + esc(p.title) + '</h5><p>' + esc(p.text) + '</p></div>';
          }).join('') + '</div>' +
          '<p style="text-align:center;color:var(--ink-3);font-size:13px;margin:22px 0 0">這三句話會寫進合約，不是口頭承諾。</p>' +
          '</div>');
        return api.enter('[data-card="res"] [data-p]');
      }
    }
  ];

  function start() {
    var host = document.getElementById('player');
    if (host) TP.mount(host, { feature: 'f20', autoplayMs: 5200, steps: STEPS });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
