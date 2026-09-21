# DESIGN.md — 提案網站「租務中樞」設計與架構契約

> 本檔是 DEMO-01～08 所有實作者（人或 agent）的**唯一共同契約**。任何頁面、元件、資料、導覽都照這裡做；
> 契約沒寫到的，照 Apple 官網（apple.com）的慣例與 `.agents/skills/ui-design`、`.agents/skills/ux-writing` 兩份檢查清單。
> 契約要改，先改這裡再改程式；不要在個別頁面另立一套。

## 0. 一句話

為「安居包租代管」量身規劃的營運中樞——系統名「租務中樞」。提案網站 = **總覽首頁** + **進系統操作**（假資料在跑的模擬系統）+ **功能導覽**（每個功能一條逐步動畫流程）。

## 1. 檔案佈局（固定，不要另創）

```
src/
├── index.html                    總覽首頁（Apple 式長頁）
├── css/main.css                  共用樣式：tokens、base、共用元件、app 外殼（所有頁面都載入）
├── css/home.css                  首頁行銷區塊專屬樣式（只有 index.html 載入）
├── css/tour.css                  導覽播放器樣式（只有 tour/ 頁面載入）
├── css/fNN.css                   （選用）某功能頁專屬樣式；只有該功能引用
├── js/data.js                    共用假資料 window.DB（唯一事實來源，各功能只讀不改）
├── js/icons.js                   window.Icons：內嵌 SVG 圖示（禁 emoji 當圖示）
├── js/common.js                  window.App：外殼渲染、角色切換、toast/modal、格式化、圖表、滾動淡入
├── js/tour-player.js             window.TourPlayer：導覽播放器
├── js/app/fNN.js                 各功能「進系統操作」頁的邏輯
├── js/tours/fNN.js               各功能「功能導覽」的步驟定義
├── app/index.html                進系統後首頁 = f15 AI 工作中心
├── app/fNN-<slug>.html           各功能操作頁（f15 例外：就是 app/index.html）
├── tour/index.html               導覽首頁（20 個功能清單）
├── tour/fNN-<slug>.html          各功能導覽頁
└── assets/                       SVG 插圖、假照片（用 SVG 或 CSS 漸層代替真照片）
```

**所有站內連結與資源一律相對路徑**（`../css/main.css`、`../js/data.js`）；GitHub Pages 子路徑下絕對路徑會全掛。
`make static-check` 會擋絕對路徑、斷連結、殘留 `TODO`／`Lorem`／`{{…}}`。

### 1.1 功能註冊表（slug 固定；分 7 群；每功能一票、一條導覽）

| 代號 | slug | 名稱（畫面上顯示） | 群 | 票 |
|---|---|---|---|---|
| f15 | work-center | AI 工作中心 | 6 事件、權限與工作中心 | DEMO-07 |
| f01 | upstream-lease | 上游租約與到期風險 | 1 租約與屋主 | DEMO-02 |
| f04 | deposits | 押金管理 | 1 | DEMO-02 |
| f17 | documents | 自動產生文件 | 1 | DEMO-02 |
| f02 | unit-pnl | 每間房真正損益 | 2 損益與儀表板 | DEMO-03 |
| f16 | owner-dashboard | 老闆營運儀表板 | 2 | DEMO-03 |
| f03 | vacancy-funnel | 空房招租漏斗 | 3 空房到入住 | DEMO-04 |
| f05 | moveout-prep | 退租整備流程 | 3 | DEMO-04 |
| f06 | equipment | 設備履歷 | 4 設備、修繕與資產 | DEMO-05 |
| f07 | vendors-workorders | 廠商與修繕工單 | 4 | DEMO-05 |
| f08 | utility-anomaly | 水電異常偵測 | 4 | DEMO-05 |
| f09 | keys-access | 鑰匙與門禁管理 | 4 | DEMO-05 |
| f10 | line-selfservice | 租客 LINE 自助中心 | 5 租客服務與通知 | DEMO-06 |
| f11 | ai-support | AI 客服與知識庫 | 5 | DEMO-06 |
| f13 | evidence | 證據留存 | 5 | DEMO-06 |
| f19 | escalation | 通知升級機制 | 5 | DEMO-06 |
| f12 | incidents | 重大事件管理 | 6 | DEMO-07 |
| f14 | permissions-audit | 權限與操作紀錄 | 6 | DEMO-07 |
| f18 | todos-performance | 待辦與員工績效 | 6 | DEMO-07 |
| f20 | data-export | 資料匯出與所有權 | 7 資料所有權 | DEMO-08 |

