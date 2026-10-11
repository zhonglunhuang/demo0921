/* plan.js — 合作方案頁（plan/index.html）的示意動畫。
 *
 * 示意動畫：.pl-scene 裡帶 data-seq 的元素依序加上 .is-on，樣式變化寫在 css/plan.css。
 *   data-play="build"  累積點亮（1、1+2、1+2+3…），播完停幾拍再從頭——用在有先後的流程
 *   data-play="cycle"  一次只亮一個並循環——用在每月重複的服務
 *   data-step-ms       每一拍的毫秒數
 *   data-until="n"     （build）元素播到第 n 拍就退場，用在會被下一個狀態取代的東西
 *
 * HTML 預設就是「播完的樣子」（build 全亮、cycle 亮第一個）：沒有 JS、或使用者偏好減少動態時，
 * 畫面停在完整內容，不會有東西被藏住。 */
(function () {
  'use strict';

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof IntersectionObserver === 'undefined') return;

  var HOLD = 4;  /* build 播完後多停幾拍，讓人看完再重來 */

  function scene(root) {
    var items = root.querySelectorAll('[data-seq]');
    var cycle = root.getAttribute('data-play') === 'cycle';
    var stepMs = Number(root.getAttribute('data-step-ms')) || 900;
    var last = 0;
    each(items, function (el) { last = Math.max(last, Number(el.getAttribute('data-seq')) || 0); });
    if (!last) return;

    var step = cycle ? 1 : last;  /* 對齊 HTML 的預設狀態 */
    var turn = 0;                 /* cycle 用：累計轉了幾格，圓環光點依此前進，不會倒轉 */
    var timer = null;

    function paint() {
      each(items, function (el) {
        var n = Number(el.getAttribute('data-seq'));
        var until = Number(el.getAttribute('data-until')) || 0;  /* 到這一拍就退場（被下一個狀態取代） */
        el.classList.toggle('is-on', cycle ? n === step : n <= step && (!until || step < until));
      });
      root.style.setProperty('--turn', turn);
    }
    function tick() {
      if (cycle) { step = step % last + 1; turn += 1; }
      else { step = step >= last + HOLD ? 0 : step + 1; }
      paint();
    }
    function start() {
      if (timer) return;
      if (!cycle) { step = 0; paint(); }  /* 進到畫面才從頭播 */
      timer = setInterval(tick, stepMs);
    }
    function stop() { clearInterval(timer); timer = null; }

    /* 看得到才播，離開畫面就停，不在背景空轉 */
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) start(); else stop(); });
    }, { threshold: 0.2 }).observe(root);
  }

  each(document.querySelectorAll('.pl-scene'), scene);
})();
