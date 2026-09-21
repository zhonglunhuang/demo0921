/* tour-player.js — window.TourPlayer：功能導覽播放器
 * 契約：docs/DESIGN.md §4。
 *
 * 用法（js/tours/fNN.js）：
 *   TourPlayer.mount(document.getElementById('player'), {
 *     feature: 'f01',
 *     autoplayMs: 4500,                       // 每步停留（毫秒），可省略；單步可用 step.autoplayMs 覆寫
 *     steps: [{ title, text, render(stage, api), after?(stage, api) }, …],
 *   });
 *   回傳控制器 { go(i), next(), prev(), play(), pause(), toggle(), destroy(), index, playing, length }。
 *
 * api（傳給 render / after）：
 *   enter(el, delay?)            淡入上移；el 可為元素、選擇器、NodeList（多個時每個間隔 80ms）
 *   highlight(el)                藍框脈動 1.2s × 2
 *   count(el, from, to, ms?)     數字跳動（千分位、tabular-nums），預設 1000ms
 *   type(el, text, ms?)          逐字出現，ms 為總時長（預設依字數 400～2000ms）
 *   check(el)                    .checklist-item 加 .is-done 並畫勾
 *   badge(el, text, kind)        換 .badge--kind 並閃一下
 *   wait(ms)                     回傳 Promise
 *   cursor(x, y) / cursor(el)    示意游標平滑移到相對座標（0～1 為比例，>1 為 960×600 內的 px），1s 後淡出
 *   以上皆回傳 Promise，可串接；prefers-reduced-motion 時直接呈現結果。
 *
 * 依賴皆為選用、缺席不拋錯：window.Icons（控制列圖示）、window.DB（功能名稱）、window.App（App.link）。
 */