同一張表以程式形式存在 `DB.features`（含 `id, slug, name, group, ticket, tagline, tourSteps`）。
左側導覽、首頁卡片、導覽清單都從 `DB.features` 產生——**不要各頁自己手寫清單**。

## 2. 視覺語言（Apple 官網風）

### 2.1 Tokens（全部定義在 `main.css` 的 `:root`；元件裡不得出現裸 hex）

```css
--bg: #ffffff;        --bg-alt: #f5f5f7;      --bg-dark: #000000;   --bg-dark-2: #1d1d1f;
--ink: #1d1d1f;       --ink-2: #6e6e73;       --ink-3: #86868b;     --line: #d2d2d7;   --line-soft: #e8e8ed;
--ink-on-dark: #f5f5f7;  --ink-2-on-dark: #a1a1a6;
--accent: #0071e3;    --accent-hover: #0077ed; --accent-soft: #e8f2fd;
--ok: #34c759;  --ok-soft: #e6f8ea;   --warn: #ff9f0a;  --warn-soft: #fff4e0;   --danger: #ff3b30;  --danger-soft: #ffe9e7;
--radius-s: 10px; --radius-m: 16px; --radius-l: 24px; --radius-pill: 980px;
--shadow-1: 0 2px 8px rgba(0,0,0,.06);  --shadow-2: 0 12px 32px rgba(0,0,0,.10);
--glass: rgba(255,255,255,.72);  --glass-dark: rgba(29,29,31,.72);
--font: -apple-system, BlinkMacSystemFont, "SF Pro TC", "SF Pro Display", "PingFang TC", "Helvetica Neue", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
--ease: cubic-bezier(.2,.8,.2,1);  --dur-fast: 150ms; --dur: 300ms; --dur-slow: 600ms;
--container: 980px; --container-wide: 1200px;
```

### 2.2 字級（行銷區塊 vs 系統畫面）

| 用途 | 大小 / 字重 / 行高 / 字距 |
|---|---|
| 首頁 hero 標題 | 64px（手機 40px）/ 600 / 1.05 / -0.015em |
| 區塊標題 h2 | 48px（手機 32px）/ 600 / 1.08 / -0.01em |
| 區塊副標 | 24px（手機 19px）/ 400 / 1.3，顏色 `--ink-2` |
| 卡片標題 h3 | 21px / 600 / 1.2 |
| 系統畫面頁標題 | 32px / 600 / 1.15 |
| 系統畫面區塊標題 | 21px / 600 |
| 內文 | 17px / 400 / 1.47（系統畫面表格內 15px） |
| 輔助字、標籤 | 14px；最小 12px |
| KPI 大數字 | 40px / 600 / 1，`font-variant-numeric: tabular-nums` |

中文與英數之間留半形空白（盤古之白）；數字一律千分位；金額寫「NT$ 13,000」或「13,000 元」（同頁擇一，全站以「13,000 元」為主，KPI 卡可用「NT$」）。

### 2.3 版面與動態

- 首頁：區塊式長頁，每區塊 `padding: 120px 0`（手機 72px），文字置中為主；白底區塊與**黑底區塊**（`--bg-dark`，文字 `--ink-on-dark`）交錯，至少 2 個黑底區塊。
- 毛玻璃導覽列：高 48px，`position: sticky; top: 0; backdrop-filter: saturate(180%) blur(20px); background: var(--glass)`，底部 1px `--line-soft`。首頁與系統畫面都用。
- 滾動淡入：元素加 `class="reveal"`，`App.reveal()` 用 IntersectionObserver 加上 `.is-visible`（opacity 0→1、translateY 24px→0、`--dur-slow` `--ease`）；`prefers-reduced-motion` 時直接顯示。
- 按鈕：膠囊形（`--radius-pill`），主鈕 `--accent` 白字、次鈕白底 `--accent` 字 1px 邊框、文字鈕僅 `--accent` 字＋「›」；hover 150–300ms 過渡；高度 44px（手機也是），`cursor: pointer`。
- 卡片：白底、`--radius-l`、`--shadow-1`，hover 升為 `--shadow-2` 並 `translateY(-2px)`。
- 焦點：`:focus-visible` 顯示 2px `--accent` 外框；不得移除。
- 圖示：`Icons.get('name')` 回傳內嵌 SVG（線條 1.5px、24px 網格）；**禁止 emoji 當圖示**。
- 響應：斷點 1024 / 768 / 480；375px 寬不得橫向捲動；表格在手機轉為卡片列或可橫向捲動的容器（容器內捲動，頁面不捲）。

