/* js/app/f20.js — 資料匯出與所有權（f20）操作頁
 * 契約：docs/DESIGN.md §3（App 元件）、§5（DB.exportSets / exportFormats / exportHistory / apiEndpoints / ownershipPromises）、§6（文案）。
 * 可從頭點到尾的流程：勾選資料 → 選格式 → 開始匯出 → 進度 → 完成並列出檔案 → 匯出紀錄多一筆。
 */
(function () {
  'use strict';

  var A = window.App, D = window.DB;
  if (!A || !D) return;
  var esc = A.esc, icon = A.icon, fmt = A.fmt;

  var EXTRA = {
    setIcon: { tenants: 'users', leases: 'file', billing: 'dollar', repairs: 'wrench', incidents: 'flag', photos: 'image' },
    /* 每個資料集估算的檔案大小（MB），僅供示範 */
    sizeMB: { tenants: 0.4, leases: 0.9, billing: 1.2, repairs: 0.6, incidents: 0.3, photos: 386 },
    added: []
  };

  var state = {
    sets: D.exportSets.map(function (s) { return s.key; }),   /* 預設全選 */
    format: 'csv',
    running: false
  };

  /* ------------------------------------------------------------ 資料集 */
  function renderSets() {
    document.getElementById('f20-set-list').innerHTML = D.exportSets.map(function (s) {
      var on = state.sets.indexOf(s.key) >= 0;
      return '<label class="f20-set' + (on ? ' is-on' : '') + '">' +
        '<input type="checkbox" data-set="' + esc(s.key) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="f20-set-icon">' + icon(EXTRA.setIcon[s.key] || 'database') + '</span>' +
        '<span class="f20-set-body">' +
          '<span class="f20-set-name">' + esc(s.name) + '<span class="f20-set-count">' + fmt.num(s.count()) + ' 筆</span></span>' +
          '<span class="f20-set-note">' + esc(s.note) + '</span>' +
        '</span></label>';
    }).join('');
    var all = state.sets.length === D.exportSets.length;
    document.getElementById('f20-toggle-all').textContent = all ? '全部取消' : '全選';
  }

  function renderFormats() {
    document.getElementById('f20-format-list').innerHTML = D.exportFormats.map(function (f) {
      var on = state.format === f.key;
      return '<label class="f20-format' + (on ? ' is-on' : '') + '">' +
        '<input type="radio" name="f20-format" data-format="' + esc(f.key) + '"' + (on ? ' checked' : '') + '>' +
        '<span><span class="f20-format-name">' + esc(f.name) + '</span>' +
        '<span class="f20-format-note">' + esc(f.note) + '</span></span></label>';
    }).join('');
  }

  function totalRows() {
    return state.sets.reduce(function (n, k) {
      var s = D.exportSets.filter(function (x) { return x.key === k; })[0];
      return n + (s ? s.count() : 0);
    }, 0);
  }
  function totalSize() {
    var mb = state.sets.reduce(function (n, k) { return n + (EXTRA.sizeMB[k] || 0); }, 0);
    if (state.format === 'zip') return mb;
    /* CSV／JSON 不含照片原檔 */
    return state.sets.indexOf('photos') >= 0 ? mb - EXTRA.sizeMB.photos + 0.2 : mb;
  }
  function sizeText(mb) { return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : (mb < 1 ? (mb * 1024).toFixed(0) + ' KB' : mb.toFixed(1) + ' MB'); }

  function renderSummary() {
    var host = document.getElementById('f20-summary');
    if (!state.sets.length) {
      host.innerHTML = '<p class="f20-summary-empty">' + icon('alert-circle') + '還沒有勾選任何資料。</p>';
      document.getElementById('f20-run').disabled = true;
      return;
    }
    document.getElementById('f20-run').disabled = false;
    var fmtName = D.exportFormats.filter(function (f) { return f.key === state.format; })[0].name;
    host.innerHTML = A.statRow([
      { label: '資料集', value: state.sets.length + ' 項' },
      { label: '筆數', value: fmt.num(totalRows()) },
      { label: '預估大小', value: sizeText(totalSize()) }
    ], { sm: true, divided: true }) +
      '<p class="f20-summary-note">' + esc('將以「' + fmtName + '」匯出。') +
      (state.format !== 'zip' && state.sets.indexOf('photos') >= 0 ? '照片會以連結清單匯出，原檔請用完整備份 ZIP。' : '') + '</p>';
  }

  /* -------------------------------------------------------------- 匯出 */
  function runExport() {
    if (state.running || !state.sets.length) return;
    state.running = true;
    var btn = document.getElementById('f20-run');
    btn.disabled = true;
    btn.textContent = '匯出中…';

    var host = document.getElementById('f20-progress');
    var steps = state.sets.map(function (k) {
      return D.exportSets.filter(function (x) { return x.key === k; })[0];
    });
    host.innerHTML = '<div class="f20-progress">' +
      '<div class="progress progress--lg"><span class="progress-bar" id="f20-bar" style="width:0%"></span></div>' +
      '<p class="f20-progress-text" id="f20-progress-text">準備中…</p>' +
      '</div>';

    var bar = document.getElementById('f20-bar');
    var text = document.getElementById('f20-progress-text');
    var i = 0;
    function tick() {
      if (i >= steps.length) { finish(); return; }
      var pct = Math.round((i + 1) / steps.length * 100);
      bar.style.width = pct + '%';
      text.textContent = '正在匯出「' + steps[i].name + '」（' + fmt.num(steps[i].count()) + ' 筆）…';
      i++;
      setTimeout(tick, 480);
    }
    function finish() {
      bar.style.width = '100%';
      var fmtObj = D.exportFormats.filter(function (f) { return f.key === state.format; })[0];
      var ext = state.format === 'zip' ? 'zip' : state.format;
      var files = state.format === 'zip'
        ? [{ name: 'zwzs-backup-' + D.today + '.zip', size: sizeText(totalSize()) }]
        : steps.map(function (s) {
            return { name: s.key + '-' + D.today + '.' + ext, size: sizeText(EXTRA.sizeMB[s.key] || 0.2) };
          });
      host.innerHTML = '<div class="f20-done">' +
        '<div class="f20-done-head">' + icon('check-circle') + '<span>匯出完成</span></div>' +
        '<ul class="f20-files">' + files.map(function (f) {
          return '<li>' + icon('file') + '<span class="f20-file-name">' + esc(f.name) + '</span><span class="muted small">' + esc(f.size) + '</span>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-act="download">下載</button></li>';
        }).join('') + '</ul>' +
        '<p class="muted small f20-done-note">示範畫面不會真的產生檔案。實際系統裡，這些檔案會保留 7 天供下載，並在匯出紀錄留痕。</p>' +
        '</div>';
      EXTRA.added.unshift({
        id: 'EX-' + (43 + EXTRA.added.length), at: D.today + ' ' + clock(),
        by: '張○○', sets: steps.map(function (s) { return s.name; }), format: fmtObj.name, size: sizeText(totalSize())
      });
      renderHistory();
      A.toast('匯出完成，紀錄已留存', 'ok');
      btn.disabled = false; btn.textContent = '開始匯出';
      state.running = false;
    }
    setTimeout(tick, 320);
  }
  var clockMin = 10 * 60 + 12;
  function clock() { clockMin += 4; var h = Math.floor(clockMin / 60) % 24, m = clockMin % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }

  /* ------------------------------------------------------------ 匯出紀錄 */
  function renderHistory() {
    var rows = EXTRA.added.concat(D.exportHistory);
    document.getElementById('f20-history-count').textContent = rows.length + ' 筆';
    document.getElementById('f20-history').innerHTML = A.table({
      columns: [
        { key: 'at', label: '時間', render: function (r) { return '<span class="tnum">' + esc(r.at) + '</span>'; } },
        { key: 'by', label: '執行者' },
        { key: 'sets', label: '匯出內容', sortable: false, render: function (r) {
            var list = Array.isArray(r.sets) ? r.sets : [r.sets];
            if (list.length > 3) return esc(list.slice(0, 3).join('、')) + ' 等 ' + list.length + ' 項';
            return esc(list.join('、'));
          } },
        { key: 'format', label: '格式' },
        { key: 'size', label: '大小', align: 'num' }
      ],
      rows: rows, className: 'f20-history-table'
    });
  }

  /* ---------------------------------------------------------------- API */
  function renderEndpoints() {
    document.getElementById('f20-endpoints').innerHTML = '<div class="f20-endpoints">' + D.apiEndpoints.map(function (e, n) {
      return '<details class="f20-endpoint"' + (n === 0 ? ' open' : '') + '>' +
        '<summary>' +
          '<span class="f20-method f20-method--' + esc(e.method.toLowerCase()) + '">' + esc(e.method) + '</span>' +
          '<code class="f20-path">' + esc(e.path) + '</code>' +
          '<span class="f20-endpoint-desc">' + esc(e.desc) + '</span>' +
        '</summary>' +
        '<pre class="f20-sample"><code>' + esc(e.sample) + '</code></pre>' +
        '</details>';
    }).join('') + '</div>' +
    '<p class="muted small f20-api-note">認證用你自己的金鑰，可隨時停用。示範站沒有真的 API，上面是實際專案會提供的格式。</p>';
  }

  function renderPromises() {
    document.getElementById('f20-promises').innerHTML = D.ownershipPromises.map(function (p, n) {
      return '<div class="f20-promise-item">' +
        '<span class="f20-promise-n">' + (n + 1) + '</span>' +
        '<h3>' + esc(p.title) + '</h3>' +
        '<p>' + esc(p.text) + '</p>' +
        '</div>';
    }).join('');
  }

  /* -------------------------------------------------------------- 綁定 */
  function bind() {
    document.addEventListener('change', function (e) {
      var setBox = e.target.closest('[data-set]');
      if (setBox) {
        var k = setBox.getAttribute('data-set');
        var i = state.sets.indexOf(k);
        if (setBox.checked && i < 0) state.sets.push(k);
        else if (!setBox.checked && i >= 0) state.sets.splice(i, 1);
        renderSets(); renderSummary();
        return;
      }
      var fmtBox = e.target.closest('[data-format]');
      if (fmtBox) { state.format = fmtBox.getAttribute('data-format'); renderFormats(); renderSummary(); }
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest('#f20-toggle-all')) {
        state.sets = state.sets.length === D.exportSets.length ? [] : D.exportSets.map(function (s) { return s.key; });
        renderSets(); renderSummary(); return;
      }
      if (e.target.closest('#f20-run')) { runExport(); return; }
      if (e.target.closest('[data-act="download"]')) { A.toast('示範畫面不會真的下載檔案', 'neutral'); return; }
      if (e.target.closest('#f20-goto-api')) {
        document.getElementById('f20-api').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  function init() {
    renderSets(); renderFormats(); renderSummary(); renderHistory(); renderEndpoints(); renderPromises();
    bind(); A.reveal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
