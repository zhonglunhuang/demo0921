/* js/app/f13.js — 證據留存（f13）進系統操作頁
 * 契約：docs/DESIGN.md §3（外殼與元件）、§5（假資料）、§6（文案）、§6.1（檔案所有權）。
 * 資料：一律讀 window.DB；基礎層沒有的欄位（假照片檔名對照、兩則補充通知、證據包內容）放在本檔的 EXTRA。
 * 狀態：全部存在記憶體，重新整理即回到初始狀態（提案 demo，不做持久化）。
 */
(function () {
  'use strict';

  var A = window.App;
  var D = window.DB;
  if (!A || !D) return;

  var esc = A.esc;
  var icon = A.icon;
  var fmt = A.fmt;

  /* ================================================================
   * 1. 基礎層沒有的資料（只在本檔補，不動 data.js）
   * ================================================================ */
  var EXTRA = {
    /* DB.photos 的假圖檔名對照到本功能自備的 SVG（檔案所有權：assets/f13-*.svg） */
    photoSrc: {
      'photo-leak.svg': '../assets/f13-photo-leak.svg',
      'photo-ceiling.svg': '../assets/f13-photo-ceiling.svg',
      'photo-repair.svg': '../assets/f13-photo-repair.svg',
      'photo-handover.svg': '../assets/f13-photo-handover.svg',
      'photo-meter.svg': '../assets/f13-photo-meter.svg',
      'photo-room.svg': '../assets/f13-photo-room.svg'
    },

    /* 補兩則通知，讓點交與公告也看得到往返（與 DB 既有案件不衝突） */
    notifications: [
      {
        id: 'N-2026', type: '點交', tenantId: null, tenantName: '張○○', unitId: 'C20',
        sentAt: '2026-09-08 11:00', channel: 'LINE',
        content: '已收到您的退租通知，點交時間預定 9 月 10 日下午 3 點，屆時請準備鑰匙與磁扣。',
        delivered: true, deliveredAt: '2026-09-08 11:00', readAt: '2026-09-08 12:18',
        repliedAt: '2026-09-08 12:20', reply: '沒問題，我那天會在。'
      },
      {
        id: 'N-2025', type: '公告', tenantId: null, unitId: null, building: 'A',
        sentAt: '2026-09-08 09:15', channel: 'LINE 群發',
        content: 'A 棟 9 月 12 日上午 9 點至 12 點進行電梯年度保養，保養期間請改走樓梯。',
        delivered: true, deliveredAt: '2026-09-08 09:15', readAt: null,
        repliedAt: null, reply: null, recipients: 20
      }
    ],

    /* 證據包固定附帶的兩份文件 */
    fixedDocs: [
      { icon: 'doc', label: '物件與租約基本資料', qty: 1, unit: '份' },
      { icon: 'shield', label: '匯出時間與操作人紀錄', qty: 1, unit: '份' }
    ]
  };

  var TYPES = ['全部', '催租', '續約', '退租', '點交', '公告'];
  var TYPE_KIND = { 催租: 'warn', 續約: 'accent', 退租: 'neutral', 點交: 'neutral', 公告: 'neutral' };
  var SOURCES = ['全部', '租客上傳', '公司拍攝'];
  var SOURCE_OF = { tenant: '租客上傳', company: '公司拍攝' };

  /* ================================================================
   * 2. 資料整理
   * ================================================================ */
  function baseName(p) { return String(p || '').split('/').pop(); }
  function photoSrc(p) { return EXTRA.photoSrc[baseName(p.src)] || p.src; }
  function timeKey(s) { return Number(String(s || '').replace(/\D/g, '')) || 0; }
  function buildingOf(n) { return n.building || (n.unitId ? n.unitId.charAt(0) : ''); }

  function normalize(n) {
    var tenant = n.tenantId ? D.tenant(n.tenantId) : null;
    return {
      id: n.id, type: n.type, unitId: n.unitId || null, building: buildingOf(n),
      tenantId: n.tenantId || null,
      tenantName: tenant ? tenant.name : (n.tenantName || null),
      phone: tenant ? tenant.phone : null,
      recipients: n.recipients || 0,
      sentAt: n.sentAt, channel: n.channel, content: n.content,
      delivered: n.delivered, deliveredAt: n.deliveredAt || null,
      readAt: n.readAt || null, repliedAt: n.repliedAt || null, reply: n.reply || null,
      by: n.type === '公告' ? '租務管理員 陳○○' : '系統自動發送',
      exported: false, isNew: false
    };
  }

  var rows = D.notifications.concat(EXTRA.notifications).map(normalize)
    .sort(function (a, b) { return timeKey(b.sentAt) - timeKey(a.sentAt); });

  var photos = D.photos.map(function (p) {
    return {
      id: p.id, unitId: p.unitId, date: p.date, by: p.by, tag: p.tag, note: p.note,
      src: photoSrc(p), source: SOURCE_OF[p.by] || '公司拍攝', building: p.unitId.charAt(0)
    };
  }).sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.unitId < b.unitId ? -1 : 1;
  });

  function needsReply(r) { return r.type !== '公告'; }
  function pending(r) { return needsReply(r) && !r.repliedAt; }
  /* 一個物件算一件案子：只看該物件最新一則需要回覆的通知，回了就算結案 */
  function caseUnits() {
    var latest = {}, list = [];
    rows.forEach(function (r) {
      if (!needsReply(r) || !r.unitId) return;
      if (!latest[r.unitId] || timeKey(r.sentAt) > timeKey(latest[r.unitId].sentAt)) latest[r.unitId] = r;
    });
    rows.forEach(function (r) {
      if (latest[r.unitId] === r && !r.repliedAt) list.push(r.unitId);
    });
    return list;
  }
  function rowsOfUnit(unitId) { return rows.filter(function (r) { return r.unitId === unitId; }); }
  function photosOfUnit(unitId) { return photos.filter(function (p) { return p.unitId === unitId; }); }
  function rowById(id) { return rows.filter(function (r) { return r.id === id; })[0] || null; }

  /* ================================================================
   * 3. 狀態（記憶體）
   * ================================================================ */
  var state = {
    type: '全部',
    building: '全部',
    unreplied: false,
    source: '全部',
    selected: 'N-2032',
    flow: 'idle'          /* idle → sent → replied */
  };

  function filtered() {
    return rows.filter(function (r) {
      if (state.type !== '全部' && r.type !== state.type) return false;
      if (state.building !== '全部' && r.building !== state.building) return false;
      if (state.unreplied && !pending(r)) return false;
      return true;
    });
  }
  function filteredPhotos() {
    return photos.filter(function (p) {
      if (state.building !== '全部' && p.building !== state.building) return false;
      if (state.source !== '全部' && p.source !== state.source) return false;
      return true;
    });
  }

  /* ================================================================
   * 4. 權限與遮罩
   * ================================================================ */
  function maskMoney(text) {
    if (A.can('rent')) return text;
    return String(text).replace(/(\d{1,3}(?:,\d{3})+|\d+)(\s*元)/g, '••••$2');
  }
  function maskPhone(v) { return v ? A.mask(v, 'phone') : '—'; }
  function canExport() { return A.can('audit'); }

  function roleNote() {
    var limits = [];
    if (!A.can('rent')) limits.push('通知內容裡的金額');
    if (!A.can('phone')) limits.push('租客電話');
    return '目前是「' + A.roleName() + '」視角：' +
      (limits.length ? limits.join('與') + '會打碼' : '通知內容、金額與租客電話都完整顯示') +
      (canExport() ? '，可以匯出證據包。' : '，也不能匯出證據包。');
  }

  /* ================================================================
   * 5. 畫面：KPI、警示、工具列
   * ================================================================ */
  function renderKpis() {
    var host = document.getElementById('f13-kpis');
    if (!host) return;
    var month = rows.filter(function (r) { return String(r.sentAt).slice(0, 7) === D.currentMonth; });
    var delivered = month.filter(function (r) { return r.delivered; }).length;
    var units = caseUnits();
    var byTenant = photos.filter(function (p) { return p.by === 'tenant'; }).length;
    var typeCount = {};
    month.forEach(function (r) { typeCount[r.type] = (typeCount[r.type] || 0) + 1; });
    var typeHint = TYPES.filter(function (t) { return t !== '全部' && typeCount[t]; })
      .map(function (t) { return t + ' ' + typeCount[t] + ' 則'; }).join('、');

    host.innerHTML =
      A.kpi({ label: '本月對外通知', icon: 'send', value: fmt.num(month.length), unit: ' 則', hint: typeHint }) +
      A.kpi({ label: '送達率', icon: 'check-circle', value: fmt.pct(month.length ? delivered / month.length : 0, 0),
        hint: delivered + ' 則都留有送達時間' }) +
      A.kpi({ label: '等回覆的案件', icon: 'clock', value: fmt.num(units.length), unit: ' 件',
        kind: units.length ? 'warn' : 'ok',
        hint: units.length ? units.join('、') + ' 還沒回' : '所有通知都收到回覆了' }) +
      A.kpi({ label: '留存照片', icon: 'camera', value: fmt.num(photos.length), unit: ' 張',
        hint: '租客上傳 ' + byTenant + ' 張、公司拍攝 ' + (photos.length - byTenant) + ' 張' });
  }

  function renderAlerts() {
    var host = document.getElementById('f13-alerts');
    if (!host) return;
    var html = '';
    var b11 = D.tenantOf('B11');
    var e07 = D.tenantOf('E07');
    var fresh = rowById('N-2034');

    if (state.flow === 'replied' && fresh) {
      html += A.alert('', 'ok', {
        title: 'B11 租客已回覆，這一輪催租往返完整留存',
        html: '<p>' + esc('「' + fresh.reply + '」　回覆時間 ' + fmt.dateTime(fresh.repliedAt) +
          '。發送、送達、已讀、回覆四個時間都在紀錄裡。') + '</p>',
        action: '<button type="button" class="btn btn--secondary btn--sm" data-act="export-unit" data-unit="B11">匯出 B11 證據包</button>'
      });
    } else if (state.flow === 'sent' && fresh) {
      html += A.alert('', 'accent', {
        title: '催租通知已送出，等待送達回報',
        html: '<p>' + esc('對象 B11 ' + b11.name + '，管道 LINE。送達與已讀時間會自動補上。') + '</p>'
      });
    } else {
      html += A.alert('', 'danger', {
        title: 'B11 欠租 ' + b11.arrearsDays + ' 天，第 2 次催租已送達但還沒回覆',
        html: '<p>' + esc('9 月 16 日 09:00 送達、當晚 21:04 已讀，到今天都沒有回覆。可以再發一次，紀錄一樣會留著。') + '</p>',
        action: '<button type="button" class="btn btn--primary btn--sm" data-act="remind">再發一次催租通知</button>'
      });
    }

    html += A.alert('', 'warn', {
      title: 'E07 欠租 ' + e07.arrearsDays + ' 天，通知已送達但未讀',
      html: '<p>' + esc('9 月 19 日 09:00 以 LINE 加簡訊雙管道送出，目前仍未讀，已同步建立事件 INC-04。') + '</p>',
      action: '<button type="button" class="btn btn--secondary btn--sm" data-act="select" data-notice="N-2033">查看往返紀錄</button>'
    });

    host.innerHTML = html;
  }

  function fillTabs(id, items, group) {
    var host = document.getElementById(id);
    if (!host || host.firstElementChild) return;
    var wrap = A.el(A.tabs(items.map(function (t) { return { id: t, label: t }; }), { segmented: true, active: items[0], group: group }));
    host.innerHTML = wrap.innerHTML;
  }
  function syncTabs(id, active) {
    var host = document.getElementById(id);
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('.tab[data-tab]'), function (b) {
      var on = b.getAttribute('data-tab') === active;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function renderToolbar() {
    fillTabs('f13-type-tabs', TYPES, 'f13-type');
    fillTabs('f13-source-tabs', SOURCES, 'f13-source');
    syncTabs('f13-type-tabs', state.type);
    syncTabs('f13-source-tabs', state.source);

    var sel = document.getElementById('f13-building');
    if (sel && !sel.options.length) {
      var opts = ['<option value="全部">全部棟別</option>'];
      Object.keys(D.company.buildings).forEach(function (code) {
        var b = D.company.buildings[code];
        opts.push('<option value="' + code + '">' + esc(b.name + '（' + b.region + '）') + '</option>');
      });
      sel.innerHTML = opts.join('');
    }
    if (sel) sel.value = state.building;

    var note = document.getElementById('f13-role-note');
    if (note) note.innerHTML = icon('info') + '<span>' + esc(roleNote()) + '</span>';

    var btn = document.getElementById('f13-unreplied');
    if (btn) {
      btn.setAttribute('aria-pressed', state.unreplied ? 'true' : 'false');
      btn.classList.toggle('btn--primary', state.unreplied);
      btn.classList.toggle('btn--secondary', !state.unreplied);
    }
    var all = document.getElementById('f13-export-all');
    if (all) {
      all.disabled = !canExport();
      all.title = canExport() ? '' : '目前視角沒有匯出證據包的權限';
    }
  }

  /* ================================================================
   * 6. 畫面：通知紀錄表格
   * ================================================================ */
  function deliveryCell(r) {
    if (!r.delivered) {
      return A.badge('傳送中', 'neutral') + '<span class="f13-cell-sub">' + esc(r.channel) + '</span>';
    }
    return A.badge('已送達', 'ok') +
      '<span class="f13-cell-sub f13-time">' + esc(fmt.time(r.deliveredAt)) + '</span>' +
      (r.readAt ? '<span class="f13-cell-sub f13-time">已讀 ' + esc(fmt.time(r.readAt)) + '</span>' : '');
  }
  function replyCell(r) {
    if (!needsReply(r)) return '<span class="muted-2">群發不需回覆</span>';
    if (r.repliedAt) {
      return A.badge('已回覆', 'ok') + '<span class="f13-cell-sub f13-time">' + esc(fmt.time(r.repliedAt)) + '</span>';
    }
    var days = A.daysBetween(String(r.sentAt).slice(0, 10), D.today);
    return A.badge('未回覆', days >= 3 ? 'danger' : 'warn') +
      '<span class="f13-cell-sub">' + esc(days > 0 ? '已過 ' + days + ' 天' : '今天送出') + '</span>';
  }
  function targetCell(r) {
    var main = r.unitId
      ? r.unitId + '　' + (r.tenantName || '前租客')
      : D.company.buildings[r.building].name + ' 全體租客';
    var sub = r.unitId ? maskPhone(r.phone) : r.recipients + ' 位租客';
    return '<span>' + esc(main) + '</span>' +
      '<span class="f13-cell-sub">' + esc(sub) + '</span>' +
      (r.exported ? '<span class="f13-cell-sub">' + A.badge('證據包已匯出', 'ok') + '</span>' : '');
  }

  function renderTable() {
    var host = document.getElementById('f13-table');
    if (!host) return;
    var list = filtered();
    host.innerHTML = A.table({
      id: 'f13-notices',
      className: 'f13-table',
      columns: [
        { label: '類型', width: '80px', render: function (r) { return A.badge(r.type, TYPE_KIND[r.type] || 'neutral'); } },
        { label: '對象', primary: true, render: targetCell },
        { label: '發送時間', width: '118px', sortable: true, sortValue: function (r) { return timeKey(r.sentAt); },
          render: function (r) {
            return '<span class="f13-time">' + esc(fmt.date(r.sentAt)) + '</span>' +
              '<span class="f13-cell-sub f13-time">' + esc(fmt.time(r.sentAt)) + '</span>';
          } },
        { label: '送達', width: '108px', render: deliveryCell },
        { label: '回覆', width: '112px', render: replyCell },
        { label: '動作', width: '132px', align: 'right', render: function (r) {
          return '<span class="f13-row-actions">' +
            '<button type="button" class="btn btn--secondary btn--sm" data-act="export-notice" data-notice="' + esc(r.id) + '"' +
              (canExport() ? '' : ' disabled') + '>匯出證據包</button></span>';
        } }
      ],
      rows: list,
      rowClass: function (r) { return (r.id === state.selected ? 'is-active' : '') + (r.isNew ? ' is-new' : ''); },
      rowAttrs: function (r) { return 'data-notice-row="' + esc(r.id) + '"'; },
      empty: {
        icon: 'inbox',
        title: '這個條件下沒有通知紀錄',
        text: '換一個類型或棟別，或把「只看未回覆」關掉再看一次。'
      }
    });

    var count = document.getElementById('f13-count');
    if (count) count.textContent = '顯示 ' + list.length + ' 則，共 ' + rows.length + ' 則　點任一列看往返';
  }

  /* ================================================================
   * 7. 畫面：往返明細
   * ================================================================ */
  function detailTimeline(r) {
    var items = [];
    items.push({ at: r.sentAt, title: '發出通知', text: r.channel + '　' + r.by, kind: 'accent' });
    if (r.delivered) items.push({ at: r.deliveredAt, title: '對方裝置已送達', kind: 'ok' });
    else items.push({ at: r.sentAt, title: '傳送中', text: '等待通道回報送達時間' });
    if (r.readAt) items.push({ at: r.readAt, title: '對方已讀' });
    if (r.repliedAt) items.push({ at: r.repliedAt, title: '對方回覆', text: r.reply, kind: 'ok', current: true });
    else if (needsReply(r)) items.push({ title: '尚未回覆', text: '超過 48 小時未回覆會自動升級通知管理員', kind: 'warn', current: true });
    return A.timeline(items);
  }

  function detailPhone(r) {
    var msgs = [{ from: 'day', text: fmt.date(r.sentAt) }];
    msgs.push({ from: 'them', text: maskMoney(r.content), at: fmt.time(r.sentAt), read: !!r.readAt, avatar: '安' });
    if (r.repliedAt) msgs.push({ from: 'me', text: r.reply, at: fmt.time(r.repliedAt) });
    return A.phone({
      sm: true, input: false,
      title: D.company.name, sub: r.unitId ? (r.unitId + ' ' + (r.tenantName || '前租客')) : '群發公告',
      avatar: '安', time: fmt.time(r.sentAt), messages: msgs
    });
  }

  function renderDetail() {
    var host = document.getElementById('f13-detail');
    if (!host) return;
    var r = rowById(state.selected);
    if (!r) {
      host.innerHTML = '<div class="card-body">' + A.emptyState({
        icon: 'message', title: '還沒有選擇紀錄',
        text: '點左邊任一則通知，這裡會顯示完整往返：送達、已讀、回覆時間與內容。'
      }) + '</div>';
      return;
    }
    var unit = r.unitId ? D.unit(r.unitId) : null;
    var unitLine = unit
      ? unit.id + '　' + unit.type + '　' + unit.region
      : D.company.buildings[r.building].name + '　' + r.recipients + ' 位租客';

    host.innerHTML =
      '<div class="card-head">' +
        '<div class="f13-detail-title">' +
          '<h2>往返紀錄</h2>' + A.badge(r.type, TYPE_KIND[r.type] || 'neutral') +
          (r.exported ? A.badge('證據包已匯出', 'ok') : '') +
        '</div>' +
        '<p class="card-sub">' + esc(r.id + '　' + fmt.dateTime(r.sentAt) + ' 發送') + '</p>' +
      '</div>' +
      '<div class="card-body">' +
        '<dl class="f13-kv">' +
          '<dt>對象</dt><dd>' + esc(r.tenantName ? (r.tenantName + '（' + r.unitId + '）') : (D.company.buildings[r.building].name + ' 全體租客')) + '</dd>' +
          '<dt>物件</dt><dd>' + esc(unitLine) + '</dd>' +
          '<dt>管道</dt><dd>' + esc(r.channel) + '</dd>' +
          (r.unitId ? '<dt>聯絡電話</dt><dd>' + esc(maskPhone(r.phone)) + '</dd>' : '') +
        '</dl>' +
        '<div class="f13-quote"><span class="f13-quote-label">發出內容</span>' + esc(maskMoney(r.content)) + '</div>' +
        (r.repliedAt ? '<div class="f13-quote f13-quote--reply"><span class="f13-quote-label">對方回覆 ' +
          esc(fmt.dateTime(r.repliedAt)) + '</span>' + esc(r.reply) + '</div>' : '') +
        detailPhone(r) +
        detailTimeline(r) +
        '<div class="f13-detail-foot">' +
          '<button type="button" class="btn btn--secondary" data-act="export-notice" data-notice="' + esc(r.id) + '"' +
            (canExport() ? '' : ' disabled') + '>匯出這件證據包</button>' +
        '</div>' +
      '</div>';
  }

  /* ================================================================
   * 8. 畫面：照片歸檔
   * ================================================================ */
  function photoCard(p) {
    return '<button type="button" class="f13-photo" data-act="photo" data-photo="' + esc(p.id) + '">' +
      '<img src="' + esc(p.src) + '" alt="' + esc(p.unitId + ' ' + p.tag + '，' + p.note) + '" loading="lazy">' +
      '<span class="f13-photo-meta">' +
        '<span class="f13-photo-unit">' + esc(p.unitId + '　' + p.tag) + '</span>' +
        '<span>' + A.badge(p.source, p.by === 'tenant' ? 'accent' : 'neutral') + '</span>' +
        '<span class="f13-photo-note">' + esc(p.note) + '</span>' +
      '</span></button>';
  }

  function photosHtml() {
    var list = filteredPhotos();
    if (!list.length) {
      return A.emptyState({
        icon: 'camera', title: '這個條件下還沒有照片',
        text: '換一個棟別或來源看看；點交與報修時上傳的照片都會自動歸到這裡。'
      });
    }
    var groups = [], index = {};
    list.forEach(function (p) {
      if (!index[p.date]) { index[p.date] = { date: p.date, items: [] }; groups.push(index[p.date]); }
      index[p.date].items.push(p);
    });
    return groups.map(function (g) {
      var units = {};
      g.items.forEach(function (p) { units[p.unitId] = true; });
      return '<section class="f13-day">' +
        '<div class="f13-day-head">' +
          '<span class="f13-day-title">' + esc(fmt.date(g.date)) + '</span>' +
          '<span class="muted">' + esc(Object.keys(units).join('、') + '　' + g.items.length + ' 張') + '</span>' +
        '</div>' +
        '<div class="f13-photo-grid">' + g.items.map(photoCard).join('') + '</div>' +
        '</section>';
    }).join('');
  }

  var photosLoaded = false;
  function renderPhotos() {
    var host = document.getElementById('f13-photos');
    if (!host) return;
    var sub = document.getElementById('f13-photos-sub');
    if (sub) {
      sub.textContent = '依拍攝日期與房間分組，租客上傳與公司拍攝分開標示，點縮圖看大圖。' +
        (state.building === '全部' ? '' : '　目前只看 ' + D.company.buildings[state.building].name + '。');
    }
    if (!photosLoaded) {
      photosLoaded = true;
      A.simulateLoad(host, photosHtml, 420);
      return;
    }
    host.innerHTML = photosHtml();
  }

  function openPhoto(id) {
    var p = photos.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    A.modal({
      title: p.unitId + '　' + p.tag,
      size: 'lg',
      body: '<div class="f13-lightbox">' +
        '<img src="' + esc(p.src) + '" alt="' + esc(p.note) + '">' +
        '<div class="f13-lightbox-meta">' +
          '<div>' + A.badge(p.source, p.by === 'tenant' ? 'accent' : 'neutral') + '　' + esc(fmt.date(p.date)) + '</div>' +
          '<div>' + esc(p.note) + '</div>' +
          '<div class="muted">' + esc('檔案編號 ' + p.id + '，上傳後不可修改，任何刪除都會留下操作紀錄。') + '</div>' +
        '</div></div>',
      actions: [
        { label: '關閉', kind: 'ghost' },
        { label: '匯出這間的證據包', kind: 'secondary', onClick: function (close) { close(); exportUnit(p.unitId); return false; } }
      ]
    });
  }

  /* ================================================================
   * 9. 證據包
   * ================================================================ */
  function packList(notices, pics) {
    return [
      { icon: 'send', label: '通知紀錄（含發送、送達、已讀、回覆時間）', qty: notices.length, unit: '則' },
      { icon: 'message', label: 'LINE 對話往返存檔', qty: notices.length, unit: '份' },
      { icon: 'camera', label: '現場與點交照片（原始檔）', qty: pics.length, unit: '張' }
    ].concat(EXTRA.fixedDocs).filter(function (it) { return it.qty > 0; });
  }

  function packModal(title, lead, notices, pics, onDone) {
    var items = packList(notices, pics);
    var total = items.reduce(function (n, it) { return n + it.qty; }, 0);
    A.modal({
      title: title,
      body: '<p>' + esc(lead) + '</p>' +
        '<div class="f13-pack mt-8">' + items.map(function (it) {
          return '<div class="f13-pack-item">' + icon(it.icon) + '<span>' + esc(it.label) + '</span>' +
            '<span class="muted">' + esc(fmt.num(it.qty) + ' ' + it.unit) + '</span></div>';
        }).join('') + '</div>' +
        '<p class="muted small mt-8">' + esc('打包成一份 PDF 加原始照片資料夾，檔名含物件編號與匯出日期，可以直接交給律師或調解單位。') + '</p>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '產生證據包', kind: 'primary', onClick: function () { onDone(total); } }
      ]
    });
  }

  function markExported(notices) {
    notices.forEach(function (r) { r.exported = true; });
    renderTable();
    renderDetail();
    renderAlerts();
  }

  function exportUnit(unitId) {
    if (!canExport()) { A.toast('目前視角沒有匯出證據包的權限', 'warn'); return; }
    var notices = rowsOfUnit(unitId);
    var pics = photosOfUnit(unitId);
    if (!notices.length && !pics.length) { A.toast('這間目前沒有可以打包的紀錄', 'warn'); return; }
    packModal('匯出 ' + unitId + ' 證據包', '這件案子從第一則通知到最後一次回覆，一起打包。',
      notices, pics, function (total) {
        markExported(notices);
        A.toast(unitId + ' 證據包已產生，共 ' + total + ' 份文件', 'ok', { sub: '同步寫入操作紀錄' });
      });
  }

  function exportNotice(id) {
    var r = rowById(id);
    if (!r) return;
    if (r.unitId) { exportUnit(r.unitId); return; }
    if (!canExport()) { A.toast('目前視角沒有匯出證據包的權限', 'warn'); return; }
    packModal('匯出公告證據包', D.company.buildings[r.building].name + ' 這則群發公告的送達名單與內容一起打包。',
      [r], [], function (total) {
        markExported([r]);
        A.toast('公告證據包已產生，共 ' + total + ' 份文件', 'ok');
      });
  }

  function exportFiltered() {
    if (!canExport()) { A.toast('目前視角沒有匯出證據包的權限', 'warn'); return; }
    var notices = filtered();
    var pics = filteredPhotos();
    if (!notices.length && !pics.length) { A.toast('目前條件下沒有可以匯出的紀錄', 'warn'); return; }
    packModal('匯出證據包', '依目前篩選條件打包 ' + notices.length + ' 則通知與 ' + pics.length + ' 張照片。',
      notices, pics, function (total) {
        markExported(notices);
        A.toast('證據包已產生，共 ' + total + ' 份文件', 'ok', { sub: '同步寫入操作紀錄' });
      });
  }

  /* ================================================================
   * 10. 主流程：再發一次催租 → 送達 → 租客回覆
   * ================================================================ */
  function sendReminder() {
    if (state.flow !== 'idle') { A.toast('今天已經再發過一次，先等租客回覆', 'neutral'); return; }
    var t = D.tenantOf('B11');
    var text = '提醒您，9 月租金 ' + fmt.money(t.arrearsAmount) + ' 已逾期 ' + t.arrearsDays +
      ' 天。方便回覆預計繳納的日期嗎？我們會依您回覆的時間安排。';
    A.modal({
      title: '再發一次催租通知',
      body: '<dl class="f13-kv">' +
          '<dt>對象</dt><dd>' + esc('B11　' + t.name) + '</dd>' +
          '<dt>管道</dt><dd>LINE</dd>' +
          '<dt>前兩次</dt><dd>9 月 11 日已回覆、9 月 16 日已讀未回</dd>' +
        '</dl>' +
        '<div class="f13-quote mt-8"><span class="f13-quote-label">將送出的內容</span>' + esc(maskMoney(text)) + '</div>' +
        '<p class="muted small mt-8">' + esc('送出後自動記錄送達與已讀時間，租客的回覆也會一併留存。') + '</p>',
      actions: [
        { label: '取消', kind: 'ghost' },
        { label: '送出通知', kind: 'primary', onClick: function () { doSend(t, text); } }
      ]
    });
  }

  function doSend(t, text) {
    state.flow = 'sent';
    var row = normalize({
      id: 'N-2034', type: '催租', tenantId: t.id, unitId: 'B11',
      sentAt: D.today + ' 09:40', channel: 'LINE', content: text,
      delivered: false, deliveredAt: null, readAt: null, repliedAt: null, reply: null
    });
    row.isNew = true;
    rows.unshift(row);
    state.selected = row.id;
    if (state.type !== '全部' && state.type !== '催租') state.type = '全部';
    if (state.building !== '全部' && state.building !== 'B') state.building = '全部';
    renderAll();
    A.toast('催租通知已送出，等待送達回報', 'neutral');

    setTimeout(function () {
      row.delivered = true;
      row.deliveredAt = D.today + ' 09:40';
      row.readAt = D.today + ' 09:52';
      renderKpis();
      renderTable();
      renderDetail();
      A.toast('通知已送達並已讀：B11 ' + t.name, 'ok', { sub: '送達 09:40、已讀 09:52' });
    }, 1000);

    setTimeout(function () {
      row.repliedAt = D.today + ' 10:06';
      row.reply = '不好意思，明天中午前一定繳清。';
      row.isNew = false;
      state.flow = 'replied';
      renderAll();
      A.toast('B11 租客已回覆：明天中午前繳清', 'ok', { sub: '等回覆的案件剩 ' + caseUnits().length + ' 件' });
    }, 2600);
  }

  /* ================================================================
   * 11. 事件
   * ================================================================ */
  function renderAll() {
    renderKpis();
    renderAlerts();
    renderToolbar();
    renderTable();
    renderDetail();
    renderPhotos();
  }

  function select(id) {
    state.selected = id;
    renderTable();
    renderDetail();
    var panel = document.getElementById('f13-detail');
    if (panel && window.matchMedia && !window.matchMedia('(min-width: 1025px)').matches) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof Element)) return;

    var tab = t.closest('#f13-type-tabs .tab[data-tab]');
    if (tab) { state.type = tab.getAttribute('data-tab'); renderTable(); return; }

    var src = t.closest('#f13-source-tabs .tab[data-tab]');
    if (src) { state.source = src.getAttribute('data-tab'); renderPhotos(); return; }

    if (t.closest('#f13-unreplied')) {
      state.unreplied = !state.unreplied;
      renderToolbar();
      renderTable();
      return;
    }
    if (t.closest('#f13-export-all')) { exportFiltered(); return; }

    var act = t.closest('[data-act]');
    if (act) {
      var kind = act.getAttribute('data-act');
      if (kind === 'remind') { sendReminder(); return; }
      if (kind === 'select') { select(act.getAttribute('data-notice')); return; }
      if (kind === 'export-notice') { exportNotice(act.getAttribute('data-notice')); return; }
      if (kind === 'export-unit') { exportUnit(act.getAttribute('data-unit')); return; }
      if (kind === 'photo') { openPhoto(act.getAttribute('data-photo')); return; }
    }

    var row = t.closest('tr[data-notice-row]');
    if (row) select(row.getAttribute('data-notice-row'));
  });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'f13-building') {
      state.building = e.target.value;
      renderTable();
      renderPhotos();
    }
  });

  A.onRole(function () {
    renderToolbar();
    renderTable();
    renderDetail();
  });

  renderAll();
})();
