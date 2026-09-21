/* js/tours/f14.js — 權限與操作紀錄（f14）功能導覽 7 步
 * 主角：會計看不到身分證 → 切回老闆 → 改 A01 租金 → 操作紀錄立刻多一筆。
 */
(function () {
  'use strict';
  var A = window.App, D = window.DB, TP = window.TourPlayer;
  if (!A || !D || !TP) return;
  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  var UNIT = D.unit('A01');
  var T = D.tenantOf('A01');
  var OWNER = D.ownerOf('A01');

  function card(title, inner, attr) { return '<div class="ts-card"' + (attr || '') + '><h4>' + title + '</h4>' + inner + '</div>'; }
  function row(l, v, cls, id) { return '<div class="ts-row"' + (id ? ' data-row="' + id + '"' : '') + '><span>' + esc(l) + '</span><span class="' + (cls || '') + '">' + v + '</span></div>'; }
  function wrap(i) { return '<div class="ts">' + i + '</div>'; }
  var MASK = '••••••';

  function tenantCard(role, opts) {
    opts = opts || {};
    var can = function (k) { return A.can(role, k); };
    return card(icon('user') + '租客資料　A01<span class="ts-right">' + esc({ boss: '老闆', accountant: '會計', manager: '租務管理員', maintenance: '修繕人員' }[role]) + ' 檢視中</span>',
      row('租客姓名', esc(T.name)) +
      row('聯絡電話', can('phone') ? esc(T.phone) : '<span class="ts-masked">' + MASK + '</span>', can('phone') ? '' : 'ts-masked', 'phone') +
      row('身分證字號', can('idNo') ? esc(T.idNo) : '<span class="ts-masked">' + MASK + '</span>', '', 'idNo') +
      row('租客月租', can('rent') ? '<span data-count="rent">' + fmt.num(opts.rent || T.rent) + '</span> 元' : '<span class="ts-masked">' + MASK + '</span>', 'ts-num', 'rent') +
      row('屋主銀行帳戶', can('bank') ? esc(OWNER.bank) : '<span class="ts-masked">' + MASK + '</span>', '', 'bank') +
      row('本月淨利', can('pnl') ? fmt.money(D.pnlOf('A01').net) : '<span class="ts-masked">' + MASK + '</span>', 'ts-num', 'pnl'),
      ' data-card="t"');
  }

  var AUDIT_BASE = D.auditLog.slice(0, 4);
  function auditTable(extra) {
    var rows = (extra || []).concat(AUDIT_BASE);
    return card(icon('list') + '操作紀錄<span class="ts-right">最新 5 筆</span>',
      '<table class="ts-table"><thead><tr><th>時間</th><th>操作人</th><th>動作</th><th>物件</th><th>變更</th></tr></thead><tbody>' +
      rows.slice(0, 5).map(function (r, i) {
        return '<tr' + (r.isNew ? ' class="is-flag" data-new="1"' : '') + '>' +
          '<td class="num">' + esc(r.at) + '</td><td>' + esc(r.who) + '</td><td>' + esc(r.action) + '</td><td>' + esc(r.unitId) + '</td>' +
          '<td>' + (r.from === '—' ? esc(r.to) : '<span class="ts-strike">' + esc(r.from) + '</span> → <b>' + esc(r.to) + '</b>') + '</td></tr>';
      }).join('') + '</tbody></table>', ' data-card="a"');
  }

  var STEPS = [
    {
      title: '老闆看得到全部',
      text: '先從老闆的視角看一位租客。身分證、租金、屋主銀行帳戶、這間房的淨利，全部看得到。',
      render: function (stage, api) {
        stage.innerHTML = wrap(tenantCard('boss'));
        return api.enter('[data-card="t"]');
      }
    },
    {
      title: '換成會計登入',
      text: '同一位租客，會計看到的不一樣。身分證被遮起來——會計的工作用不到，就不該看得到。',
      render: function (stage, api) {
        stage.innerHTML = wrap(tenantCard('accountant'));
        api.enter('[data-card="t"]');
        return api.wait(600).then(function () { return api.highlight('[data-row="idNo"]'); });
      }
    },
    {
      title: '修繕人員看到的更少',
      text: '師傅只需要電話跟修繕成本。租金、押金、屋主帳戶通通遮住——資料外流的風險就少了一大半。',
      render: function (stage, api) {
        stage.innerHTML = wrap(tenantCard('maintenance'));
        api.enter('[data-card="t"]');
        return api.wait(500).then(function () { return api.highlight('[data-row="rent"]'); });
      }
    },
    {
      title: '誰能看什麼，一張表說完',
      text: '這張矩陣就是公司的規矩。要開放或收回某一格，由老闆決定，調整本身也會留下紀錄。',
      render: function (stage, api) {
        var types = [
          { k: 'idNo', n: '身分證字號' }, { k: 'bank', n: '銀行帳戶' }, { k: 'rent', n: '租客租金' },
          { k: 'deposit', n: '押金' }, { k: 'phone', n: '聯絡電話' }, { k: 'repairCost', n: '修繕成本' }, { k: 'pnl', n: '損益與淨利' }
        ];
        var roles = [['boss', '老闆'], ['manager', '租務管理員'], ['accountant', '會計'], ['maintenance', '修繕人員']];
        stage.innerHTML = wrap(card(icon('shield') + '權限矩陣',
          '<table class="ts-table"><thead><tr><th>資料類型</th>' + roles.map(function (r) { return '<th class="num">' + esc(r[1]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          types.map(function (t) {
            return '<tr><td><b>' + esc(t.n) + '</b></td>' + roles.map(function (r) {
              return '<td class="num">' + (A.can(r[0], t.k) ? '<span class="ts-yes">✓</span>' : '<span class="ts-no">—</span>') + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table>', ' data-card="m"'));
        return api.enter('[data-card="m"]');
      }
    },
    {
      title: '切回老闆，改一次租金',
      text: '假設有人把 A01 的租金從 13,000 改成 12,000。這個動作本身沒被擋下——但一定留痕。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-split ts-split--wide">' + tenantCard('boss') +
          card(icon('dollar') + '修改租金',
            '<p class="ts-hint">劉○○（租務管理員）正在編輯</p>' +
            '<div style="display:flex;align-items:center;gap:10px;margin-top:14px">' +
              '<span style="font-size:26px;font-weight:600;font-variant-numeric:tabular-nums" class="ts-strike">13,000</span>' +
              icon('arrow-right') +
              '<span style="font-size:26px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--accent)" data-count="new">13000</span>' +
            '</div>', ' data-card="e"') + '</div>');
        api.enter('[data-card="t"]');
        return api.wait(400)
          .then(function () { return api.enter('[data-card="e"]'); })
          .then(function () { return api.count('[data-count="new"]', 13000, 12000, 800); })
          .then(function () { return api.count('[data-card="t"] [data-count="rent"]', 13000, 12000, 500); });
      }
    },
    {
      title: '操作紀錄立刻多一筆',
      text: '9 月 20 日 14:36，劉○○ 把 A01 租金由 13,000 改為 12,000。時間、人、欄位、改前改後，都在。',
      render: function (stage, api) {
        stage.innerHTML = wrap(auditTable([{ at: '2026-09-20 14:36', who: '劉○○', action: '修改租金', unitId: 'A01', from: '13,000', to: '12,000', isNew: true }]));
        api.enter('[data-card="a"]');
        return api.wait(600).then(function () { return api.highlight('[data-new="1"]'); });
      }
    },
    {
      title: '改錯了，也查得回來',
      text: '老闆隔天看到紀錄，把租金改回 13,000。兩筆都留著——系統不判斷對錯，但誰做的一定查得到。',
      render: function (stage, api) {
        stage.innerHTML = wrap('<div class="ts-result" data-card="res">' +
          '<div class="ts-result-icon">' + icon('shield') + '</div>' +
          '<h3>每一筆金額改動都查得到</h3>' +
          '<p>租金、押金、報價核准、收款登錄——只要牽涉到錢，系統都記下是誰、幾點、從多少改成多少。</p>' +
          '<div class="ts-result-stats">' +
            '<div><strong data-count="c">0</strong><span>本月金額異動</span></div>' +
            '<div><strong data-count="u">0</strong><span>經手人員</span></div>' +
          '</div></div>');
        api.enter('[data-card="res"]');
        return api.wait(500)
          .then(function () { return api.count('[data-count="c"]', 0, 8, 700); })
          .then(function () { return api.count('[data-count="u"]', 0, 4, 500); });
      }
    }
  ];

  function start() {
    var host = document.getElementById('player');
    if (host) TP.mount(host, { feature: 'f14', autoplayMs: 4800, steps: STEPS });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