(function (global) {
  'use strict';

  var STAGE_W = 960;
  var STAGE_H = 600;
  var DEFAULT_MS = 4500;
  var AFTER_DELAY = 350;
  var STAGGER = 80;
  var TRAVEL_MS = 600;

  var ICON_NAMES = {
    play: ['play'],
    pause: ['pause'],
    prev: ['chevron-left', 'arrow-left', 'prev'],
    next: ['chevron-right', 'arrow-right', 'next'],
  };
  var FALLBACK_ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.6v12.8a.6.6 0 0 0 .9.5l10.4-6.4a.6.6 0 0 0 0-1L9.4 5.1a.6.6 0 0 0-.9.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5.5 6.5 6.5-6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  var CURSOR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 3.2v15.4l4.1-3.6 2.6 5.6 2.6-1.2-2.6-5.5h5.6z"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 6.3 4.8 8.8 9.8 3.4"/></svg>';

  /* ---------- 小工具 ---------- */

  function reducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }
  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, ms | 0));
    });
  }
  function reflow(el) {
    void el.offsetWidth;
  }
  function warn(msg) {
    if (global.console && console.warn) console.warn('[TourPlayer] ' + msg);
  }
  function fail(msg, err) {
    if (global.console && console.error) console.error('[TourPlayer] ' + msg, err);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function resolveEl(root, target) {
    if (!target) return null;
    if (typeof target === 'string') return root.querySelector(target);
    if (target.nodeType === 1) return target;
    if (typeof target.length === 'number' && target[0] && target[0].nodeType === 1) return target[0];
    return null;
  }
  function toList(root, target) {
    if (target == null) return [];
    if (typeof target === 'string') return Array.prototype.slice.call(root.querySelectorAll(target));
    if (target.nodeType === 1) return [target];
    if (typeof target.length === 'number') {
      return Array.prototype.filter.call(target, function (n) { return n && n.nodeType === 1; });
    }
    return [];
  }
  function decimalsOf(n) {
    var s = String(n);
    var i = s.indexOf('.');
    return i < 0 ? 0 : Math.min(s.length - i - 1, 4);
  }
  function formatNumber(n, decimals) {
    var fixed = Math.abs(n).toFixed(decimals);
    var parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + parts.join('.');
  }
  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  /* ---------- 與其他基礎層的鬆耦合 ---------- */

  function iconMarkup(kind) {
    var Icons = global.Icons;
    if (Icons && typeof Icons.get === 'function') {
      var names = ICON_NAMES[kind];
      var has = typeof Icons.has === 'function' ? Icons.has : null;
      for (var i = 0; i < names.length; i++) {
        if (has && !has(names[i])) continue; /* Icons.get 對未知名稱會回傳替代圖示，先問 has */
        try {
          var got = Icons.get(names[i]);
          if (got) return got;
        } catch (e) { /* 這個名稱沒有圖示，試下一個 */ }
      }
    }
    return FALLBACK_ICONS[kind];
  }
  function setIcon(btn, kind) {
    var m = iconMarkup(kind);
    btn.innerHTML = '';
    if (typeof m === 'string') btn.innerHTML = m;
    else if (m && m.nodeType) btn.appendChild(m.cloneNode(true));
  }
  function featureOf(id) {
    try {
      var list = global.DB && global.DB.features;
      if (list && list.length) {
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
      }
    } catch (e) { /* DB 尚未載入 */ }
    return null;
  }
  function systemName() {
    try {
      var s = global.DB && global.DB.company && global.DB.company.system;
      if (s) return String(s);
    } catch (e) { /* DB 尚未載入 */ }
    return '租務中樞';
  }
  function appLink(id) {
    try {
      if (global.App && typeof global.App.link === 'function') {
        var l = global.App.link(id, 'app');
        if (typeof l === 'string' && l && l !== '#') return l;
      }
    } catch (e) { /* App 尚未載入 */ }
    if (id === 'f15') return '../app/index.html';
    var f = featureOf(id);
    if (f && f.slug) return '../app/' + id + '-' + f.slug + '.html';
    return '../app/index.html';
  }

  /* ---------- api ---------- */

  function makeApi(player) {
    var stage = player.stage;

    function alive(serial) {
      return !player.state.destroyed && player.state.serial === serial;
    }

    return {
      stage: stage,
      get reduced() { return reducedMotion(); },

      enter: function (target, wait) {
        var els = toList(stage, target);
        var base = Math.max(0, wait | 0);
        if (!els.length) return delay(0);
        if (reducedMotion()) {
          els.forEach(function (el) { el.classList.remove('tp-enter'); el.style.animationDelay = ''; });
          return delay(0);
        }
        els.forEach(function (el, i) {
          el.classList.remove('tp-enter');
          reflow(el);
          el.style.animationDelay = (base + i * STAGGER) + 'ms';
          el.classList.add('tp-enter');
        });
        return delay(base + (els.length - 1) * STAGGER + 600);
      },

      highlight: function (target) {
        var el = resolveEl(stage, target);
        if (!el) return delay(0);
        el.classList.remove('tp-highlight');
        reflow(el);
        el.classList.add('tp-highlight');
        return delay(reducedMotion() ? 1200 : 2400).then(function () {
          el.classList.remove('tp-highlight');
        });
      },

      count: function (target, from, to, ms) {
        var el = resolveEl(stage, target);
        if (!el) return delay(0);
        from = Number(from) || 0;
        to = Number(to) || 0;
        var dec = Math.max(decimalsOf(from), decimalsOf(to));
        var dur = ms == null ? 1000 : Number(ms) || 0;
        el.classList.add('tp-num');
        if (reducedMotion() || dur <= 0) {
          el.textContent = formatNumber(to, dec);
          return delay(0);
        }
        var serial = player.state.serial;
        el.textContent = formatNumber(from, dec);
        return new Promise(function (resolve) {
          var start = null;
          function frame(ts) {
            if (!alive(serial)) return resolve();
            if (start === null) start = ts;
            var p = Math.min(1, (ts - start) / dur);
            el.textContent = formatNumber(from + (to - from) * easeOut(p), dec);
            if (p < 1) requestAnimationFrame(frame);
            else { el.textContent = formatNumber(to, dec); resolve(); }
          }
          requestAnimationFrame(frame);
        });
      },

      type: function (target, text, ms) {
        var el = resolveEl(stage, target);
        if (!el) return delay(0);
        text = text == null ? '' : String(text);
        var chars = Array.from(text);
        var dur = ms == null ? Math.min(2000, Math.max(400, chars.length * 60)) : Number(ms) || 0;
        if (reducedMotion() || dur <= 0 || !chars.length) {
          el.textContent = text;
          return delay(0);
        }
        var serial = player.state.serial;
        el.textContent = '';
        el.classList.add('tp-typing');
        return new Promise(function (resolve) {
          var start = null;
          function frame(ts) {
            if (!alive(serial)) { el.classList.remove('tp-typing'); return resolve(); }
            if (start === null) start = ts;
            var p = Math.min(1, (ts - start) / dur);
            el.textContent = chars.slice(0, Math.round(p * chars.length)).join('');
            if (p < 1) requestAnimationFrame(frame);
            else {
              el.textContent = text;
              setTimeout(function () { el.classList.remove('tp-typing'); }, 500);
              resolve();
            }
          }
          requestAnimationFrame(frame);
        });
      },

      check: function (target) {
        var el = resolveEl(stage, target);
        if (!el) return delay(0);
        var input = el.querySelector('input[type="checkbox"]');
        if (input) input.checked = true;
        var mark = el.querySelector('.tp-check');
        var hasOwnBox = !!(input || el.querySelector('.checklist-box, .check-box, .checkbox'));
        if (!mark && !hasOwnBox) {
          mark = document.createElement('span');
          mark.className = 'tp-check';
          mark.setAttribute('aria-hidden', 'true');
          mark.innerHTML = CHECK_SVG;
          el.insertBefore(mark, el.firstChild);
          reflow(mark);
        }
        el.classList.add('is-done');
        if (mark) mark.classList.add('is-on');
        return delay(reducedMotion() ? 0 : 520);
      },

      badge: function (target, text, kind) {
        var el = resolveEl(stage, target);
        if (!el) return delay(0);
        var cls = el.className.split(/\s+/).filter(function (c) {
          return c && c.indexOf('badge--') !== 0 && c !== 'tp-flash';
        });
        if (cls.indexOf('badge') < 0) cls.unshift('badge');
        if (kind) cls.push('badge--' + kind);
        el.className = cls.join(' ');
        if (text != null) el.textContent = text;
        if (reducedMotion()) return delay(0);
        reflow(el);
        el.classList.add('tp-flash');
        return delay(600).then(function () { el.classList.remove('tp-flash'); });
      },

      wait: delay,

      cursor: function (x, y) {
        return player.moveCursor(x, y);
      },
    };
  }

  /* ---------- 播放器 ---------- */

  function mount(el, opts) {
    if (!el || el.nodeType !== 1) {
      warn('mount：找不到掛載元素');
      return null;
    }
    if (el._tourPlayer && typeof el._tourPlayer.destroy === 'function') el._tourPlayer.destroy();

    opts = opts || {};
    var steps = Array.isArray(opts.steps) ? opts.steps.filter(Boolean) : [];
    el.classList.add('tour-player');
    if (!steps.length) {
      warn('mount：steps 為空');
      el.innerHTML = '<p class="tour-empty">這條導覽還沒有步驟。</p>';
      return null;
    }

    var feature = opts.feature || el.getAttribute('data-feature') || (document.body && document.body.getAttribute('data-feature')) || '';
    var info = featureOf(feature);
    var stepMs = Number(opts.autoplayMs) > 0 ? Number(opts.autoplayMs) : DEFAULT_MS;
    var stageH = Number(opts.stageHeight) > 0 ? Number(opts.stageHeight) : STAGE_H;
    var barTitle = systemName() + (info && info.name ? ' · ' + info.name : '');

    var dots = '';
    for (var d = 0; d < steps.length; d++) {
      dots += '<button type="button" class="tour-dot" data-step="' + d + '" aria-label="第 ' + (d + 1) + ' 步：' + escapeHtml(steps[d].title || '') + '"><i></i></button>';
    }
    el.innerHTML =
      '<div class="tour-stage">' +
        '<div class="stage-frame">' +
          '<div class="stage-bar" aria-hidden="true"><i></i><i></i><i></i><span class="stage-bar-title">' + escapeHtml(barTitle) + '</span></div>' +
          '<div class="stage-viewport">' +
            '<div class="stage-scaler">' +
              '<div class="stage-screen"></div>' +
              '<div class="stage-cursor" aria-hidden="true">' + CURSOR_SVG + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tour-side">' +
        '<div class="tour-copy" aria-live="polite">' +
          '<p class="tour-counter"></p>' +
          '<h2 class="tour-step-title"></h2>' +
          '<p class="tour-step-text"></p>' +
          '<div class="tour-end" hidden>' +
            '<a class="btn btn--primary" href="' + escapeHtml(appLink(feature)) + '">到操作頁試試看</a>' +
            '<a class="btn btn--secondary" href="../tour/index.html">回導覽清單</a>' +
          '</div>' +
        '</div>' +
        '<div class="tour-controls">' +
          '<button type="button" class="tour-btn tour-btn--play" aria-label="自動播放" aria-pressed="false"></button>' +
          '<button type="button" class="tour-btn tour-btn--prev" aria-label="上一步"></button>' +
          '<button type="button" class="tour-btn tour-btn--next" aria-label="下一步"></button>' +
          '<div class="tour-dots" role="group" aria-label="步驟進度">' + dots + '</div>' +
        '</div>' +
      '</div>';

    var q = function (sel) { return el.querySelector(sel); };
    var viewport = q('.stage-viewport');
    var scaler = q('.stage-scaler');
    var stage = q('.stage-screen');
    var cursor = q('.stage-cursor');
    var copy = q('.tour-copy');
    var counter = q('.tour-counter');
    var title = q('.tour-step-title');
    var text = q('.tour-step-text');
    var end = q('.tour-end');
    var btnPlay = q('.tour-btn--play');
    var btnPrev = q('.tour-btn--prev');
    var btnNext = q('.tour-btn--next');
    var dotEls = Array.prototype.slice.call(el.querySelectorAll('.tour-dot'));

    scaler.style.height = stageH + 'px';
    stage.style.height = stageH + 'px';
    setIcon(btnPrev, 'prev');
    setIcon(btnNext, 'next');

    var state = {
      current: -1,
      playing: false,
      timer: null,
      afterTimer: null,
      cursorTimer: null,
      serial: 0,
      scale: 0,
      autoPaused: false,
      touched: false,
      destroyed: false,
    };
    var player = { el: el, stage: stage, state: state };
    var api = makeApi(player);
    var last = steps.length - 1;

    function msFor(i) {
      var s = steps[i];
      return s && Number(s.autoplayMs) > 0 ? Number(s.autoplayMs) : stepMs;
    }

    /* 縮放：960px 畫面依容器寬度等比縮放，高度隨之設定 */
    function fit() {
      if (state.destroyed) return;
      var w = viewport.clientWidth;
      if (!w) return;
      var s = w / STAGE_W;
      if (Math.abs(s - state.scale) < 0.0005) return;
      state.scale = s;
      scaler.style.transform = 'scale(' + s + ')';
      viewport.style.height = Math.round(stageH * s) + 'px';
    }

    /* 示意游標 */
    player.moveCursor = function (x, y) {
      var scale = state.scale || 1;
      var px, py;
      if (x && x.nodeType === 1) {
        var r = x.getBoundingClientRect();
        var s = stage.getBoundingClientRect();
        px = (r.left - s.left + r.width / 2) / scale;
        py = (r.top - s.top + r.height / 2) / scale;
      } else {
        x = Number(x) || 0;
        y = Number(y) || 0;
        px = x >= 0 && x <= 1 ? x * STAGE_W : x;
        py = y >= 0 && y <= 1 ? y * stageH : y;
      }
      clearTimeout(state.cursorTimer);
      var reduced = reducedMotion();
      cursor.classList.remove('is-click');
      if (!cursor.classList.contains('is-on')) {
        cursor.style.transition = 'none';
        cursor.style.transform = 'translate(' + (px + 90) + 'px, ' + (py + 70) + 'px)';
        reflow(cursor);
        cursor.style.transition = '';
      }
      cursor.classList.add('is-on');
      cursor.style.transform = 'translate(' + (px - 6) + 'px, ' + (py - 4) + 'px)';
      return delay(reduced ? 0 : TRAVEL_MS).then(function () {
        if (state.destroyed) return;
        if (!reduced) { reflow(cursor); cursor.classList.add('is-click'); }
        state.cursorTimer = setTimeout(function () {
          cursor.classList.remove('is-on');
          cursor.classList.remove('is-click');
        }, 1000);
      });
    };
    function hideCursor() {
      clearTimeout(state.cursorTimer);
      cursor.classList.remove('is-on');
      cursor.classList.remove('is-click');
    }

    /* UI 同步 */
    function syncUi() {
      var i = state.current;
      dotEls.forEach(function (dot, k) {
        dot.classList.toggle('is-active', k === i);
        if (k === i) dot.setAttribute('aria-current', 'step');
        else dot.removeAttribute('aria-current');
      });
      btnPrev.disabled = i <= 0;
      btnNext.disabled = i >= last;
      end.hidden = i !== last;
      el.classList.toggle('is-end', i === last);
      el.classList.toggle('is-playing', state.playing);
      setIcon(btnPlay, state.playing ? 'pause' : 'play');
      btnPlay.setAttribute('aria-label', state.playing ? '暫停自動播放' : (i === last ? '重新播放' : '自動播放'));
      btnPlay.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
    }

    function schedule() {
      clearTimeout(state.timer);
      state.timer = null;
      if (!state.playing || state.current >= last) return;
      var ms = msFor(state.current);
      el.style.setProperty('--tp-ms', ms + 'ms');
      state.timer = setTimeout(function () {
        state.timer = null;
        go(state.current + 1, false);
      }, ms);
    }

    function go(i, byUser) {
      if (state.destroyed) return;
      i = Math.max(0, Math.min(last, i | 0));
      if (byUser) { state.touched = true; pause(); }
      if (i === state.current) { syncUi(); return; }

      state.current = i;
      state.serial++;
      var serial = state.serial;
      var step = steps[i];
      clearTimeout(state.afterTimer);

      /* 說明區：淡入上移 300ms */
      copy.classList.remove('is-in');
      reflow(copy);
      counter.textContent = '第 ' + (i + 1) + ' 步／共 ' + steps.length + ' 步';
      title.textContent = step.title || '';
      text.textContent = step.text || '';
      copy.classList.add('is-in');

      /* 畫面區：render → 350ms 後 after */
      hideCursor();
      try {
        if (typeof step.render === 'function') step.render(stage, api);
      } catch (err) {
        fail('第 ' + (i + 1) + ' 步 render 失敗', err);
      }
      if (typeof step.after === 'function') {
        state.afterTimer = setTimeout(function () {
          if (state.serial !== serial || state.destroyed) return;
          try {
            var r = step.after(stage, api);
            if (r && typeof r.then === 'function') r.then(null, function (err) { fail('第 ' + (i + 1) + ' 步 after 失敗', err); });
          } catch (err) {
            fail('第 ' + (i + 1) + ' 步 after 失敗', err);
          }
        }, AFTER_DELAY);
      }

      if (i === last) state.playing = false; /* 最後一步停止 */
      syncUi();
      schedule();
    }

    function play() {
      if (state.destroyed) return;
      state.autoPaused = false;
      state.playing = true;
      if (state.current >= last) {
        go(0, false);
        return;
      }
      /* 讓進度點動畫從頭開始 */
      el.classList.remove('is-playing');
      reflow(el);
      syncUi();
      schedule();
    }
    function pause() {
      state.playing = false;
      state.autoPaused = false;
      clearTimeout(state.timer);
      state.timer = null;
      syncUi();
    }
    function toggle() {
      state.touched = true;
      if (state.playing) pause();
      else play();
    }

    /* 事件 */
    function onClick(e) {
      var t = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!t || !el.contains(t)) return;
      if (t === btnPlay) toggle();
      else if (t === btnPrev) go(state.current - 1, true);
      else if (t === btnNext) go(state.current + 1, true);
      else if (t.classList.contains('tour-dot')) go(Number(t.getAttribute('data-step')), true);
    }
    function onKey(e) {
      if (state.destroyed || !el.isConnected) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      var t = e.target;
      if (isEditable(t)) return;
      var key = e.key;
      if (key === 'ArrowLeft') {
        go(state.current - 1, true);
        e.preventDefault();
      } else if (key === 'ArrowRight') {
        go(state.current + 1, true);
        e.preventDefault();
      } else if (key === ' ' || key === 'Spacebar') {
        /* 焦點在控制列按鈕上時，交給按鈕自己的 click，避免切兩次 */
        if (t && t.nodeType === 1 && el.contains(t) && t.tagName === 'BUTTON') return;
        toggle();
        e.preventDefault();
      }
    }
    function onVisibility() {
      if (document.hidden) {
        if (state.playing) { pause(); state.autoPaused = true; }
      } else if (state.autoPaused) {
        play();
      }
    }

    el.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);

    var ro = null;
    if (typeof global.ResizeObserver === 'function') {
      ro = new global.ResizeObserver(function () { fit(); });
      ro.observe(viewport);
    } else {
      global.addEventListener('resize', fit);
    }

    /* 初始：先渲染第一步，進入視野後才開始自動播放 */
    fit();
    go(Number(opts.start) || 0, false);

    var io = null;
    if (opts.autoplay !== false) {
      if (typeof global.IntersectionObserver === 'function') {
        io = new global.IntersectionObserver(function (entries) {
          for (var k = 0; k < entries.length; k++) {
            if (entries[k].isIntersecting) {
              io.disconnect();
              io = null;
              /* 使用者已自己操作過（切步／暫停）就不再自動開播 */
              if (!state.destroyed && !state.playing && !state.touched) play();
              break;
            }
          }
        }, { threshold: 0.3 });
        io.observe(el);
      } else {
        play();
      }
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      state.serial++;
      clearTimeout(state.timer);
      clearTimeout(state.afterTimer);
      clearTimeout(state.cursorTimer);
      el.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      if (ro) ro.disconnect();
      else global.removeEventListener('resize', fit);
      if (io) io.disconnect();
      el.classList.remove('is-playing', 'is-end');
      delete el._tourPlayer;
    }

    var controller = {
      el: el,
      stage: stage,
      api: api,
      length: steps.length,
      go: function (i) { go(i, false); },
      next: function () { go(state.current + 1, true); },
      prev: function () { go(state.current - 1, true); },
      play: play,
      pause: pause,
      toggle: toggle,
      fit: fit,
      destroy: destroy,
      get index() { return state.current; },
      get playing() { return state.playing; },
    };
    el._tourPlayer = controller;
    return controller;
  }

  global.TourPlayer = {
    version: '1.0.0',
    STAGE_WIDTH: STAGE_W,
    STAGE_HEIGHT: STAGE_H,
    mount: mount,
    formatNumber: formatNumber,
  };
})(window);