## 3. 進系統操作（app）外殼契約

每個 app 頁面骨架（f15 用 `app/index.html`，其餘 `app/fNN-slug.html`）：

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>上游租約與到期風險｜租務中樞</title>
  <link rel="stylesheet" href="../css/main.css">
  <!-- 選用：<link rel="stylesheet" href="../css/f01.css"> -->
</head>
<body class="app" data-feature="f01">
  <div id="app-shell"></div>                 <!-- App.mountShell() 渲染：頂欄（毛玻璃）＋左側導覽（手機抽屜）＋角色切換 -->
  <main class="app-main" id="main">
    <header class="page-head">
      <h1>上游租約與到期風險</h1>
      <p class="page-lead">屋主→公司→租客兩份租約並列，先到期的一眼看見。</p>
      <div class="page-actions"><!-- 主要動作最多 1 顆主鈕 --></div>
    </header>
    <!-- 內容：用 .grid / .card / .table 等共用元件 -->
  </main>
  <script src="../js/data.js"></script>
  <script src="../js/icons.js"></script>
  <script src="../js/common.js"></script>
  <script src="../js/app/f01.js"></script>
</body>
</html>
```

`common.js` 在 `DOMContentLoaded` 自動執行 `App.mountShell()`（依 `body.app` 判斷），並提供：

| API | 說明 |
|---|---|
| `App.role` / `App.setRole(r)` / `App.onRole(cb)` | 角色：`boss` 老闆、`manager` 租務管理員、`accountant` 會計、`maintenance` 修繕人員。存 localStorage（try/catch）。切換後呼叫所有 cb。 |
| `App.can(role, dataType)` | 權限矩陣查詢（`idNo`、`bank`、`rent`、`deposit`、`phone`、`repairCost`…）；`App.mask(value, dataType)` 依目前角色回傳打碼或原值。 |
| `App.toast(msg, kind)` | 右下提示條；kind: ok / warn / danger / neutral。 |
| `App.modal({title, body, actions})` | 對話框；回傳 close()。 |
| `App.fmt.money(n)` / `App.fmt.date(iso)` / `App.fmt.num(n)` / `App.fmt.pct(x)` | 格式化：千分位、`2026/09/21`、百分比。 |
| `App.daysBetween(a, b)` / `App.today` | 日期工具（`DB.today` 為基準，不用 `new Date()` 當「今天」）。 |
| `App.badge(text, kind)` / `App.kpi({label, value, delta, hint})` / `App.table({columns, rows, sortable, empty})` / `App.timeline(items)` / `App.checklist(items, onChange)` / `App.phone({title, messages})` | 回傳 HTML 字串或元素的共用元件工廠。 |
| `App.charts.line(el, {series, labels, baseline})` / `.bar(el, …)` / `.donut(el, …)` | 純 SVG 圖表，含 hover 數值提示與圖例；顏色用 tokens。 |
| `App.reveal()` | 掛滾動淡入。 |
| `App.link(featureId, kind)` | 產生到某功能的相對路徑（`kind`: `app` / `tour`），跨頁連結一律用它。 |

**元件 CSS class 清單**（`main.css` 定義；功能頁只組合、不重造）：
`.topbar .sidebar .sidebar-group .sidebar-link .drawer-toggle .role-switch`、
`.page-head .page-lead .page-actions`、`.grid .grid--2 .grid--3 .grid--4`、
`.card .card-head .card-title .card-body .card-foot`、`.kpi .kpi-value .kpi-label .kpi-delta`、
`.badge .badge--ok .badge--warn .badge--danger .badge--neutral .badge--accent`、
`.btn .btn--primary .btn--secondary .btn--ghost .btn--danger .btn--sm`、
`.table .table-wrap .table--cards`、`.tabs .tab .segmented`、`.timeline .timeline-item`、
`.checklist .checklist-item .is-done`、`.phone .phone-screen .bubble .bubble--me .bubble--them .typing`、
`.modal .modal-card .toast`、`.empty-state`、`.alert .alert--danger .alert--warn .alert--ok`、`.stat-row`、`.progress`。

**四態**：每個列表／看板都要處理正常、空、（模擬）載入中、錯誤中的至少「正常＋空」；操作要有回饋（toast）。

## 4. 功能導覽（tour）播放器契約

導覽頁骨架 `tour/fNN-slug.html`：

```html
<head>…<link rel="stylesheet" href="../css/main.css"><link rel="stylesheet" href="../css/tour.css"></head>
<body class="tour" data-feature="f01">
  <div id="tour-shell"></div>               <!-- App.mountShell() 渲染毛玻璃頂欄（回導覽清單 / 到操作頁） -->
  <main class="tour-main">
    <header class="tour-head reveal">
      <p class="eyebrow">功能導覽 · 租約與屋主</p>
      <h1>上游租約與到期風險</h1>
      <p class="page-lead">一條流程看完：新增上游租約，系統自動比對下游租約，先到期的立刻警示。</p>
    </header>
    <section id="player"></section>
  </main>
  <script src="../js/data.js"></script><script src="../js/icons.js"></script><script src="../js/common.js"></script>
  <script src="../js/tour-player.js"></script><script src="../js/tours/f01.js"></script>
