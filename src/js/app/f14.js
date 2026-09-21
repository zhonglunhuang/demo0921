/* js/app/f14.js — 權限與操作紀錄（f14）操作頁
 * 契約：docs/DESIGN.md §3（App.can / App.mask / 角色切換）、§5（DB.permissions、DB.auditLog）、§6（文案）。
 * 可從頭點到尾的流程：切成會計 → 身分證被遮住 → 切回老闆 → 改 A01 租金 → 操作紀錄立刻多一筆。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB;
  if (!A || !D) return;
  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  var ROLE_LIST = ['boss', 'manager', 'accountant', 'maintenance'];
  var ROLE_NAME = { boss: '老闆', manager: '租務管理員', accountant: '會計', maintenance: '修繕人員' };
  var ROLE_DESC = {
    boss: '看得到全部，包含損益與銀行帳戶',
    manager: '租客與租約全部看得到，看不到屋主銀行帳戶',
    accountant: '帳款與銀行帳戶看得到，看不到租客身分證',
    maintenance: '只看得到修繕要用的：聯絡電話與修繕成本'
  };

  /* 這一頁新增的操作紀錄（重新整理即消失） */
  var EXTRA = { added: [], demoUnit: 'A01' };

  function auditRows() { return EXTRA.added.concat(D.auditLog); }
  function maskValue(key, value) {
    if (A.can(A.role, key)) return { text: value, masked: false };
    var s = String(value == null ? '' : value);
    var tail = s.length > 3 ? s.slice(-3) : '';
    return { text: '••••••' + tail, masked: true };
  }

  /* ------------------------------------------------- 角色切換與租客卡 */
  function renderRoles() {
    document.getElementById('f14-roles').innerHTML = ROLE_LIST.map(function (r) {
      var on = A.role === r;
      return '<button type="button" class="tab' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-role="' + r + '">' +
        '<span>' + esc(ROLE_NAME[r]) + '</span></button>';
    }).join('');
    document.getElementById('f14-role-hint').textContent = '目前身分：' + ROLE_NAME[A.role] + '　·　' + ROLE_DESC[A.role];
  }

  function renderTenantCard() {
    var unit = D.unit(EXTRA.demoUnit);
    var t = D.tenantOf(EXTRA.demoUnit);
    var owner = D.ownerOf(EXTRA.demoUnit);
    var dep = D.depositOf(EXTRA.demoUnit);
    var pnl = D.pnlOf(EXTRA.demoUnit);

    var fields = [
      { key: null, label: '物件', value: unit.region + ' ' + unit.id + '　' + unit.type },
      { key: null, label: '租客姓名', value: t.name },
      { key: 'phone', label: '聯絡電話', value: t.phone },
      { key: 'idNo', label: '身分證字號', value: t.idNo },
      { key: 'rent', label: '租客月租', value: fmt.money(t.rent) },
      { key: 'deposit', label: '押金', value: fmt.money(dep ? dep.amount : t.deposit) },
      { key: 'ownerRent', label: '付屋主月租', value: fmt.money(unit.ownerRent) },
      { key: 'bank', label: '屋主銀行帳戶', value: owner.bank },
      { key: 'repairCost', label: '本月修繕成本', value: fmt.money(pnl.repair) },
      { key: 'pnl', label: '本月淨利', value: fmt.money(pnl.net) }
    ];

    var hiddenCount = fields.filter(function (f) { return f.key && !A.can(A.role, f.key); }).length;

    document.getElementById('f14-tenant-card').innerHTML =
      '<div class="f14-tenant">' +
        '<div class="f14-tenant-head">' +
          '<span class="f14-tenant-name">' + esc(t.name) + '</span>' +
          A.badge(ROLE_NAME[A.role] + ' 檢視中', 'accent') +
        '</div>' +
        '<dl class="f14-fields">' + fields.map(function (f) {
          var m = f.key ? maskValue(f.key, f.value) : { text: f.value, masked: false };
          return '<div class="f14-field' + (m.masked ? ' is-masked' : '') + '">' +
            '<dt>' + esc(f.label) + '</dt>' +
            '<dd>' + (m.masked ? icon('lock') + '<span>' + esc(m.text) + '</span>' : esc(m.text)) + '</dd>' +
            '</div>';
        }).join('') + '</dl>' +
        (hiddenCount
          ? '<p class="f14-tenant-note">' + icon('shield') + '以' + esc(ROLE_NAME[A.role]) + '的身分登入時，有 ' + hiddenCount + ' 個欄位被遮住。想看得到，要由老闆在下面的權限矩陣開放。</p>'
          : '<p class="f14-tenant-note f14-tenant-note--ok">' + icon('shield') + '老闆看得到全部欄位。切換成會計或修繕人員，敏感欄位會立刻被遮住。</p>') +
      '</div>';
  }

  /* -------------------------------------------------------- 權限矩陣 */
  function renderMatrix() {
    var rows = D.dataTypes.map(function (dt) {
      var row = { type: dt.name, key: dt.key };
      ROLE_LIST.forEach(function (r) {
        row[r] = A.can(r, dt.key)
          ? '<span class="f14-yes" title="看得到">' + icon('check') + '<span class="sr-only">看得到</span></span>'
          : '<span class="f14-no" title="看不到">' + icon('minus') + '<span class="sr-only">看不到</span></span>';
      });
      return row;
    });
    document.getElementById('f14-matrix').innerHTML =
      '<p class="muted f14-matrix-lead">打勾代表這個角色看得到這類資料。身分證、銀行帳戶這種一旦外流就很難收拾的欄位，預設只開給真的需要的人。</p>' +
      A.table({
        columns: [{ key: 'type', label: '資料類型' }].concat(ROLE_LIST.map(function (r) {
          return { key: r, label: ROLE_NAME[r], align: 'center', sortable: false, render: function (row) { return row[r]; } };
        })),
        rows: rows, className: 'f14-matrix-table'
      }) +
      '<p class="muted small f14-matrix-note">這張表是示範用的現況；實際專案裡每一格都能由老闆調整，調整本身也會留下一筆操作紀錄。</p>';
  }

  /* ------------------------------------------------------ 改租金示範 */
  function renderTry() {
    var unit = D.unit(EXTRA.demoUnit);
    var t = D.tenantOf(EXTRA.demoUnit);
    var canEdit = A.can(A.role, 'rent');
    document.getElementById('f14-try').innerHTML =
      '<div class="f14-try">' +
        '<div class="f14-try-info">' +
          '<span class="f14-try-label">' + esc(unit.region + ' ' + unit.id + '　' + t.name) + '</span>' +
          '<span class="f14-try-rent" id="f14-current-rent">' + esc(fmt.money(t.rent)) + '</span>' +
          '<span class="muted small">目前的租客月租</span>' +
        '</div>' +
        (canEdit
          ? '<div class="f14-try-form">' +
              '<label class="field"><span class="field-hint">改成</span>' +
                '<input class="input" id="f14-new-rent" type="number" step="100" value="' + (t.rent - 1000) + '" aria-label="新的月租金額"></label>' +
              '<button type="button" class="btn btn--primary" id="f14-save-rent">儲存租金</button>' +
            '</div>'
          : '<div class="f14-try-locked">' + icon('lock') + '<span>以' + esc(ROLE_NAME[A.role]) + '的身分看不到也改不了租金。切換成老闆或租務管理員再試一次。</span></div>') +
      '</div>';
  }

  function saveRent() {
    var t = D.tenantOf(EXTRA.demoUnit);
    var input = document.getElementById('f14-new-rent');
    var v = parseInt(input && input.value, 10);
    if (!v || v <= 0) { A.toast('請填一個大於 0 的金額', 'warn'); return; }
    if (v === t.rent) { A.toast('金額沒有改變', 'neutral'); return; }
    var from = t.rent, staff = currentStaff();
    t.rent = v;
    D.unit(EXTRA.demoUnit).rent = v;
    EXTRA.added.unshift({
      at: D.today + ' ' + nextClock(), who: staff.name, role: staff.roleName,
      action: '修改租金', unitId: EXTRA.demoUnit, field: '租客租金',
      from: fmt.num(from), to: fmt.num(v), note: '本次示範操作'
    });
    A.toast('已改為 ' + fmt.money(v) + '，操作紀錄多了一筆', 'ok');
    renderTenantCard(); renderTry(); renderAudit();
    var first = document.querySelector('.f14-audit-table tbody tr');
    if (first) { first.classList.add('f14-flash'); setTimeout(function () { first.classList.remove('f14-flash'); }, 1600); }
  }

  var clockMin = 16 * 60 + 8;
  function nextClock() { clockMin += 3; var h = Math.floor(clockMin / 60) % 24, m = clockMin % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  function currentStaff() {
    var s = D.staff.filter(function (x) { return x.role === A.role; })[0];
    return s || D.staff[0];
  }

  /* -------------------------------------------------------- 操作紀錄 */
  var filters = { who: '全部', action: '全部', unit: '全部' };

  function renderAuditFilters() {
    var rows = auditRows();
    function fill(id, values, allLabel) {
      var sel = document.getElementById(id);
      var cur = sel.value;
      sel.innerHTML = ['全部'].concat(values).map(function (v) {
        return '<option value="' + esc(v) + '">' + esc(v === '全部' ? allLabel : v) + '</option>';
      }).join('');
      if (cur) sel.value = cur;
    }
    fill('f14-filter-who', uniq(rows.map(function (r) { return r.who; })), '所有人員');
    fill('f14-filter-action', uniq(rows.map(function (r) { return r.action; })), '所有動作');
    fill('f14-filter-unit', uniq(rows.map(function (r) { return r.unitId; }).filter(function (u) { return u && u !== '—'; })), '所有物件');
  }
  function uniq(a) { var seen = {}, out = []; a.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } }); return out; }

  function renderAudit() {
    var rows = auditRows().filter(function (r) {
      if (filters.who !== '全部' && r.who !== filters.who) return false;
      if (filters.action !== '全部' && r.action !== filters.action) return false;
      if (filters.unit !== '全部' && r.unitId !== filters.unit) return false;
      return true;
    });
    document.getElementById('f14-audit-count').textContent = rows.length + ' 筆';
    var host = document.getElementById('f14-audit-table');
    if (!rows.length) {
      host.innerHTML = A.emptyState({ sm: true, icon: 'list', title: '這個條件下沒有紀錄', text: '換個人員、動作或物件再查一次。' });
      return;
    }
    host.innerHTML = A.table({
      columns: [
        { key: 'at', label: '時間', render: function (row) { return '<span class="tnum">' + esc(row.at) + '</span>'; } },
        { key: 'who', label: '操作人', render: function (row) { return esc(row.who) + '<span class="muted small">　' + esc(row.role) + '</span>'; } },
        { key: 'action', label: '動作' },
        { key: 'unitId', label: '物件' },
        { key: 'field', label: '欄位' },
        { key: 'change', label: '變更內容', sortable: false, render: function (row) {
            if (row.from === '—') return '<span class="f14-to">' + esc(row.to) + '</span>';
            return '<span class="f14-from">' + esc(row.from) + '</span>' + icon('arrow-right') + '<span class="f14-to">' + esc(row.to) + '</span>';
          } },
        { key: 'note', label: '備註', render: function (row) { return row.note ? esc(row.note) : '<span class="muted-2">—</span>'; } }
      ],
      rows: rows, className: 'f14-audit-table'
    });
  }

  /* -------------------------------------------------------------- 綁定 */
  function bind() {
    document.addEventListener('click', function (e) {
      var r = e.target.closest('#f14-roles [data-role]');
      if (r) { A.setRole(r.getAttribute('data-role')); return; }
      if (e.target.closest('#f14-save-rent')) saveRent();
    });
    ['who', 'action', 'unit'].forEach(function (k) {
      document.getElementById('f14-filter-' + k).addEventListener('change', function (e) {
        filters[k] = e.target.value; renderAudit();
      });
    });
    A.onRole(function () { renderRoles(); renderTenantCard(); renderTry(); });
  }

  function init() {
    renderRoles(); renderTenantCard(); renderMatrix(); renderTry();
    renderAuditFilters(); renderAudit(); bind(); A.reveal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