</body>
```

`js/tours/fNN.js` 只做一件事：

```js
TourPlayer.mount(document.getElementById('player'), {
  feature: 'f01',
  autoplayMs: 4500,                       // 每步停留；可省略
  steps: [
    {
      title: '新增上游租約',
      text: '管理員把屋主資料與租期輸入系統。這一步只做一次，之後所有提醒都從這裡長出來。',
      render(stage, api) {                // stage: 畫面區 <div class="stage-screen">；每步重新渲染或接續上一步 DOM
        stage.innerHTML = `…用共用元件組出畫面…`;
        api.enter(stage.querySelector('.card'));      // 進場動畫
      },
      // 可選：after(stage, api) 在進場動畫後執行（例如 api.count / api.type）
    },
    …
  ],
});
```

播放器提供的 `api`：`enter(el, delay?)`（淡入上移）、`highlight(el)`（藍框脈動）、`count(el, from, to, ms?)`（數字跳動）、
`type(el, text, ms?)`（逐字出現）、`check(el)`（清單打勾動畫）、`badge(el, text, kind)`（標籤變色）、`wait(ms)`（回傳 Promise）、`cursor(x, y)`（示意游標移動到相對座標）。

播放器行為（`tour-player.js` 實作，功能頁不必管）：畫面區在左（桌機 62%）、說明在右；手機上下堆疊。控制列：自動播放／暫停、上一步、下一步、進度點（可點）、「第 N 步／共 M 步」。鍵盤 ←→ 切步、空白鍵暫停。自動播放到最後一步停止並顯示「到操作頁試試看」「回導覽清單」。步驟切換用淡入上移 300ms。畫面區有裝置外框 `.stage-frame`（圓角、細邊、頂端三個點），內部寬度固定 960px 以 `transform: scale()` 縮放適應容器。

每條導覽 **6～10 步**；每步說明 1～2 句白話（不超過 60 字），標題 6～12 字。

## 5. 假資料契約（`js/data.js` → `window.DB`）

固定「今天」：`DB.today = '2026-09-21'`。103 間物件：中壢 40（A、B 棟）、內壢 25（C 棟）、平鎮 20（D 棟）、中原 18（E 棟）。編號 `A01…A20, B01…B20, C01…C25, D01…D20, E01…E18`。所有人名用「王○○」「陳○○」等化名或常見假名；電話 `09xx-xxx-xxx` 中段打碼；身分證與銀行帳號一律部分打碼。

| 集合 | 欄位（最少） |
|---|---|
| `DB.company` | `name: '安居包租代管'`, `system: '租務中樞'`, `regions: ['中壢','內壢','平鎮','中原']`, `buildings: {A:{region:'中壢', address, garbageDays, parkingRule, wifi}, …}` |
| `DB.features` | 見 §1.1 |
| `DB.staff[]` | `id, name, role(boss/manager/accountant/maintenance/warehouse), phone` — 6 位 |
| `DB.owners[]` | `id, name, phone, bank(打碼)` — 約 35 位 |
| `DB.tenants[]` | `id, name, phone, idNo(打碼), unitId, lineBound(bool), moveIn, contractEnd, rent, deposit, paid(本月: 已繳/未繳/逾期), arrearsDays` — 約 90 位 |
| `DB.units[]` | `id, building, region, floor, type(套房/雅房/一房一廳), ping, status(rented/leaving/prep/listing/vacant), tenantId, ownerId, rent(下游月租), ownerRent(付屋主月租), upstream{start,end,payDay,deposit,adjustClause,repairResp,taxBy,mgmtFeeBy,utilitiesBy,earlyTermination,renewNoticeDate}, downstream{start,end,deposit}, keys{key,card,remote,mailbox}, baseline{water,elec}, vacantSince, monthly[3]{month, rentIncome, ownerRent, utilityDiff, internet, mgmtFee, repair, depreciation, vacancyCost}` |
| `DB.equipment[]` | `id, unitId, kind, brand, model, purchased, warrantyEnd, repairs[]{date, desc, cost, vendorId}` |
| `DB.vendors[]` | `id, name, category(水電/冷氣/鎖匠/清潔/油漆/家電), regions[], phone, avgQuote{item:amount}, avgDays, reworkRate, rating` — 12 家 |
| `DB.workOrders[]` | `id, unitId, title, item, category, status(待派工/已派工/待核准/施工中/待付款/完成), createdAt, vendorId, quote, marketAvg, approvedBy, timeline[]{at,text,by}, photos[], invoice, paid` |
| `DB.incidents[]` | `id, unitId, level(一般/重大/緊急), type, status, assigneeId, createdAt, timeline[], photos[], chat[]{at, who, text}` |
| `DB.deposits[]` | `unitId, tenantId, amount, receivedAt, status(持有中/結算中/已退還/逾期未結算), deductions[]{item, amount, basis}, refundAt, refundAmount, proof` |
| `DB.utilities[]` | `unitId, month(12 個月), water, elec` |
| `DB.keysLog[]` | `unitId, item, action(領用/歸還), qty, at, by` |
| `DB.todos[]` | `id, title, unitId, assigneeId, due, status(待處理/進行中/完成), kind, overdue` |
| `DB.notifications[]` | `id, type(催租/續約/退租/點交), to(tenantId), unitId, sentAt, content, delivered, deliveredAt, repliedAt, reply` |
| `DB.photos[]` | `id, unitId, date, by(tenant/company), tag, src(相對路徑 SVG 假圖)` |
| `DB.escalationRules[]` | `event, levels[]{after, action, to}` |
| `DB.kb[]` | `building, topic, q, a` — 每棟 6 題以上 |
| `DB.auditLog[]` | `at, who, action, unitId, field, from, to` |
| `DB.docTypes[]` | 8 種文件 `{id, name, fields[]}` |
| `DB.leads[]` / `DB.showings[]` | 招租詢問、帶看預約 |
| `DB.stats` | 由上面推導的彙總（出租率、空置率、平均空置天數、續租率、欠租率、修繕費率、30/60/90 到期數、現金流 6 個月） |
| `DB.workCenter()` | 回傳今天需人工處理的 7 件（見故事） |
| 工具 | `DB.unit(id)`, `DB.tenantOf(unitId)`, `DB.ownerOf(unitId)`, `DB.unitsBy({region, status})`, `DB.staffById(id)`, `DB.vendorById(id)` |

**故事數字（各功能的畫面靠這些成立，缺一不可）**：
- 上游先到期而房客仍在租：**A03、B07、C12**（上游 2026-11-30 / 2026-12-31 / 2027-01-15；下游都到 2027 年中後）。
- 本月虧損（淨利 < 0）：**B07、B11、C05、D02、D09**；淨利 < 2,000 再加 2 間。最賺前五：A01、A05、B02、C01、D04。
- 區域彙總範例：中壢 40 間、本月收入 300,000 元、總成本 218,000 元、淨利 82,000 元（各區數字需自洽）。
- 空置超過 14 天：**A12（21 天）、C08（33 天）**；空置 8～13 天：D15。即將空房（已通知不續租）：B15、E03。整備中：C20。
- 水表異常：**B04** 8 度 → 25 度（本月）；空房卻持續用電：**C08**。
- 冷氣修 4 次：**A07** 的日立冷氣，5 年內 4 次，累計 13,000 元 → 建議汰換。
- 報價異常：工單 **WO-1043**（B02 換馬桶水箱零件）廠商報 3,500，市場平均 1,800。
- 緊急事件：**INC-07** B04 漏水至樓下 B03，時間軸 ≥ 6 步。
- 押金逾期未結算：**D11**（退租 45 天）；結算中：B15。
- 通知升級示範案件：工單 **WO-1051**（C03 報修）24h 未回 → 再問 → 48h 升級管理員。
- 操作紀錄示範：`2026-09-20 14:36 劉○○ 將 A01 租金由 13,000 改為 12,000`。
- 今天需人工處理 7 件：帳款金額不符 1（A09）、欠租 2（B11、E07）、AI 無法判斷修繕 1（WO-1051）、屋主合約即將到期 1（A03）、退租押金尚未結算 1（D11）、空房超過 14 天 1（C08）；其餘 96 間一切正常。
- 待辦：管理員「陳○○」20 件待辦、逾期 3 件。
- 租客 A01「王○○」：LINE 已綁定、本月 13,000 已繳、租約到 2027-03-31、A 棟、林內 16L 熱水器。

## 6. 文案（ux-writing 摘要，全站一致）

- 繁體中文、白話、不用英文術語（例外：LINE、AI、API、CSV、PDF）。
- 名詞統一：**物件**（一間房，如 A01）、**租客**、**屋主**、**上游租約**（屋主→公司）、**下游租約**（公司→租客）、**工單**（修繕）、**事件**（重大／客訴）、**待辦**、**押金**、**整備**（退租後復原）、**帶看**、**刊登**、**廠商**、**操作紀錄**。
- 按鈕用動詞＋受詞：「建立續租待辦」「開始結算」「產生文件」「派工」「標記為可出租」；不用「確定」「OK」。
- 空狀態給一句說明＋下一步；警示說「發生什麼＋怎麼辦」。
- 標點用全形；中英數之間半形空白；「/」改用「／」或「、」；不要驚嘆號。

## 6.1 檔案所有權（平行開發防互踩）

- 基礎層（DEMO-01）擁有：`index.html`、`css/main.css`、`css/home.css`、`css/tour.css`、`js/data.js`、`js/icons.js`、`js/common.js`、`js/tour-player.js`、`tour/index.html`、`app/index.html` 的外殼。
- 各功能只能新增／修改自己的：`app/fNN-slug.html`（f15 為 `app/index.html` 的內容區）、`js/app/fNN.js`、`tour/fNN-slug.html`、`js/tours/fNN.js`、（選用）`css/fNN.css`、`assets/fNN-*.svg`。
- 功能需要基礎層沒有的資料或元件：**在自己的 js 檔內補**（例如 `const EXTRA = {...}`、自己的小函式），不得改 `data.js`／`common.js`／`main.css`；覺得契約缺什麼，在回報中列出，由整合階段統一補進基礎層。

## 7. 驗證方式（給實作者與驗收者）

- 本機伺服器已在 `http://127.0.0.1:8010/`（repo 根目錄），首頁為 `http://127.0.0.1:8010/src/index.html`。
- 截圖：`scripts/shot.sh <站內路徑> <輸出.png> [desktop|mobile|long]`，例：
  `scripts/shot.sh src/app/f01-upstream-lease.html /tmp/f01.png mobile`。用 Read 工具看圖。
- `make check` 必綠（含 static-check）。
- 主控台無錯誤：`scripts/console-check.sh <站內路徑>` 印出頁面載入時的 JS 錯誤（沒有輸出＝乾淨）。
