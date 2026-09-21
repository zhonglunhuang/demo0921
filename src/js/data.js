/*
 * data.js — 租務中樞 共用假資料（window.DB）
 * ------------------------------------------------------------
 * 這是 20 個功能畫面的唯一事實來源（docs/DESIGN.md §5）。各功能頁只讀不改。
 * 103 間物件由程式產生（迴圈＋覆寫特殊案例），故事數字（A03、B07、C08、WO-1043…）
 * 全部明確寫死在 SPECIAL_UNITS / 各集合中，並在檔尾以 DB.stats 由資料推導彙總。
 *
 * 約定：
 * - 「今天」固定為 DB.today（2026-09-21），任何日期計算都以此為基準，不用 new Date()。
 * - 人名一律化名（王○○）；電話中段打碼；身分證、銀行帳號部分打碼。
 * - 金額單位皆為新台幣元；月份鍵值格式 'YYYY-MM'；日期格式 'YYYY-MM-DD'。
 * - DB.photos[].src 與 workCenter().link 皆相對於 src/app/、src/tour/ 這一層（../assets/…、fNN-slug.html）。
 * - 不是 ES module：以 <script src="../js/data.js"> 直接載入，最後一行 window.DB = DB。
 */
(function () {
  'use strict';

  var TODAY = '2026-09-21';
  var CURRENT_MONTH = '2026-09';
  var MONTHS = ['2026-07', '2026-08', '2026-09'];

  /* ============================================================
   * 0. 小工具（可重現的亂數、日期）
   * ============================================================ */
  function seededRandom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = seededRandom(20260921);
  function between(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function roundTo(n, step) { return Math.round(n / step) * step; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function toISO(d) { return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function fromISO(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function addDays(iso, n) { var d = fromISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
  function addMonths(iso, n) {
    var d = fromISO(iso); var day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return toISO(d);
  }
  function daysBetween(a, b) { return Math.round((fromISO(b) - fromISO(a)) / 86400000); }
  function monthOf(iso) { return iso.slice(0, 7); }
  function monthLabel(m) { return m.slice(0, 4) + ' 年 ' + (+m.slice(5)) + ' 月'; }
  function daysInMonth(m) { var p = m.split('-'); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  function sum(arr, fn) { var t = 0; for (var i = 0; i < arr.length; i++) t += fn ? fn(arr[i]) : arr[i]; return t; }
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function assign(target, src) { for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k]; return target; }

  var SURNAMES = ['王', '陳', '林', '張', '李', '黃', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭', '洪', '曾',
    '邱', '廖', '賴', '周', '徐', '蘇', '葉', '莊', '呂', '江', '何', '蕭', '羅', '高', '潘', '簡', '朱', '鍾', '游', '彭'];
  function fakeName(i) { return SURNAMES[i % SURNAMES.length] + '○○'; }
  function fakePhone(i) { return '09' + pad2((i * 7) % 90 + 10) + '-***-' + pad2((i * 37) % 90 + 10) + ((i * 3) % 10); }
  function fakeIdNo(i) { var letters = 'ABCDEFGHJKLMNPQRSTUVXYWZ'; return letters[i % letters.length] + ((i % 2) + 1) + '2****' + pad2((i * 13) % 90 + 10) + (i % 10); }
  var BANKS = ['台灣銀行', '中國信託', '國泰世華', '玉山銀行', '台新銀行', '第一銀行', '合作金庫', '郵局'];
  function fakeBank(i) { return BANKS[i % BANKS.length] + ' ****-****-' + pad2((i * 29) % 90 + 10) + pad2((i * 11) % 90 + 10); }

  var DB = {};
  DB.today = TODAY;
  DB.currentMonth = CURRENT_MONTH;
  DB.months = MONTHS;
  DB.version = '1.0.0';

  /* ============================================================
   * 1. 公司、棟別、角色與權限
   * ============================================================ */
  DB.company = {
    name: '安居包租代管',
    system: '租務中樞',
    regions: ['中壢', '內壢', '平鎮', '中原'],
    buildings: {
      A: { code: 'A', name: 'A 棟', region: '中壢', address: '桃園市中壢區環中東路 128 號', floors: '2 至 5 樓', units: 20,
        garbageDays: '週一、三、五 19:30，環中東路口垃圾車定點', parkingRule: '機車停 1 樓車棚，汽車需另租月租車位',
        wifi: '各層獨立光纖 300M，密碼貼在各樓層電表箱內側', hotWater: '各間獨立瓦斯熱水器（林內 16L）' },
      B: { code: 'B', name: 'B 棟', region: '中壢', address: '桃園市中壢區元化路 66 號', floors: '2 至 5 樓', units: 20,
        garbageDays: '週二、四、六 20:10，元化路與中央西路口', parkingRule: '機車停地下室，磁扣感應進出；汽車無車位',
        wifi: '每間獨立 WiFi，名稱為房號、密碼於入住資料卡', hotWater: '各間獨立電熱水器，出門請關電源' },
      C: { code: 'C', name: 'C 棟', region: '內壢', address: '桃園市中壢區中華路一段 512 號', floors: '2 至 6 樓', units: 25,
        garbageDays: '週一至週六 18:40，中華路一段大門口', parkingRule: '機車停騎樓劃線區，請勿佔用鄰居店面',
        wifi: '公共 WiFi 涵蓋全棟，名稱 C-Home，密碼貼於各層公佈欄', hotWater: '各間獨立瓦斯熱水器（櫻花 12L）' },
      D: { code: 'D', name: 'D 棟', region: '平鎮', address: '桃園市平鎮區環南路二段 88 號', floors: '2 至 5 樓', units: 20,
        garbageDays: '週一、二、四、五 19:00，環南路二段郵局前', parkingRule: '汽機車皆可停後方空地，先到先停',
        wifi: '各層獨立光纖 200M，密碼於入住資料卡', hotWater: '各間獨立瓦斯熱水器（莊頭北 13L）' },
      E: { code: 'E', name: 'E 棟', region: '中原', address: '桃園市中壢區中北路二段 240 號', floors: '2 至 4 樓', units: 18,
        garbageDays: '週一、三、五、六 21:00，中北路二段中原夜市口', parkingRule: '機車停 1 樓騎樓，汽車請停對面收費停車場',
        wifi: '每間獨立 WiFi，名稱為房號，密碼於入住資料卡', hotWater: '各間獨立電熱水器' }
    }
  };

  DB.roles = [
    { id: 'boss', name: '老闆', desc: '看全部資料與損益' },
    { id: 'manager', name: '租務管理員', desc: '租客、租約、押金、工單；看不到銀行帳戶' },
    { id: 'accountant', name: '會計', desc: '帳款、租金、押金、銀行帳戶；看不到身分證' },
    { id: 'maintenance', name: '修繕人員', desc: '工單、設備、聯絡電話；看不到租金與押金' }
  ];
  /* 權限矩陣：資料類型 → 可看的角色。App.can(role, type) 依此查詢。 */
  DB.permissions = {
    idNo: ['boss', 'manager'],
    bank: ['boss', 'accountant'],
    rent: ['boss', 'manager', 'accountant'],
    ownerRent: ['boss', 'accountant'],
    deposit: ['boss', 'manager', 'accountant'],
    phone: ['boss', 'manager', 'maintenance'],
    repairCost: ['boss', 'manager', 'accountant', 'maintenance'],
    pnl: ['boss']
  };

  DB.staff = [
    { id: 'S01', name: '張○○', role: 'boss', roleName: '老闆', phone: '0910-***-001' },
    { id: 'S02', name: '陳○○', role: 'manager', roleName: '租務管理員', phone: '0921-***-002' },
    { id: 'S03', name: '劉○○', role: 'manager', roleName: '租務管理員', phone: '0922-***-003' },
    { id: 'S04', name: '黃○○', role: 'accountant', roleName: '會計', phone: '0933-***-004' },
    { id: 'S05', name: '吳○○', role: 'maintenance', roleName: '修繕人員', phone: '0955-***-005' },
    { id: 'S06', name: '李○○', role: 'warehouse', roleName: '倉管', phone: '0966-***-006' }
  ];

  /* ============================================================
   * 2. 首頁文案（定稿）與功能註冊表（DESIGN.md §1.1）
   * ============================================================ */
  DB.home = {
    hero: {
      eyebrow: '租務中樞',
      headline: '房子再多，也不漏一件事',
      sub: '為安居包租代管量身規劃。從屋主到租客，一套管到底。',
      primaryCta: '進系統操作',
      secondaryCta: '功能導覽'
    },
    chapters: [
      { id: 'morning', dark: false, featureId: 'f15',
        eyebrow: '08:30 管理員的早上', title: '打開系統，只看 7 件', sub: '異常才找人，其餘 96 間不打擾',
        body: '打開系統，看到的不是 103 間的清單，而是今天真的需要人判斷的 7 件：帳款不符、欠租、AI 無法判斷的修繕、屋主合約快到期、押金未結算、空房逾 14 天。處理完，數字歸零。',
        visual: '工作中心首屏：一行大字「今天需要人工處理 7 件」，下方七張卡片依六種類型排列（欠租 2 張），最底一行「96 間一切正常」預設收合。' },
      { id: 'upstream', dark: true, featureId: 'f01',
        eyebrow: '09:10 一封提前 60 天的提醒', title: '上游租約先到期，租客還在住', sub: '兩份租約並列，先到期的一眼看見',
        body: '包租代管永遠有兩份租約。A03 的屋主合約 11 月 30 日到期，租客卻租到 2027 年中。系統把兩條時間軸疊在一起，紅色標出先到期的那份，提前 60 天建立續租待辦。今天這樣的物件有 3 間。',
        visual: '物件 A03 詳情：上游與下游兩條時間軸並列，上游那條在 2026/11/30 截止並亮紅色警示，下游延伸到 2027 年中，右側一顆「建立續租待辦」按鈕。' },
      { id: 'vacancy', dark: false, featureId: 'f03',
        eyebrow: '11:00 空房才是最大的損失', title: '空房不是等待，是一條流程', sub: '超過 7 天沒租出去，系統先問是不是價格',
        body: '租客在 LINE 說不續租，物件自動切成即將空房，租金建議、刊登文案的待辦跟著產生。整備 14 項全部打勾，才能標記為可出租。C08 空了 33 天，看板標紅，附上同區行情。',
        visual: '招租看板七欄從「即將空房」到「已入住」，C08 卡片標紅顯示「空置 33 天」與同區同房型的租金建議區間。' },
      { id: 'quote', dark: true, featureId: 'f07',
        eyebrow: '14:20 一筆報價被抓到', title: '同一個零件，報價差一倍', sub: '廠商報價一進來，系統先比歷史平均',
        body: 'B02 換馬桶水箱零件，廠商報 3,500 元。核准畫面標出：同項目平均 1,800 元，價格異常。改派另一家，報價、完工照片、發票、付款全留在工單時間軸。每一筆修繕的錢，都查得到。',
        visual: '工單 WO-1043 核准畫面：報價 3,500 元旁邊一個橘色「價格異常」標籤，下方一行「同項目平均 1,800 元」，右側可改派其他廠商。' },
      { id: 'tenant', dark: false, featureId: 'f10',
        eyebrow: '16:00 租客那一端', title: '租客自己查，客服就少接一通', sub: 'LINE 綁定身分，AI 依他住的那間回答',
        body: '租客加 LINE、輸入房號與手機末三碼，就綁定成 A01 的王○○。帳單、到期日、報修、退租，選單點一下就有。問「垃圾怎麼丟」，AI 依公司知識庫照 A 棟回答，不靠網路亂答。',
        visual: '手機外框裡的 LINE 對話：綁定成功卡片「已綁定：A01 租客 王○○」，下方九格圖文選單，最後一則是 AI 回覆 A 棟垃圾車時間。' },
      { id: 'boss', dark: true, featureId: 'f02',
        eyebrow: '21:00 老闆的晚上', title: '不是收租率，是真正的損益', sub: '每一間都算到淨利，哪 5 間最賺、哪 5 間快沒了',
        body: '收租率 94% 很好看，但 B07 這個月是虧的。收入減掉付屋主租金、水電、網路、管理費、修繕、折舊、空置成本，才是淨利。老闆一句話看完：中壢 40 間，淨利 82,000 元。',
        visual: '黑底儀表板：三張數字卡「收入 293,600」「成本 260,900」「淨利 32,700」，下方左右兩欄「最賺 5 間」「快沒利潤 5 間」，B07 在右欄第一列標紅。' },
      { id: 'trail', dark: false, featureId: 'f14',
        eyebrow: '每一天，每一筆', title: '誰改了什麼，三年後還查得到', sub: '幾年後的爭議，今天就留證據',
        body: '會計看不到身分證，修繕人員看不到押金。劉○○把 A01 租金從 13,000 改成 12,000，紀錄立刻多一筆。通知何時送達、何時回覆，全部留存。資料屬於安居，隨時完整帶走。',
        visual: '操作紀錄列表最上面一列「2026/09/20 14:36 劉○○ 將 A01 租金由 13,000 改為 12,000」；角色切到「會計」時，租客身分證欄位變成打碼。' }
    ],
    closing: {
      title: '資料屬於你，不屬於系統商',
      sub: '租客、租約、帳款、修繕、照片，隨時完整匯出，也有 API。今天 103 間，做到 300 間也不用重來。',
      cta: '進系統操作'
    },
    footer: {
      line: '租務中樞提案示範 · 畫面中的物件、人名與金額皆為模擬資料 · 提案聯絡：提案者 林○○ · 09xx-xxx-xxx'
    }
  };

  DB.groups = [
    { id: 1, name: '租約與屋主', blurb: '上游、下游兩份租約並列管理，押金獨立結算，文件自動帶入資料。' },
    { id: 2, name: '損益與儀表板', blurb: '每間房算到淨利，老闆一頁看完出租率、到期數與現金流。' },
    { id: 3, name: '空房到入住', blurb: '從通知不續租到重新入住，一條漏斗加一張整備清單，空房天數一清二楚。' },
    { id: 4, name: '設備、修繕與資產', blurb: '設備有履歷、廠商有評分、報價有比對，水電異常自動抓。' },
    { id: 5, name: '租客服務與通知', blurb: '租客在 LINE 自己查、自己報修，AI 依棟別回答，往返紀錄全留存，逾時自動升級。' },
    { id: 6, name: '事件、權限與工作中心', blurb: '重大事件獨立管理，權限分層，操作留痕，每天只看需要人處理的幾件。' },
    { id: 7, name: '資料所有權', blurb: '所有資料可完整匯出、有 API，換系統商也帶得走。' }
  ];

  /* 順序 = DESIGN.md §1.1 註冊表順序（f15 排在群 6 第一個）。tourSteps 為導覽步數（6～10）。 */
  var FEATURE_ROWS = [
    ['f15', 'work-center', 'AI 工作中心', 6, 'DEMO-07', 8, '今天只看需要人處理的 7 件', '異常才找人。帳款不符、欠租、屋主合約到期、押金未結算集中在首頁，其餘 96 間收起來。'],
    ['f01', 'upstream-lease', '上游租約與到期風險', 1, 'DEMO-02', 8, '屋主的約先到期，租客還在住', '兩份租約並列，先到期的紅色標出，60 天前自動建立續租待辦；今天有 3 間命中。'],
    ['f04', 'deposits', '押金管理', 1, 'DEMO-02', 7, '收了多少、扣了什麼、退了沒', '每間押金一張卡：收到、扣除項目與依據、退款證明。退租 45 天沒結算，系統會提醒。'],
    ['f17', 'documents', '自動產生文件', 1, 'DEMO-02', 6, '姓名、地址、租金，不用再手打', '契約、續約書、催繳通知、押金結算單等 8 種，選租客就自動帶入，一鍵用 LINE 傳。'],
    ['f02', 'unit-pnl', '每間房真正損益', 2, 'DEMO-03', 8, '收入減七項成本，才是淨利', '每間房自動算出本月淨利與年化報酬，最賺 5 間、快沒利潤 5 間一眼看見。'],
    ['f16', 'owner-dashboard', '老闆營運儀表板', 2, 'DEMO-03', 7, '你真正會看的那一頁', '出租率、空置天數、續租率、欠租率、包租淨利、30／60／90 天到期數與現金流。'],
    ['f03', 'vacancy-funnel', '空房招租漏斗', 3, 'DEMO-04', 9, '空房第 8 天，系統先問是不是價格', '不續租、整備、刊登、帶看、收訂、簽約、入住七欄看板，平均空置天數自動統計。'],
    ['f05', 'moveout-prep', '退租整備流程', 3, 'DEMO-04', 8, '14 項打勾完，才能再出租', '電表、鑰匙、家具、牆面到清潔逐項檢查，需修繕直接開工單，全部完成才回到庫存。'],
    ['f06', 'equipment', '設備履歷', 4, 'DEMO-05', 7, '這台冷氣修了 4 次，該換了', '每間房的冷氣、冰箱、熱水器都有品牌、保固與維修紀錄，累計維修費過高，AI 建議汰換。'],
    ['f07', 'vendors-workorders', '廠商與修繕工單', 4, 'DEMO-05', 9, '報價一進來，先比歷史平均', '廠商分類、區域、返修率與評分；工單從報修、派工、報價、核准到付款，每步留紀錄。'],
    ['f08', 'utility-anomaly', '水電異常偵測', 4, 'DEMO-05', 6, '8 度變 25 度，可能在漏水', '每房用量對照過往基準，超過兩倍或空房仍在用電就警示，一鍵派工檢查。'],
    ['f09', 'keys-access', '鑰匙與門禁管理', 4, 'DEMO-05', 6, '幾把鑰匙、幾張磁扣，領退都有數', '每間鑰匙、磁扣、遙控器的領用與歸還都有簽收，退租短少自動列入押金扣款。'],
    ['f10', 'line-selfservice', '租客 LINE 自助中心', 5, 'DEMO-06', 8, '租客自己查帳單，不用問客服', '加入 LINE 綁定房號，帳單、繳費狀態、租約到期、報修、續租、退租，選單點一下就有。'],
    ['f11', 'ai-support', 'AI 客服與知識庫', 5, 'DEMO-06', 7, 'AI 只照公司知識庫回答', '垃圾怎麼丟、磁扣怎麼用、熱水器怎麼開，依租客住的棟別與房間回答，不拿網路答案亂猜。'],
    ['f13', 'evidence', '證據留存', 5, 'DEMO-06', 6, '何時送、送給誰、有沒有回', '催租、續約、退租通知每筆留下發送、送達與回覆紀錄；照片依日期與房間永久歸檔。'],
    ['f19', 'escalation', '通知升級機制', 5, 'DEMO-06', 7, '24 小時沒回再問，48 小時找人', 'AI 先處理第一層，逾時才逐級升級到管理員；重大漏水立即電話加 LINE 通知值班人員。'],
    ['f12', 'incidents', '重大事件管理', 6, 'DEMO-07', 8, '漏水到樓下，不跟燈泡壞了混在一起', '漏水、噪音、警察到場、租客失聯另開事件：等級、照片、對話、負責人與完整時間軸。'],
    ['f14', 'permissions-audit', '權限與操作紀錄', 6, 'DEMO-07', 7, '誰能看、誰改了，都查得到', '身分證、銀行帳戶、租金、押金依角色打碼；任何金額改動都留下一筆操作紀錄。'],
    ['f18', 'todos-performance', '待辦與員工績效', 6, 'DEMO-07', 7, '每件事都有負責人和期限', '管理員目前 20 件待辦、逾期 3 件一眼看見；本月入住、退租、報修、帶看各完成幾件。'],
    ['f20', 'data-export', '資料匯出與所有權', 7, 'DEMO-08', 6, '資料是你的，換系統也帶得走', '租客、租約、帳款、修繕、照片隨時完整匯出，提供 API；資料屬於安居包租代管。']
  ];
  DB.features = FEATURE_ROWS.map(function (r) {
    var group = byId(DB.groups, r[3]);
    return {
      id: r[0], slug: r[1], name: r[2], group: r[3], groupName: group.name, ticket: r[4],
      tourSteps: r[5], tourMinutes: Math.max(1, Math.round(r[5] * 4.5 / 60)),
      tagline: r[6], blurb: r[7],
      appPage: r[0] === 'f15' ? 'index.html' : r[0] + '-' + r[1] + '.html',
      tourPage: r[0] + '-' + r[1] + '.html'
    };
  });
  DB.feature = function (id) { return byId(DB.features, id); };
  /* 群組 → 該群功能（給左側導覽、首頁卡片、導覽清單） */
  DB.featuresByGroup = function () {
    return DB.groups.map(function (g) {
      return assign({ features: DB.features.filter(function (f) { return f.group === g.id; }) }, g);
    });
  };

  /* ============================================================
   * 3. 廠商（12 家）與工單
   *    marketAvg = 所有報過該項目的廠商 avgQuote 平均（馬桶水箱零件 → 1,800）
   * ============================================================ */
  DB.vendors = [
    { id: 'V01', name: '大同水電行', category: '水電', regions: ['中壢', '內壢'], phone: '03-4**-1201',
      avgQuote: { '馬桶水箱零件': 1800, '熱水器檢修': 1500, '熱水器更換': 5500, '排水管疏通': 1200, '燈具更換': 600, '漏水檢修': 4200 }, avgDays: 1.5, reworkRate: 0.04, rating: 4.6 },
    { id: 'V02', name: '永安水電', category: '水電', regions: ['中壢', '平鎮'], phone: '03-4**-1202',
      avgQuote: { '馬桶水箱零件': 1700, '排水管疏通': 1300, '燈具更換': 500, '紗窗更換': 900, '雜項小修': 1200 }, avgDays: 2, reworkRate: 0.06, rating: 4.3 },
    { id: 'V03', name: '鴻裕水電', category: '水電', regions: ['中壢', '內壢', '中原'], phone: '03-4**-1203',
      avgQuote: { '馬桶水箱零件': 1900, '熱水器檢修': 1800, '燈具更換': 700, '漏水檢修': 4500 }, avgDays: 1, reworkRate: 0.11, rating: 3.9 },
    { id: 'V04', name: '冠宇冷氣工程', category: '冷氣', regions: ['中壢', '內壢', '平鎮'], phone: '03-4**-1204',
      avgQuote: { '冷媒補充': 2500, '冷氣清洗': 1500, '壓縮機更換': 9500, '冷氣檢修': 3500 }, avgDays: 2, reworkRate: 0.05, rating: 4.5 },
    { id: 'V05', name: '立群冷氣', category: '冷氣', regions: ['中壢', '中原'], phone: '03-4**-1205',
      avgQuote: { '冷媒補充': 2300, '冷氣清洗': 1400, '壓縮機更換': 9000, '冷氣檢修': 3200 }, avgDays: 3, reworkRate: 0.08, rating: 4.2 },
    { id: 'V06', name: '安鎖鎖匠', category: '鎖匠', regions: ['中壢', '內壢', '平鎮', '中原'], phone: '0912-***-206',
      avgQuote: { '門鎖更換': 1200, '開鎖': 800 }, avgDays: 0.5, reworkRate: 0.02, rating: 4.8 },
    { id: 'V07', name: '潔淨清潔', category: '清潔', regions: ['中壢', '內壢'], phone: '03-4**-1207',
      avgQuote: { '退租清潔': 2500, '公共區域清潔': 1800 }, avgDays: 1, reworkRate: 0.03, rating: 4.7 },
    { id: 'V08', name: '亮家清潔', category: '清潔', regions: ['平鎮', '中原'], phone: '03-4**-1208',
      avgQuote: { '退租清潔': 2200, '公共區域清潔': 1600 }, avgDays: 1.5, reworkRate: 0.07, rating: 4.1 },
    { id: 'V09', name: '彩藝油漆', category: '油漆', regions: ['中壢', '內壢', '平鎮', '中原'], phone: '0933-***-209',
      avgQuote: { '單間油漆': 6000, '局部補漆': 1500, '油漆與燈具': 4200 }, avgDays: 3, reworkRate: 0.04, rating: 4.4 },
    { id: 'V10', name: '家電維修中心', category: '家電', regions: ['中壢', '內壢', '中原'], phone: '03-4**-1210',
      avgQuote: { '冰箱檢修': 1500, '洗衣機檢修': 1300, '電熱水器更換': 6500 }, avgDays: 2, reworkRate: 0.05, rating: 4.4 },
    { id: 'V11', name: '全方位家電', category: '家電', regions: ['平鎮', '中壢'], phone: '03-4**-1211',
      avgQuote: { '冰箱檢修': 1600, '洗衣機檢修': 1400, '電熱水器更換': 6200 }, avgDays: 2.5, reworkRate: 0.09, rating: 4.0 },
    { id: 'V12', name: '順發水電', category: '水電', regions: ['中原', '平鎮'], phone: '03-4**-1212',
      avgQuote: { '馬桶水箱零件': 1800, '熱水器檢修': 1600, '排水管疏通': 1200, '紗窗更換': 900, '雜項小修': 1100 }, avgDays: 1.5, reworkRate: 0.05, rating: 4.5 }
  ];
  DB.vendorById = function (id) { return byId(DB.vendors, id); };
  DB.marketAvgOf = function (item) {
    var vals = [];
    DB.vendors.forEach(function (v) { if (v.avgQuote[item] != null) vals.push(v.avgQuote[item]); });
    return vals.length ? roundTo(sum(vals) / vals.length, 100) : null;
  };

  /* 工單：id, 物件, 標題, 項目, 類別, 狀態, 建立日, 廠商, 報價, 額外欄位。時間軸由 buildTimeline 依狀態展開。 */
  function wo(id, unitId, title, item, category, status, createdAt, vendorId, quote, extra) {
    return assign({
      id: id, unitId: unitId, title: title, item: item, category: category, status: status,
      createdAt: createdAt, vendorId: vendorId, quote: quote, marketAvg: DB.marketAvgOf(item),
      approvedBy: null, completedAt: null, invoice: null, paid: false, photos: [], timeline: [],
      incidentId: null, aiUndecided: false, source: '租客 LINE 報修'
    }, extra || {});
  }
  DB.workOrders = [
    wo('WO-1019', 'A11', '熱水器點不著，需更換', '熱水器更換', '水電', '完成', '2026-07-08', 'V01', 5500, { completedAt: '2026-07-10', invoice: 'INV-260710-03', paid: true }),
    wo('WO-1021', 'C17', '冷氣有霉味，清洗', '冷氣清洗', '冷氣', '完成', '2026-07-15', 'V04', 1500, { completedAt: '2026-07-16', invoice: 'INV-260716-11', paid: true }),
    wo('WO-1022', 'E09', '馬桶一直流水，換水箱零件', '馬桶水箱零件', '水電', '完成', '2026-07-21', 'V03', 1800, { completedAt: '2026-07-22', invoice: 'INV-260722-07', paid: true }),
    wo('WO-1024', 'B03', '浴室排水慢', '排水管疏通', '水電', '完成', '2026-08-04', 'V01', 1200, { completedAt: '2026-08-05', invoice: 'INV-260805-02', paid: true }),
    wo('WO-1026', 'D06', '房間主燈不亮', '燈具更換', '水電', '完成', '2026-08-11', 'V02', 600, { completedAt: '2026-08-12', invoice: 'INV-260812-05', paid: true }),
    wo('WO-1028', 'A07', '冷氣不冷，壓縮機啟動電容更換', '冷氣檢修', '冷氣', '完成', '2026-08-12', 'V04', 3800, { completedAt: '2026-08-14', invoice: 'INV-260814-09', paid: true, equipmentId: 'EQ-A07-1' }),
    wo('WO-1029', 'C22', '馬桶水箱漏水，換零件', '馬桶水箱零件', '水電', '完成', '2026-08-20', 'V01', 1800, { completedAt: '2026-08-21', invoice: 'INV-260821-04', paid: true }),
    wo('WO-1031', 'D02', '牆面壁癌補漆並更換燈具', '油漆與燈具', '油漆', '待付款', '2026-09-03', 'V09', 4200, { completedAt: '2026-09-08', invoice: 'INV-260908-06' }),
    wo('WO-1033', 'B11', '熱水器點火不良', '熱水器檢修', '水電', '完成', '2026-09-04', 'V01', 3800, { completedAt: '2026-09-09', invoice: 'INV-260909-01', paid: true }),
    wo('WO-1035', 'C05', '排水管阻塞，浴室積水', '排水管疏通', '水電', '完成', '2026-09-06', 'V01', 1500, { completedAt: '2026-09-10', invoice: 'INV-260910-08', paid: true }),
    wo('WO-1038', 'B07', '冷氣壓縮機故障，整台更換壓縮機', '壓縮機更換', '冷氣', '完成', '2026-09-05', 'V04', 9500, { completedAt: '2026-09-10', invoice: 'INV-260910-12', paid: true, equipmentId: 'EQ-B07-1' }),
    wo('WO-1040', 'D09', '門鎖卡住，更換鎖心', '門鎖更換', '鎖匠', '完成', '2026-09-08', 'V06', 1200, { completedAt: '2026-09-12', invoice: 'INV-260912-03', paid: true }),
    wo('WO-1041', 'E12', '紗窗破損更換', '紗窗更換', '水電', '待付款', '2026-09-10', 'V12', 900, { completedAt: '2026-09-11', invoice: 'INV-260911-10' }),
    wo('WO-1042', 'A18', '熱水器水溫不穩', '熱水器檢修', '水電', '完成', '2026-09-11', 'V03', 1800, { completedAt: '2026-09-14', invoice: 'INV-260914-02', paid: true }),
    wo('WO-1043', 'B02', '換馬桶水箱零件', '馬桶水箱零件', '水電', '待核准', '2026-09-19', 'V03', 3500, { quotedAt: '2026-09-20 11:40' }),
    wo('WO-1044', 'C20', '退租整備：全室油漆', '單間油漆', '油漆', '施工中', '2026-09-12', 'V09', 6000, { source: '整備清單開單', approvedBy: 'S02' }),
    wo('WO-1045', 'C20', '退租整備：清潔', '退租清潔', '清潔', '已派工', '2026-09-15', 'V07', 2500, { source: '整備清單開單' }),
    wo('WO-1046', 'B04', '浴室漏水至樓下 B03 天花板', '漏水檢修', '水電', '施工中', '2026-09-16', 'V01', 4500, { incidentId: 'INC-07', approvedBy: 'S02', source: '事件 INC-07 派工' }),
    wo('WO-1047', 'E05', '洗衣機不排水', '洗衣機檢修', '家電', '已派工', '2026-09-17', 'V10', 1300),
    wo('WO-1048', 'A14', '走道燈管更換', '燈具更換', '水電', '待付款', '2026-09-17', 'V02', 400, { completedAt: '2026-09-18', invoice: 'INV-260918-04' }),
    wo('WO-1049', 'D15', '退租整備：門把與矽利康小修', '雜項小修', '水電', '完成', '2026-09-13', 'V02', 1200, { completedAt: '2026-09-16', invoice: 'INV-260916-07', paid: true, source: '整備清單開單' }),
    wo('WO-1050', 'C11', '冰箱不冷', '冰箱檢修', '家電', '已派工', '2026-09-18', 'V10', 1500),
    wo('WO-1051', 'C03', '熱水器忽冷忽熱', '熱水器檢修', '水電', '待派工', '2026-09-18', null, null, { aiUndecided: true }),
    wo('WO-1052', 'E14', '紗窗破洞', '紗窗更換', '水電', '已派工', '2026-09-19', 'V12', 900),
    wo('WO-1053', 'A02', '馬桶止水皮漏水', '馬桶水箱零件', '水電', '已派工', '2026-09-20', 'V01', 1800)
  ];
  /* 依狀態展開時間軸（WO-1051 的升級示範另外寫死） */
  function buildTimeline(o) {
    var v = o.vendorId ? DB.vendorById(o.vendorId) : null;
    var t = [];
    var day = o.createdAt;
    t.push({ at: day + ' 09:20', text: o.source + '：' + o.title, by: o.source.indexOf('租客') === 0 ? '租客' : '陳○○' });
    if (o.aiUndecided) {
      t = [
        { at: '2026-09-18 10:12', text: '租客 LINE 報修：洗澡時水忽冷忽熱', by: '租客' },
        { at: '2026-09-18 10:13', text: 'AI 詢問：是否聽到點火聲、其他水龍頭水壓是否正常、發生時段', by: 'AI' },
        { at: '2026-09-19 10:15', text: '24 小時未回覆，AI 再次詢問並附上熱水器操作說明', by: 'AI' },
        { at: '2026-09-20 10:20', text: '48 小時未回覆，依升級規則通知租務管理員 陳○○', by: '系統' },
        { at: '2026-09-21 09:05', text: 'AI 判斷：可能是熱水器或水壓問題，無法確定派工類別，交由人工判斷', by: 'AI' }
      ];
      o.timeline = t; return;
    }
    t.push({ at: day + ' 09:22', text: 'AI 判斷類別：' + o.category + (v ? '，建議廠商 ' + v.name + '（同區、平均 ' + v.avgDays + ' 天完工）' : ''), by: 'AI' });
    if (o.status !== '待派工') t.push({ at: day + ' 10:05', text: '派工給 ' + v.name, by: '陳○○' });
    if (o.quote != null) {
      var anomaly = o.marketAvg && o.quote > o.marketAvg * 1.5;
      t.push({ at: (o.quotedAt || (day + ' 14:30')), text: '廠商回報報價 ' + o.quote.toLocaleString() + ' 元' + (o.marketAvg ? '（同項目平均 ' + o.marketAvg.toLocaleString() + ' 元）' : ''), by: v.name });
      if (anomaly) t.push({ at: o.quotedAt || (day + ' 14:31'), text: '系統標記價格異常：高於同項目平均 ' + Math.round((o.quote / o.marketAvg - 1) * 100) + '%，待人工核准', by: '系統' });
    }
    if (['施工中', '待付款', '完成'].indexOf(o.status) >= 0) {
      o.approvedBy = o.approvedBy || 'S02';
      t.push({ at: day + ' 15:10', text: '核准報價 ' + o.quote.toLocaleString() + ' 元', by: DB.staff.filter(function (s) { return s.id === o.approvedBy; })[0].name });
    }
    if (o.completedAt) {
      t.push({ at: o.completedAt + ' 16:40', text: '完工，上傳完工照片 2 張', by: v.name });
      o.photos = ['../assets/photo-repair.svg', '../assets/photo-receipt.svg'];
    }
    if (o.status === '完成' && o.paid) t.push({ at: addDays(o.completedAt, 1) + ' 11:00', text: '發票 ' + o.invoice + ' 入帳，已付款', by: '黃○○' });
    else if (o.status === '待付款') t.push({ at: addDays(o.completedAt, 1) + ' 11:00', text: '發票 ' + o.invoice + ' 已上傳，待會計付款', by: v.name });
    o.timeline = t;
  }
  DB.workOrders.forEach(buildTimeline);
  DB.workOrder = function (id) { return byId(DB.workOrders, id); };
  /* 某物件某月已認列的修繕成本（完成或待付款的工單，以完工月份認列） */
  function repairInMonth(unitId, month) {
    return sum(DB.workOrders.filter(function (w) {
      return w.unitId === unitId && w.completedAt && monthOf(w.completedAt) === month && (w.status === '完成' || w.status === '待付款');
    }), function (w) { return w.quote; });
  }

  /* ============================================================
   * 4. 103 間物件：迴圈產生一般物件，再覆寫特殊案例
   * ============================================================ */
  var BUILDINGS = [
    { code: 'A', region: '中壢', count: 20, perFloor: 5 },
    { code: 'B', region: '中壢', count: 20, perFloor: 5 },
    { code: 'C', region: '內壢', count: 25, perFloor: 5 },
    { code: 'D', region: '平鎮', count: 20, perFloor: 5 },
    { code: 'E', region: '中原', count: 18, perFloor: 6 }
  ];
  var TYPE_CYCLE = ['一房一廳', '套房', '套房', '雅房', '套房'];
  var RENT_BASE = {
    '中壢': { '雅房': 5500, '套房': 7000, '一房一廳': 10500 },
    '內壢': { '雅房': 5500, '套房': 7000, '一房一廳': 10500 },
    '平鎮': { '雅房': 5500, '套房': 7000, '一房一廳': 10000 },
    '中原': { '雅房': 5500, '套房': 6500, '一房一廳': 9500 }
  };
  var PING = { '雅房': [4, 5], '套房': [6, 8], '一房一廳': [10, 13] };
  var SETUP_COST = { '雅房': 30000, '套房': 48000, '一房一廳': 72000 };   /* 裝修家具投入，60 個月攤提 */
  /* 付屋主租金占租客租金的比例：包租代管實務上屋主拿 6～8 成（換取保證收租、不必自己管），
     這裡用 58%～66%，讓每間房的毛利與淨利落在業界合理區間，不會出現「屋主只拿四成」這種沒人會簽的數字。 */
  var OWNER_RATIO = { '雅房': [0.62, 0.66], '套房': [0.60, 0.65], '一房一廳': [0.58, 0.63] };
  var UPSTREAM_TEXT = {
    adjustClause: '續約時得依市場行情調整，幅度以 5% 為上限',
    repairResp: '結構與管線由屋主負責，其餘由公司負責',
    taxBy: '屋主', mgmtFeeBy: '公司', utilitiesBy: '租客',
    earlyTermination: '任一方提前 3 個月書面通知，違約金 1 個月租金'
  };

  DB.units = [];
  DB.owners = [];
  var ownerLeft = 0, ownerIdx = 0;
  BUILDINGS.forEach(function (b) {
    for (var i = 1; i <= b.count; i++) {
      var type = TYPE_CYCLE[(i - 1) % 5];
      var rent = RENT_BASE[b.region][type] + pick([-500, 0, 0, 0, 500]);
      var cost = {
        internet: type === '雅房' ? 200 : 300,
        mgmtFee: (b.region === '平鎮' || b.region === '中原') ? 250 : 200,
        utilityDiff: type === '雅房' ? between(1, 2) * 100 : between(1, 4) * 100,
        depreciation: SETUP_COST[type] / 60
      };
      var ratioRange = OWNER_RATIO[type];
      var ownerRatio = ratioRange[0] + rnd() * (ratioRange[1] - ratioRange[0]);
      var moveIn = addMonths('2024-01-01', between(0, 29));            /* 2024-01 ～ 2026-06 入住 */
      moveIn = moveIn.slice(0, 8) + pad2(pick([1, 1, 5, 10, 15]));
      var term = pick([12, 12, 24]);
      var contractEnd = addDays(addMonths(moveIn, term), -1);
      var renewals = 0;
      while (contractEnd < TODAY) { contractEnd = addMonths(contractEnd, 12); renewals++; }
      var upStart = addMonths(moveIn.slice(0, 8) + '01', -between(1, 6));
      var upEnd = addDays(addMonths(upStart, pick([36, 36, 60])), -1);
      while (upEnd < addMonths(contractEnd, 1)) upEnd = addMonths(upEnd, 12);   /* 一般物件：上游一定晚於下游到期 */
      var ownerRent = roundTo(rent * ownerRatio, 100);

      /* 屋主：一位屋主擁有連續 2～4 間（整層分租），約 35 位 */
      if (ownerLeft === 0) {
        if (DB.owners.length < 35) {
          ownerIdx = DB.owners.length + 1;
          DB.owners.push({ id: 'O' + pad2(ownerIdx), name: fakeName(ownerIdx * 5 + 2), phone: fakePhone(ownerIdx + 40), bank: fakeBank(ownerIdx), unitIds: [] });
          ownerLeft = pick([2, 3, 3, 4]);
        } else { ownerIdx = (ownerIdx % 35) + 1; ownerLeft = 1; }
      }
      ownerLeft--;
      var owner = DB.owners[ownerIdx - 1];
      var id = b.code + pad2(i);
      owner.unitIds.push(id);

      DB.units.push({
        id: id, building: b.code, region: b.region, floor: 2 + Math.floor((i - 1) / b.perFloor), type: type,
        ping: between(PING[type][0], PING[type][1]), status: 'rented', funnelStage: null,
        tenantId: null, ownerId: owner.id, rent: rent, ownerRent: ownerRent, cost: cost, setupCost: SETUP_COST[type],
        moveIn: moveIn, contractEnd: contractEnd, renewals: renewals, noticeAt: null, vacantSince: null, vacancyCost: 0,
        upstream: assign({ start: upStart, end: upEnd, payDay: pick([5, 5, 10]), deposit: ownerRent * 2, renewNoticeDate: addDays(upEnd, -60) }, UPSTREAM_TEXT),
        downstream: { start: moveIn, end: contractEnd, deposit: rent * 2 },
        keys: { key: 2, card: b.code === 'B' || b.code === 'D' ? 2 : 1, remote: type === '一房一廳' && (b.code === 'D' || b.code === 'A') ? 1 : 0, mailbox: 1 },
        baseline: { water: between(6, 10), elec: type === '一房一廳' ? between(160, 220) : type === '雅房' ? between(70, 110) : between(110, 170) },
        special: false, notes: []
      });
    }
  });

  /* ============================================================
   * 5. 特殊案例覆寫（故事數字的來源，DESIGN.md §5）
   * ============================================================ */
  function U(id) { return byId(DB.units, id); }

  /* 5.1 上游先到期、租客還在住 → f01 風險警示（3 間） */
  [
    { id: 'A03', upEnd: '2026-11-30', downEnd: '2027-06-30' },
    { id: 'B07', upEnd: '2026-12-31', downEnd: '2027-08-31' },
    { id: 'C12', upEnd: '2027-01-15', downEnd: '2027-09-30' }
  ].forEach(function (s) {
    var u = U(s.id);
    u.upstream.end = s.upEnd;
    u.upstream.renewNoticeDate = addDays(s.upEnd, -60);
    u.contractEnd = s.downEnd;
    u.downstream.end = s.downEnd;
    u.special = true;
    u.notes.push('上游租約早於下游到期');
  });

  /* 5.2 A01：導覽與 LINE 示範的主角房 */
  (function () {
    var u = U('A01');
    u.rent = 13000; u.type = '一房一廳'; u.ping = 12;
    u.contractEnd = '2027-03-31'; u.downstream.end = '2027-03-31';
    u.downstream.deposit = 26000;
    u.ownerRent = 13000 - (u.cost.internet + u.cost.mgmtFee + u.cost.utilityDiff + u.cost.depreciation) - 2900;
    u.upstream.end = '2028-06-30'; u.upstream.renewNoticeDate = '2028-05-01';
    u.special = true;
  })();

  /* 5.3 空房與即將空房（f03 漏斗、f05 整備） */
  var FUNNEL = [
    { id: 'A12', status: 'listing', stage: '招租中', vacantSince: '2026-08-31', note: '空置 21 天，已調整租金建議' },
    { id: 'C08', status: 'listing', stage: '招租中', vacantSince: '2026-08-19', note: '空置 33 天，價格可能偏高' },
    { id: 'D15', status: 'listing', stage: '帶看預約', vacantSince: '2026-09-11', note: '空置 10 天，已有 2 組帶看' },
    { id: 'C20', status: 'prep', stage: '整備中', vacantSince: '2026-09-10', note: '油漆施工中，清潔待排' },
    { id: 'B15', status: 'leaving', stage: '即將空房', noticeAt: '2026-09-14', moveOut: '2026-10-14', note: '租客已通知不續租' },
    { id: 'E03', status: 'leaving', stage: '即將空房', noticeAt: '2026-09-18', moveOut: '2026-10-31', note: '租客已通知不續租' }
  ];
  FUNNEL.forEach(function (s) {
    var u = U(s.id);
    u.status = s.status; u.funnelStage = s.stage; u.special = true;
    u.vacantSince = s.vacantSince || null;
    u.noticeAt = s.noticeAt || null;
    u.moveOut = s.moveOut || null;
    u.vacantDays = s.vacantSince ? daysBetween(s.vacantSince, TODAY) : 0;
    u.notes.push(s.note);
  });
  /* 上個月已完成的退租整備（讓平均空置天數有歷史可算） */
  var PAST_VACANCY = [{ id: 'A20', days: 9 }, { id: 'B09', days: 12 }, { id: 'C14', days: 6 }, { id: 'D11', days: 16 }, { id: 'E08', days: 11 }];
  PAST_VACANCY.forEach(function (p) { U(p.id).pastVacantDays = p.days; });

  /* 5.4 本月虧損的 5 間（f02 排行） */
  var LOSS_UNITS = {
    B07: { extraCost: 0, reason: '冷氣壓縮機更換 9,500 元' },
    B11: { extraCost: 1200, reason: '熱水器檢修加欠租利息損失' },
    C05: { extraCost: 2600, reason: '排水管阻塞二次施工' },
    D02: { extraCost: 1800, reason: '壁癌補漆與燈具更換' },
    D09: { extraCost: 3400, reason: '門鎖更換加室內小修' }
  };
  /* 本月最賺的 5 間（f02 排行）：調高淨利 */
  var TOP_UNITS = { A01: 3200, A05: 3000, B02: 2900, C01: 2800, D04: 2700 };

  /* ============================================================
   * 6. 租客（已出租的物件各一位）
   * ============================================================ */
  DB.tenants = [];
  var ARREARS = { B11: { days: 12, amount: 7000 }, E07: { days: 5, amount: 6500 } };
  DB.units.forEach(function (u, idx) {
    if (['listing', 'prep'].indexOf(u.status) >= 0) return;   /* 空房、整備中沒有租客 */
    var n = DB.tenants.length + 1;
    var arr = ARREARS[u.id];
    var t = {
      id: 'T' + pad2(n), name: fakeName(n * 3 + 1), unitId: u.id,
      phone: fakePhone(n), idNo: fakeIdNo(n), bank: fakeBank(n + 7),
      moveIn: u.moveIn, contractEnd: u.contractEnd, rent: u.rent, deposit: u.downstream.deposit,
      lineBound: n % 7 !== 0,
      paid: arr ? '逾期' : (n % 11 === 0 ? '未繳' : '已繳'),
      paidAt: arr ? null : (n % 11 === 0 ? null : '2026-09-0' + ((n % 5) + 1)),
      arrearsDays: arr ? arr.days : 0, arrearsAmount: arr ? arr.amount : 0,
      renewals: u.renewals, note: ''
    };
    if (u.status === 'leaving') { t.leaving = true; t.moveOut = u.moveOut; t.note = '已通知不續租'; }
    u.tenantId = t.id;
    DB.tenants.push(t);
  });
  /* A01 王○○：LINE 綁定、本月已繳、導覽主角 */
  (function () {
    var t = byId(DB.tenants, U('A01').tenantId);
    t.name = '王○○'; t.lineBound = true; t.paid = '已繳'; t.paidAt = '2026-09-03';
    t.rent = 13000; t.deposit = 26000; t.contractEnd = '2027-03-31'; t.arrearsDays = 0; t.arrearsAmount = 0;
  })();
  DB.tenant = function (id) { return byId(DB.tenants, id); };
  DB.tenantOf = function (unitId) { var u = U(unitId); return u && u.tenantId ? DB.tenant(u.tenantId) : null; };
  DB.ownerOf = function (unitId) { var u = U(unitId); return u ? byId(DB.owners, u.ownerId) : null; };

  /* ============================================================
   * 7. 每間房每月損益（3 個月）
   *    淨利 = 租金收入 − 付屋主租金 − 水電差額 − 網路 − 管理費 − 修繕 − 家具折舊 − 空置成本
   * ============================================================ */
  DB.units.forEach(function (u) {
    u.monthly = MONTHS.map(function (m) {
      var days = daysInMonth(m);
      var vacantDaysInMonth = 0;
      if (u.vacantSince && monthOf(u.vacantSince) <= m) {
        var from = monthOf(u.vacantSince) === m ? +u.vacantSince.slice(8) : 1;
        var to = (m === CURRENT_MONTH) ? +TODAY.slice(8) : days;
        vacantDaysInMonth = Math.max(0, to - from + 1);
      }
      var occupiedRatio = (days - vacantDaysInMonth) / days;
      var rentIncome = roundTo(u.rent * occupiedRatio, 1);
      var repair = repairInMonth(u.id, m);
      var extra = (m === CURRENT_MONTH && LOSS_UNITS[u.id]) ? LOSS_UNITS[u.id].extraCost : 0;
      var vacancyCost = roundTo(u.rent * (vacantDaysInMonth / days) * 0.15, 1);  /* 招租、清潔、水電基本費等空置期成本 */
      var row = {
        month: m, monthLabel: monthLabel(m),
        rentIncome: rentIncome, ownerRent: u.ownerRent,
        utilityDiff: u.cost.utilityDiff, internet: u.cost.internet, mgmtFee: u.cost.mgmtFee,
        repair: repair + extra, depreciation: Math.round(u.cost.depreciation), vacancyCost: vacancyCost,
        vacantDays: vacantDaysInMonth
      };
      if (m === CURRENT_MONTH && TOP_UNITS[u.id]) {
        row.ownerRent = Math.round(row.rentIncome - row.utilityDiff - row.internet - row.mgmtFee - row.repair - row.depreciation - row.vacancyCost - TOP_UNITS[u.id]);
      }
      row.cost = row.ownerRent + row.utilityDiff + row.internet + row.mgmtFee + row.repair + row.depreciation + row.vacancyCost;
      row.net = Math.round(row.rentIncome - row.cost);
      row.annualReturn = u.setupCost ? +((row.net * 12) / u.setupCost * 100).toFixed(1) : 0;
      return row;
    });
    u.current = u.monthly[u.monthly.length - 1];
    u.lossReason = LOSS_UNITS[u.id] ? LOSS_UNITS[u.id].reason : (u.current.net < 0 && u.vacantSince ? '空置 ' + u.vacantDays + ' 天，仍要付屋主租金' : null);
  });
  DB.pnlOf = function (unitId, month) {
    var u = U(unitId); if (!u) return null;
    return month ? u.monthly.filter(function (r) { return r.month === month; })[0] : u.current;
  };

  /* ============================================================
   * 8. 設備履歷（f06）
   * ============================================================ */
  var EQ_KINDS = [
    { kind: '冷氣', brands: ['日立', '大金', '國際牌', '東元'], models: ['RAS-28', 'FTXM-30', 'CS-K28', 'MS-3218'], life: 10 },
    { kind: '冰箱', brands: ['聲寶', '東元', '禾聯'], models: ['SR-C14', 'R-1091', 'HRE-B1211'], life: 12 },
    { kind: '洗衣機', brands: ['國際牌', '聲寶', 'LG'], models: ['NA-V110', 'ES-B13F', 'WT-D130'], life: 10 },
    { kind: '熱水器', brands: ['林內', '櫻花', '莊頭北'], models: ['RU-1602', 'SH-1220', 'TH-3235'], life: 8 },
    { kind: '電視', brands: ['禾聯', '聲寶', '奇美'], models: ['HD-32', 'EM-32C', 'TL-32'], life: 8 }
  ];
  DB.equipment = [];
  DB.units.forEach(function (u, ui) {
    var kinds = u.type === '雅房' ? ['冷氣', '熱水器'] : (u.type === '套房' ? ['冷氣', '冰箱', '熱水器'] : ['冷氣', '冰箱', '洗衣機', '熱水器', '電視']);
    kinds.forEach(function (k, ki) {
      var meta = EQ_KINDS.filter(function (e) { return e.kind === k; })[0];
      var bi = (ui + ki) % meta.brands.length;
      var purchased = addMonths(u.moveIn, -between(1, 30));
      DB.equipment.push({
        id: 'EQ-' + u.id + '-' + (ki + 1), unitId: u.id, kind: k,
        brand: meta.brands[bi], model: meta.models[bi],
        purchased: purchased, warrantyEnd: addMonths(purchased, 24),
        repairs: [], totalRepairCost: 0, advice: null
      });
    });
  });
  DB.equipmentById = function (id) { return byId(DB.equipment, id); };
  DB.equipmentOf = function (unitId) { return DB.equipment.filter(function (e) { return e.unitId === unitId; }); };

  /* A07 冷氣：5 年內修 4 次、累計 13,000 元 → 建議汰換（故事數字） */
  (function () {
    var eq = DB.equipmentById('EQ-A07-1');
    eq.kind = '冷氣'; eq.brand = '日立'; eq.model = 'RAS-28NK';
    eq.purchased = '2021-05-18'; eq.warrantyEnd = '2023-05-18';
    eq.repairs = [
      { date: '2022-07-03', desc: '不冷，補充冷媒', cost: 2500, vendorId: 'V04', workOrderId: null },
      { date: '2023-08-21', desc: '排水管阻塞滴水，清洗保養', cost: 3200, vendorId: 'V04', workOrderId: null },
      { date: '2025-06-14', desc: '風扇馬達異音更換', cost: 3500, vendorId: 'V05', workOrderId: null },
      { date: '2026-08-14', desc: '壓縮機啟動電容更換', cost: 3800, vendorId: 'V04', workOrderId: 'WO-1028' }
    ];
  })();
  /* B07 冷氣：剛換過壓縮機 */
  (function () {
    var eq = DB.equipmentById('EQ-B07-1');
    eq.brand = '東元'; eq.model = 'MS-3218'; eq.purchased = '2019-04-10'; eq.warrantyEnd = '2021-04-10';
    eq.repairs = [{ date: '2026-09-10', desc: '壓縮機故障更換', cost: 9500, vendorId: 'V04', workOrderId: 'WO-1038' }];
  })();
  /* 其餘設備：依工單回填維修紀錄 */
  DB.workOrders.forEach(function (w) {
    if (!w.equipmentId || !w.completedAt) return;
    var eq = DB.equipmentById(w.equipmentId);
    if (!eq) return;
    if (!eq.repairs.some(function (r) { return r.workOrderId === w.id; })) {
      eq.repairs.push({ date: w.completedAt, desc: w.title, cost: w.quote, vendorId: w.vendorId, workOrderId: w.id });
    }
  });
  /* 累計維修費與汰換建議：5 年內修 3 次以上或累計超過購入價五成 → 建議汰換 */
  DB.equipment.forEach(function (e) {
    e.repairs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    e.totalRepairCost = sum(e.repairs, function (r) { return r.cost; });
    e.inWarranty = e.warrantyEnd >= TODAY;
    e.warrantyExpiringSoon = !e.inWarranty ? false : daysBetween(TODAY, e.warrantyEnd) <= 30;
    var recent = e.repairs.filter(function (r) { return daysBetween(r.date, TODAY) <= 365 * 5; });
    if (recent.length >= 4 || e.totalRepairCost >= 12000) {
      e.advice = { level: 'replace', text: '5 年內維修 ' + recent.length + ' 次、累計 ' + e.totalRepairCost.toLocaleString() + ' 元，建議汰換而非再修', suggestCost: e.kind === '冷氣' ? 22000 : 15000 };
    } else if (recent.length >= 2) {
      e.advice = { level: 'watch', text: '近期維修 ' + recent.length + ' 次，留意後續狀況', suggestCost: null };
    }
  });

  /* ============================================================
   * 9. 水電用量（近 12 個月）與異常偵測（f08）
   * ============================================================ */
  var U_MONTHS = [];
  (function () { for (var i = 11; i >= 0; i--) U_MONTHS.push(addMonths(CURRENT_MONTH + '-01', -i).slice(0, 7)); })();
  DB.utilityMonths = U_MONTHS;
  DB.utilities = [];
  DB.units.forEach(function (u) {
    var rows = U_MONTHS.map(function (m) {
      return { month: m, water: Math.max(1, u.baseline.water + between(-2, 2)), elec: Math.max(10, u.baseline.elec + between(-25, 30)) };
    });
    DB.utilities.push({ unitId: u.id, baseline: u.baseline, rows: rows });
  });
  DB.utilityOf = function (unitId) { return DB.utilities.filter(function (r) { return r.unitId === unitId; })[0]; };
  /* B04：本月水量 8 → 25 度（疑似漏水）；C08：空房卻持續用電 */
  (function () {
    var b4 = DB.utilityOf('B04');
    b4.baseline.water = 8;
    b4.rows.forEach(function (r, i) { r.water = i === b4.rows.length - 1 ? 25 : 8 + between(-1, 1); });
    var c8 = DB.utilityOf('C08');
    c8.rows[c8.rows.length - 1].elec = 92;
    c8.rows[c8.rows.length - 2].elec = 88;
  })();
  /* 異常規則：用量超過基準 2 倍 → 疑似漏水；空房仍大量用電 → 提醒 */
  DB.utilityAnomalies = [];
  DB.utilities.forEach(function (r) {
    var last = r.rows[r.rows.length - 1];
    var u = U(r.unitId);
    if (last.water >= r.baseline.water * 2) {
      DB.utilityAnomalies.push({
        unitId: r.unitId, kind: 'water', level: 'danger', month: last.month,
        value: last.water, baseline: r.baseline.water,
        title: '疑似漏水', desc: '本月用水 ' + last.water + ' 度，過往平均 ' + r.baseline.water + ' 度，超過兩倍',
        action: '建議派水電廠商檢查管線與馬桶止水'
      });
    }
    if (['listing', 'prep'].indexOf(u.status) >= 0 && last.elec >= 50) {
      DB.utilityAnomalies.push({
        unitId: r.unitId, kind: 'elec', level: 'warn', month: last.month,
        value: last.elec, baseline: r.baseline.elec,
        title: '空房仍在用電', desc: '本月用電 ' + last.elec + ' 度，但此房目前無人居住',
        action: '確認冷氣、冰箱或熱水器是否未關，或有人未經同意使用'
      });
    }
  });

  /* ============================================================
   * 10. 押金（f04）與鑰匙門禁（f09）
   * ============================================================ */
  DB.deposits = [];
  DB.units.forEach(function (u) {
    if (!u.tenantId) return;
    var t = DB.tenant(u.tenantId);
    DB.deposits.push({
      unitId: u.id, tenantId: t.id, tenantName: t.name, amount: t.deposit,
      receivedAt: u.moveIn, status: '持有中', deductions: [], refundAt: null, refundAmount: null, proof: null, daysSinceMoveOut: 0
    });
  });
  DB.depositOf = function (unitId) { return DB.deposits.filter(function (d) { return d.unitId === unitId; })[0]; };
  /* D11：退租 45 天仍未結算（逾期）；B15：結算中；A20：已退還（歷史） */
  (function () {
    var d11 = U('D11');
    DB.deposits.push({
      unitId: 'D11', tenantId: 'X01', tenantName: '林○○', amount: 14000,
      receivedAt: '2024-03-05', status: '逾期未結算', moveOutAt: addDays(TODAY, -45),
      daysSinceMoveOut: 45,
      deductions: [
        { item: '清潔費', amount: 2500, basis: '退租清潔工單 WO-1012' },
        { item: '牆面補漆', amount: 1500, basis: '點交照片 2026-08-08' }
      ],
      refundAt: null, refundAmount: null, proof: null,
      alert: '退租已滿 45 天仍未完成押金結算，請儘速處理以免產生爭議'
    });
    d11.notes.push('前租客押金尚未結算');

    var b15 = DB.depositOf('B15');
    b15.status = '結算中';
    b15.moveOutAt = '2026-10-14';
    b15.deductions = [
      { item: '欠繳水電費', amount: 860, basis: '9 月水電帳單' },
      { item: '磁扣遺失 1 張', amount: 300, basis: '點交清點 2026-10-14' }
    ];

    DB.deposits.push({
      unitId: 'A20', tenantId: 'X02', tenantName: '周○○', amount: 14000,
      receivedAt: '2023-09-01', status: '已退還', moveOutAt: '2026-08-05', daysSinceMoveOut: 47,
      deductions: [{ item: '退租清潔', amount: 2500, basis: '清潔工單 WO-1008' }],
      refundAt: '2026-08-19', refundAmount: 11500, proof: '../assets/photo-receipt.svg'
    });
  })();
  DB.deposits.forEach(function (d) {
    d.deductTotal = sum(d.deductions, function (x) { return x.amount; });
    if (d.refundAmount == null) d.expectedRefund = d.amount - d.deductTotal;
  });

  DB.keyItems = [
    { key: 'key', name: '鑰匙' }, { key: 'card', name: '門禁磁扣' },
    { key: 'remote', name: '車庫遙控器' }, { key: 'mailbox', name: '信箱鑰匙' }
  ];
  DB.keyPrices = { key: 150, card: 300, remote: 800, mailbox: 150 };
  DB.keysLog = [];
  DB.units.forEach(function (u) {
    if (!u.tenantId) return;
    var t = DB.tenant(u.tenantId);
    DB.keyItems.forEach(function (k) {
      var qty = u.keys[k.key];
      if (!qty) return;
      DB.keysLog.push({ unitId: u.id, tenantId: t.id, item: k.name, itemKey: k.key, action: '領用', qty: qty, at: u.moveIn, by: '陳○○', signed: true });
    });
  });
  /* B15 退租點交：鑰匙少一把、磁扣少一張 → 自動列入押金扣款 */
  DB.keyShortages = [
    { unitId: 'B15', itemKey: 'card', item: '門禁磁扣', issued: 2, returned: 1, missing: 1, price: 300, at: '2026-10-14', linkedDeposit: true }
  ];
  DB.keysOf = function (unitId) { return DB.keysLog.filter(function (r) { return r.unitId === unitId; }); };
  DB.keySummary = function (unitId) {
    var u = U(unitId); if (!u) return [];
    return DB.keyItems.map(function (k) {
      var short = DB.keyShortages.filter(function (s) { return s.unitId === unitId && s.itemKey === k.key; })[0];
      return { item: k.name, itemKey: k.key, total: u.keys[k.key], issued: u.tenantId ? u.keys[k.key] : 0, returned: short ? short.returned : 0, missing: short ? short.missing : 0, price: DB.keyPrices[k.key] };
    }).filter(function (r) { return r.total > 0; });
  };
  DB.smartLockFlow = [
    { step: '簽約完成', text: '系統產生入住密碼並於入住前一天以 LINE 傳給租客' },
    { step: '入住期間', text: '密碼僅在租期內有效，訪客密碼可另設時效' },
    { step: '退租當日', text: '密碼自動失效，不必回收鑰匙、不必換鎖' },
    { step: '重新招租', text: '帶看用臨時密碼，看完自動失效' }
  ];

  /* ============================================================
   * 11. 重大事件（f12）
   * ============================================================ */
  DB.incidentTypes = ['漏水至樓下', '鄰居噪音', '警察到場', '租客失聯', '寵物違規', '室內吸菸', '非法使用', '公安事件'];
  DB.incidents = [
    {
      id: 'INC-07', unitId: 'B04', relatedUnitId: 'B03', level: '緊急', type: '漏水至樓下',
      status: '處理中', assigneeId: 'S02', createdAt: '2026-09-16 08:12',
      title: 'B04 浴室漏水，波及樓下 B03 天花板',
      summary: '樓下住戶回報天花板滴水並有壁癌擴散，已關閉 B04 進水總開關並派水電檢查。',
      workOrderId: 'WO-1046',
      photos: ['../assets/photo-leak.svg', '../assets/photo-ceiling.svg', '../assets/photo-repair.svg'],
      chat: [
        { at: '2026-09-16 08:12', who: 'B03 租客', text: '我家天花板一直滴水，牆壁也開始變色了' },
        { at: '2026-09-16 08:20', who: '陳○○', text: '已收到，馬上請師傅過去，今天會先止水' },
        { at: '2026-09-16 12:40', who: 'B04 租客', text: '剛剛師傅來看過，說是浴室防水層的問題' },
        { at: '2026-09-18 17:05', who: '陳○○', text: 'B03 天花板下週一油漆修復，這段期間造成的不便我們會補償' }
      ],
      timeline: [
        { at: '2026-09-16 08:12', text: 'B03 租客 LINE 通報天花板滴水，AI 判定為重大事件並立即通知值班人員', by: 'AI' },
        { at: '2026-09-16 08:20', text: '事件等級設為「緊急」，指派租務管理員 陳○○', by: '系統' },
        { at: '2026-09-16 09:05', text: '電話聯繫 B04 租客，請其暫停使用浴室並關閉進水開關', by: '陳○○' },
        { at: '2026-09-16 11:30', text: '大同水電行到場勘查，確認為浴室防水層破損，開立工單 WO-1046', by: '大同水電行' },
        { at: '2026-09-17 14:00', text: '核准修繕報價 4,500 元，同步通知 B03 租客修復時程', by: '陳○○' },
        { at: '2026-09-18 16:40', text: '防水層重做完成，觀察 3 天確認無滲水', by: '大同水電行' },
        { at: '2026-09-21 09:00', text: 'B03 天花板油漆修復排程 9 月 24 日，事件待結案', by: '陳○○' }
      ]
    },
    {
      id: 'INC-05', unitId: 'C11', level: '重大', type: '鄰居噪音', status: '處理中', assigneeId: 'S03',
      createdAt: '2026-09-11 23:40', title: 'C11 深夜音量過大，鄰居連續三日投訴',
      summary: '同層住戶反映深夜播放音樂，已發出第二次書面提醒。',
      workOrderId: null, photos: [],
      chat: [
        { at: '2026-09-12 09:10', who: 'C12 租客', text: '連續三天半夜都有很大聲的音樂，沒辦法睡' },
        { at: '2026-09-12 09:35', who: '劉○○', text: '已了解，我們今天會聯繫該住戶並發出提醒' }
      ],
      timeline: [
        { at: '2026-09-11 23:40', text: '鄰居 LINE 投訴深夜噪音', by: '租客' },
        { at: '2026-09-12 09:35', text: '電話聯繫 C11 租客，說明住戶規約', by: '劉○○' },
        { at: '2026-09-14 10:00', text: '第二次書面提醒，副本留存', by: '劉○○' },
        { at: '2026-09-19 21:30', text: '再次接獲投訴，擬安排三方協調', by: '系統' }
      ]
    },
    {
      id: 'INC-04', unitId: 'E07', level: '重大', type: '租客失聯', status: '處理中', assigneeId: 'S02',
      createdAt: '2026-09-09 10:00', title: 'E07 欠租且電話未接、LINE 未讀',
      summary: '欠租 5 天，多次聯繫未果，已寄出存證信函前置通知。',
      workOrderId: null, photos: [],
      chat: [],
      timeline: [
        { at: '2026-09-09 10:00', text: '系統偵測欠租且 3 次通知未讀，建立事件', by: '系統' },
        { at: '2026-09-11 14:20', text: '電話 3 通未接，改以簡訊與 LINE 併發', by: '陳○○' },
        { at: '2026-09-16 09:00', text: '聯繫緊急聯絡人，確認人身安全無虞', by: '陳○○' },
        { at: '2026-09-19 16:00', text: '寄出催繳通知並留存寄送證明', by: '黃○○' }
      ]
    },
    {
      id: 'INC-02', unitId: 'D06', level: '一般', type: '寵物違規', status: '已結案', assigneeId: 'S03',
      createdAt: '2026-08-20 19:00', title: 'D06 未申報飼養寵物', summary: '住戶協調後已辦理寵物申報並補繳清潔押金。',
      workOrderId: null, photos: [], chat: [],
      timeline: [
        { at: '2026-08-20 19:00', text: '同層住戶反映走道有犬吠聲', by: '租客' },
        { at: '2026-08-21 11:00', text: '現場確認並說明寵物條款', by: '劉○○' },
        { at: '2026-08-25 15:30', text: '住戶完成寵物申報、補繳清潔押金 3,000 元，結案', by: '劉○○' }
      ]
    }
  ];
  DB.incident = function (id) { return byId(DB.incidents, id); };

  /* ============================================================
   * 12. 通知與證據留存（f13）、升級規則（f19）
   * ============================================================ */
  DB.notifications = [
    { id: 'N-2031', type: '催租', tenantId: DB.units.filter(function(u){return u.id==='B11';})[0].tenantId, unitId: 'B11',
      sentAt: '2026-09-11 09:00', channel: 'LINE', content: '提醒您 9 月租金 7,000 元已於 9 月 5 日到期，請於 3 日內完成繳納。',
      delivered: true, deliveredAt: '2026-09-11 09:00', readAt: '2026-09-11 12:31', repliedAt: '2026-09-11 12:35', reply: '這個月手頭比較緊，可以下週一繳嗎？' },
    { id: 'N-2032', type: '催租', tenantId: DB.units.filter(function(u){return u.id==='B11';})[0].tenantId, unitId: 'B11',
      sentAt: '2026-09-16 09:00', channel: 'LINE', content: '9 月租金尚有 7,000 元未繳，已逾期 11 天，請儘速處理。',
      delivered: true, deliveredAt: '2026-09-16 09:00', readAt: '2026-09-16 21:04', repliedAt: null, reply: null },
    { id: 'N-2033', type: '催租', tenantId: DB.units.filter(function(u){return u.id==='E07';})[0].tenantId, unitId: 'E07',
      sentAt: '2026-09-19 09:00', channel: 'LINE＋簡訊', content: '9 月租金 6,500 元已逾期 5 天，請儘速聯繫我們。',
      delivered: true, deliveredAt: '2026-09-19 09:00', readAt: null, repliedAt: null, reply: null },
    { id: 'N-2028', type: '續約', tenantId: DB.units.filter(function(u){return u.id==='A01';})[0].tenantId, unitId: 'A01',
      sentAt: '2026-09-02 10:00', channel: 'LINE', content: '您的租約將於 2027 年 3 月 31 日到期，是否有續租意願？',
      delivered: true, deliveredAt: '2026-09-02 10:00', readAt: '2026-09-02 10:12', repliedAt: '2026-09-02 10:15', reply: '有，想續租一年' },
    { id: 'N-2029', type: '退租', tenantId: DB.units.filter(function(u){return u.id==='B15';})[0].tenantId, unitId: 'B15',
      sentAt: '2026-09-14 16:20', channel: 'LINE', content: '已收到您的退租通知，點交時間預定 10 月 14 日下午 2 點，屆時請準備鑰匙與磁扣。',
      delivered: true, deliveredAt: '2026-09-14 16:20', readAt: '2026-09-14 18:02', repliedAt: '2026-09-14 18:05', reply: '好的，謝謝' },
    { id: 'N-2030', type: '點交', tenantId: DB.units.filter(function(u){return u.id==='E03';})[0].tenantId, unitId: 'E03',
      sentAt: '2026-09-18 11:30', channel: 'LINE', content: '已收到退租通知，點交時間預定 10 月 31 日上午 10 點。',
      delivered: true, deliveredAt: '2026-09-18 11:30', readAt: '2026-09-18 11:45', repliedAt: null, reply: null },
    { id: 'N-2027', type: '公告', tenantId: null, unitId: null, building: 'B',
      sentAt: '2026-09-16 08:30', channel: 'LINE 群發', content: 'B 棟今日下午 1 至 4 點因 4 樓漏水檢修暫停供水，造成不便敬請見諒。',
      delivered: true, deliveredAt: '2026-09-16 08:30', readAt: null, repliedAt: null, reply: null, recipients: 20 }
  ];
  DB.photos = [
    { id: 'P-301', unitId: 'B04', date: '2026-09-16', by: 'tenant', tag: '漏水通報', src: '../assets/photo-leak.svg', note: 'B03 租客上傳的天花板滴水照片' },
    { id: 'P-302', unitId: 'B03', date: '2026-09-16', by: 'company', tag: '現場勘查', src: '../assets/photo-ceiling.svg', note: '管理員到場拍攝的壁癌範圍' },
    { id: 'P-303', unitId: 'B04', date: '2026-09-18', by: 'company', tag: '完工照片', src: '../assets/photo-repair.svg', note: '防水層重做完成' },
    { id: 'P-304', unitId: 'C20', date: '2026-09-10', by: 'company', tag: '退租點交', src: '../assets/photo-handover.svg', note: '點交當日電表與室內狀況' },
    { id: 'P-305', unitId: 'C20', date: '2026-09-10', by: 'company', tag: '退租點交', src: '../assets/photo-meter.svg', note: '電表讀數 8,421 度' },
    { id: 'P-306', unitId: 'D15', date: '2026-09-12', by: 'company', tag: '招租照片', src: '../assets/photo-room.svg', note: '整備完成後重新拍攝' },
    { id: 'P-307', unitId: 'A12', date: '2026-09-01', by: 'company', tag: '招租照片', src: '../assets/photo-room.svg', note: '刊登用主圖' },
    { id: 'P-308', unitId: 'B15', date: '2026-09-14', by: 'tenant', tag: '退租通知', src: '../assets/photo-room.svg', note: '租客拍攝的現況' },
    { id: 'P-309', unitId: 'A11', date: '2026-07-10', by: 'company', tag: '完工照片', src: '../assets/photo-repair.svg', note: '熱水器更換完成' },
    { id: 'P-310', unitId: 'D11', date: '2026-08-08', by: 'company', tag: '退租點交', src: '../assets/photo-handover.svg', note: '牆面狀況，作為押金扣款依據' }
  ];
  DB.photosOf = function (unitId) { return DB.photos.filter(function (p) { return p.unitId === unitId; }); };

  DB.escalationRules = [
    { event: '一般修繕報修', levels: [
      { after: '立即', action: 'AI 依描述判斷類別並詢問細節', to: '租客' },
      { after: '24 小時未回覆', action: 'AI 再次詢問並附操作說明', to: '租客' },
      { after: '48 小時未回覆', action: '轉交租務管理員人工處理', to: '租務管理員' } ] },
    { event: '欠租', levels: [
      { after: '到期後 3 天', action: 'AI 發送第一次繳款提醒', to: '租客' },
      { after: '到期後 7 天', action: '第二次提醒並副本通知管理員', to: '租客、租務管理員' },
      { after: '到期後 14 天', action: '建立事件、寄發書面催繳並留存證明', to: '會計、租務管理員' } ] },
    { event: '重大漏水', levels: [
      { after: '立即', action: '建立緊急事件並電話加 LINE 通知值班人員', to: '值班人員' },
      { after: '30 分鐘未回應', action: '通知租務主管', to: '租務管理員' },
      { after: '2 小時未到場', action: '通知老闆', to: '老闆' } ] },
    { event: '退租整備逾期', levels: [
      { after: '整備開始後 7 天', action: '提醒負責管理員', to: '租務管理員' },
      { after: '14 天', action: '列入工作中心待處理', to: '租務管理員、老闆' } ] }
  ];
  DB.escalationCase = {
    workOrderId: 'WO-1051', unitId: 'C03', title: '熱水器忽冷忽熱',
    currentLevel: 3, nextAt: '2026-09-21 10:20', nextAction: '管理員今日內未處理，將列入老闆工作中心',
    steps: [
      { at: '2026-09-18 10:12', level: 1, by: 'AI', text: '租客報修，AI 詢問細節', state: 'done' },
      { at: '2026-09-19 10:15', level: 2, by: 'AI', text: '24 小時未回覆，AI 再問一次並附說明', state: 'done' },
      { at: '2026-09-20 10:20', level: 3, by: '系統', text: '48 小時未回覆，升級租務管理員 陳○○', state: 'done' },
      { at: '2026-09-21 10:20', level: 4, by: '系統', text: '今日內未處理將通知老闆', state: 'pending' }
    ]
  };

  /* ============================================================
   * 13. 知識庫（f11）與 LINE 選單（f10）
   * ============================================================ */
  var KB_TOPICS = [
    { topic: '垃圾', q: '垃圾怎麼丟？', a: function (b) { return b.name + ' 的垃圾車時間是 ' + b.garbageDays + '。請使用專用垃圾袋，資源回收請分類放在 1 樓回收區。'; } },
    { topic: '停車', q: '可以停車嗎？', a: function (b) { return b.parkingRule + '。如需汽車月租車位，請告知我們協助安排。'; } },
    { topic: '網路', q: '網路壞了怎麼辦？', a: function (b) { return b.wifi + '。若無法連線，請先重開分享器電源 30 秒；仍不通請回覆「網路報修」，我們會安排處理。'; } },
    { topic: '熱水器', q: '熱水器怎麼用？', a: function (b) { return b.hotWater + '。水溫不穩多半是水壓或電池沒電，可先更換電池；仍異常請回覆「熱水器報修」。'; } },
    { topic: '磁扣', q: '磁扣怎麼用？遺失怎麼辦？', a: function (b) { return '磁扣請靠近大門感應區 1 至 2 公分感應。遺失請立即告知我們掛失補發，補發費用 300 元，退租時如未歸還將自押金扣除。'; } },
    { topic: '報修', q: '東西壞了怎麼報修？', a: function (b) { return '在選單點「報修」並拍照上傳，我們會在 24 小時內回覆處理時間。緊急狀況（漏水、停電、無法進門）請直接回覆「緊急」，會立即有人聯繫您。'; } },
    { topic: '繳費', q: '租金怎麼繳？', a: function (b) { return '每月 5 日前匯款至指定帳戶，或在選單點「本月帳單」查看金額與帳號。繳完會自動更新為已繳，不需傳收據。'; } },
    { topic: '公共區域', q: '公共區域有什麼規定？', a: function (b) { return '走道與樓梯間請勿堆放私人物品（消防法規）；室內外皆禁菸；晚間 10 點後請降低音量。'; } }
  ];
  DB.kb = [];
  Object.keys(DB.company.buildings).forEach(function (code) {
    var b = DB.company.buildings[code];
    KB_TOPICS.forEach(function (t) {
      DB.kb.push({ building: code, buildingName: b.name, topic: t.topic, q: t.q, a: t.a(b) });
    });
  });
  DB.kbFor = function (building, topic) {
    return DB.kb.filter(function (k) { return k.building === building && (!topic || k.topic === topic); });
  };
  DB.lineMenu = [
    { key: 'bill', name: '本月帳單', icon: 'dollar' },
    { key: 'paid', name: '繳費狀態', icon: 'check' },
    { key: 'lease', name: '租約到期日', icon: 'calendar' },
    { key: 'repair', name: '報修', icon: 'wrench' },
    { key: 'renew', name: '續租', icon: 'refresh' },
    { key: 'moveout', name: '退租', icon: 'external' },
    { key: 'handover', name: '點交時間', icon: 'clock' },
    { key: 'notice', name: '公告', icon: 'bell' },
    { key: 'support', name: '聯絡客服', icon: 'message' }
  ];

  /* ============================================================
   * 14. 操作紀錄（f14）、文件（f17）
   * ============================================================ */
  DB.dataTypes = [
    { key: 'idNo', name: '身分證字號' }, { key: 'bank', name: '銀行帳戶' },
    { key: 'rent', name: '租客租金' }, { key: 'ownerRent', name: '付屋主租金' },
    { key: 'deposit', name: '押金' }, { key: 'phone', name: '聯絡電話' },
    { key: 'repairCost', name: '修繕成本' }, { key: 'pnl', name: '損益與淨利' }
  ];
  DB.auditLog = [
    { at: '2026-09-20 15:02', who: '張○○', role: '老闆', action: '修改租金', unitId: 'A01', field: '租客租金', from: '12,000', to: '13,000', note: '更正前一筆誤植' },
    { at: '2026-09-20 14:36', who: '劉○○', role: '租務管理員', action: '修改租金', unitId: 'A01', field: '租客租金', from: '13,000', to: '12,000', note: '' },
    { at: '2026-09-20 11:42', who: '陳○○', role: '租務管理員', action: '核准報價', unitId: 'B04', field: '修繕金額', from: '—', to: '4,500', note: '工單 WO-1046' },
    { at: '2026-09-19 17:20', who: '黃○○', role: '會計', action: '登錄收款', unitId: 'C01', field: '本月租金', from: '未繳', to: '已繳', note: '' },
    { at: '2026-09-19 10:05', who: '陳○○', role: '租務管理員', action: '新增扣款項', unitId: 'B15', field: '押金扣款', from: '—', to: '300', note: '磁扣遺失 1 張' },
    { at: '2026-09-18 16:12', who: '劉○○', role: '租務管理員', action: '調整租金建議', unitId: 'C08', field: '刊登租金', from: '7,500', to: '7,000', note: '空置超過 30 天' },
    { at: '2026-09-17 09:33', who: '黃○○', role: '會計', action: '匯出報表', unitId: '—', field: '本月帳款', from: '—', to: 'CSV', note: '' },
    { at: '2026-09-16 08:22', who: '系統', role: '系統', action: '建立事件', unitId: 'B04', field: '事件等級', from: '—', to: '緊急', note: 'INC-07' }
  ];
  DB.docTypes = [
    { id: 'lease', name: '租賃契約', fields: ['租客姓名', '身分證字號', '物件地址', '租期', '月租金', '押金', '付款日'] },
    { id: 'renew', name: '續約書', fields: ['租客姓名', '物件地址', '原租期', '新租期', '新月租金', '調整幅度'] },
    { id: 'adjust', name: '租金調整通知', fields: ['租客姓名', '物件地址', '原租金', '新租金', '生效日', '調整依據'] },
    { id: 'dun', name: '催繳通知', fields: ['租客姓名', '物件地址', '欠繳月份', '欠繳金額', '逾期天數', '繳納期限'] },
    { id: 'moveout', name: '退租確認書', fields: ['租客姓名', '物件地址', '退租日', '點交時間', '應退押金'] },
    { id: 'handover', name: '點交表', fields: ['物件地址', '點交日期', '電表度數', '水表度數', '鑰匙數量', '設備清單', '缺損紀錄'] },
    { id: 'deposit', name: '押金結算單', fields: ['租客姓名', '物件地址', '押金金額', '扣除項目', '應退金額', '退款日期'] },
    { id: 'repair', name: '修繕確認書', fields: ['物件地址', '修繕項目', '廠商名稱', '施工日期', '金額', '保固期間'] }
  ];
  DB.docHistory = [
    { id: 'DOC-1182', type: 'renew', typeName: '續約書', unitId: 'A01', tenantName: '王○○', createdAt: '2026-09-02 10:30', by: '陳○○', sentVia: 'LINE', signed: false },
    { id: 'DOC-1180', type: 'moveout', typeName: '退租確認書', unitId: 'B15', tenantName: DB.tenant(U('B15').tenantId).name, createdAt: '2026-09-14 16:10', by: '陳○○', sentVia: 'LINE', signed: true },
    { id: 'DOC-1178', type: 'dun', typeName: '催繳通知', unitId: 'B11', tenantName: DB.tenant(U('B11').tenantId).name, createdAt: '2026-09-16 09:00', by: '黃○○', sentVia: 'LINE', signed: false },
    { id: 'DOC-1175', type: 'deposit', typeName: '押金結算單', unitId: 'A20', tenantName: '周○○', createdAt: '2026-08-19 14:20', by: '黃○○', sentVia: 'Email', signed: true },
    { id: 'DOC-1171', type: 'handover', typeName: '點交表', unitId: 'C20', tenantName: '前租客', createdAt: '2026-09-10 15:00', by: '劉○○', sentVia: '現場簽署', signed: true }
  ];

  /* ============================================================
   * 15. 招租（f03）：租金建議、刊登文案、詢問與帶看
   * ============================================================ */
  DB.funnelStages = ['即將空房', '整備中', '招租中', '帶看預約', '已收訂', '已簽約', '已入住'];
  DB.rentSuggestion = function (unitId) {
    var u = U(unitId); if (!u) return null;
    var peers = DB.units.filter(function (x) { return x.region === u.region && x.type === u.type && x.status === 'rented'; });
    var rents = peers.map(function (x) { return x.rent; }).sort(function (a, b) { return a - b; });
    var low = rents[Math.floor(rents.length * 0.25)] || u.rent;
    var high = rents[Math.floor(rents.length * 0.75)] || u.rent;
    var mid = roundTo((low + high) / 2, 100);
    return { low: low, high: high, suggest: mid, current: u.listRent || u.rent, sample: peers.length };
  };
  U('A12').listRent = 7200;
  U('C08').listRent = 7000;
  U('D15').listRent = 6800;
  DB.leads = [
    { id: 'L-501', unitId: 'A12', name: '周○○', phone: '0918-***-521', from: '591', at: '2026-09-12 20:31', note: '想看週末', status: '已回覆' },
    { id: 'L-502', unitId: 'A12', name: '林○○', phone: '0926-***-118', from: 'LINE 社群', at: '2026-09-16 13:02', note: '詢問可否養貓', status: '已回覆' },
    { id: 'L-503', unitId: 'C08', name: '吳○○', phone: '0933-***-720', from: '591', at: '2026-09-05 09:12', note: '覺得租金偏高', status: '已回覆' },
    { id: 'L-504', unitId: 'D15', name: '許○○', phone: '0955-***-330', from: '591', at: '2026-09-15 18:40', note: '本週想帶看', status: '已預約' },
    { id: 'L-505', unitId: 'D15', name: '鄭○○', phone: '0912-***-905', from: '朋友介紹', at: '2026-09-17 10:05', note: '需要車位', status: '已預約' },
    { id: 'L-506', unitId: 'C08', name: '謝○○', phone: '0972-***-441', from: '591', at: '2026-09-19 21:15', note: '降價後詢問', status: '待回覆' }
  ];
  DB.showings = [
    { id: 'SH-201', unitId: 'D15', leadId: 'L-504', name: '許○○', at: '2026-09-22 19:00', staffId: 'S03', status: '已預約' },
    { id: 'SH-202', unitId: 'D15', leadId: 'L-505', name: '鄭○○', at: '2026-09-23 14:00', staffId: 'S03', status: '已預約' },
    { id: 'SH-203', unitId: 'A12', leadId: 'L-501', name: '周○○', at: '2026-09-14 15:00', staffId: 'S02', status: '已完成', result: '考慮中' },
    { id: 'SH-204', unitId: 'C08', leadId: 'L-503', name: '吳○○', at: '2026-09-07 11:00', staffId: 'S02', status: '已完成', result: '嫌租金高' }
  ];
  DB.listingCopy = function (unitId) {
    var u = U(unitId); if (!u) return '';
    var b = DB.company.buildings[u.building];
    var s = DB.rentSuggestion(unitId);
    return [
      '【' + b.region + '｜' + u.type + '】' + u.ping + ' 坪，含全套家電家具，月租 ' + (u.listRent || s.suggest).toLocaleString() + ' 元',
      '地址：' + b.address + '（' + u.floor + ' 樓）',
      '設備：冷氣、冰箱、熱水器、床組、衣櫃、書桌，網路吃到飽',
      '交通：' + b.parkingRule,
      '生活：' + b.garbageDays,
      '押金兩個月，可短租討論，專人管理、報修 24 小時內回覆。'
    ].join('\n');
  };
  /* 退租整備清單（f05）14 項 */
  DB.prepChecklist = [
    { key: 'meter', name: '電表與水表拍照', hint: '讀數作為結算依據' },
    { key: 'keys', name: '鑰匙與磁扣回收', hint: '短少列入押金扣款' },
    { key: 'furniture', name: '家具設備檢查', hint: '對照入住點交表' },
    { key: 'wall', name: '牆面檢查', hint: '釘孔、污漬、壁癌' },
    { key: 'mattress', name: '床墊檢查', hint: '污漬與塌陷' },
    { key: 'aircon', name: '冷氣檢查與清洗', hint: '濾網、排水' },
    { key: 'bath', name: '衛浴檢查', hint: '排水、矽利康、蓮蓬頭' },
    { key: 'clean', name: '全室清潔', hint: '廠商或自行' },
    { key: 'trash', name: '垃圾與遺留物清運', hint: '大型家具另計' },
    { key: 'bills', name: '水電網路欠費結清', hint: '結算至退租日' },
    { key: 'deposit', name: '押金結算', hint: '扣款項目需有依據' },
    { key: 'paint', name: '是否需要油漆或修繕', hint: '需要時直接開工單' },
    { key: 'photo', name: '重新拍照', hint: '刊登主圖與細部照' },
    { key: 'relist', name: '恢復招租', hint: '完成後才可標記為可出租' }
  ];
  DB.prepState = {
    C20: { done: ['meter', 'keys', 'furniture', 'wall', 'mattress', 'aircon', 'bath', 'trash', 'bills'], workOrders: ['WO-1044', 'WO-1045'], startedAt: '2026-09-10' },
    D15: { done: DB.prepChecklist.map(function (c) { return c.key; }), workOrders: ['WO-1049'], startedAt: '2026-09-11', completedAt: '2026-09-16' }
  };

  /* ============================================================
   * 16. 待辦與員工績效（f18）
   * ============================================================ */
  var TODO_SEED = [
    ['續租通知：A03 上游租約 11/30 到期', 'A03', 'S02', '2026-09-30', '待處理', 'lease', false],
    ['續租通知：B07 上游租約 12/31 到期', 'B07', 'S02', '2026-10-31', '待處理', 'lease', false],
    ['續租通知：C12 上游租約 2027/01/15 到期', 'C12', 'S03', '2026-11-16', '待處理', 'lease', false],
    ['押金結算：D11 退租已 45 天', 'D11', 'S02', '2026-09-05', '待處理', 'deposit', true],
    ['押金結算：B15 點交後結算', 'B15', 'S02', '2026-10-15', '待處理', 'deposit', false],
    ['招租調價：C08 空置 33 天', 'C08', 'S02', '2026-09-12', '進行中', 'vacancy', true],
    ['招租檢視：A12 空置 21 天', 'A12', 'S02', '2026-09-18', '進行中', 'vacancy', true],
    ['帶看：D15 許○○ 9/22 19:00', 'D15', 'S03', '2026-09-22', '待處理', 'showing', false],
    ['帶看：D15 鄭○○ 9/23 14:00', 'D15', 'S03', '2026-09-23', '待處理', 'showing', false],
    ['整備收尾：C20 清潔待排', 'C20', 'S02', '2026-09-24', '進行中', 'prep', false],
    ['工單判斷：WO-1051 熱水器忽冷忽熱', 'C03', 'S02', '2026-09-21', '待處理', 'repair', false],
    ['核准報價：WO-1043 價格異常', 'B02', 'S02', '2026-09-22', '待處理', 'repair', false],
    ['事件追蹤：INC-07 B03 天花板油漆', 'B04', 'S02', '2026-09-24', '進行中', 'incident', false],
    ['事件追蹤：INC-05 噪音三方協調', 'C11', 'S03', '2026-09-25', '待處理', 'incident', false],
    ['催租：B11 逾期 12 天', 'B11', 'S02', '2026-09-23', '待處理', 'arrears', false],
    ['催租：E07 失聯處理', 'E07', 'S02', '2026-09-22', '進行中', 'arrears', false],
    ['帳款核對：A09 金額不符', 'A09', 'S04', '2026-09-22', '待處理', 'billing', false],
    ['退租點交準備：E03 10/31', 'E03', 'S03', '2026-10-30', '待處理', 'moveout', false],
    ['設備汰換評估：A07 冷氣', 'A07', 'S02', '2026-09-26', '待處理', 'equipment', false],
    ['刊登更新：A12 照片重拍', 'A12', 'S02', '2026-09-24', '待處理', 'vacancy', false],
    ['付款：WO-1031 發票已上傳', 'D02', 'S04', '2026-09-19', '待處理', 'payment', true],
    ['付款：WO-1041 發票已上傳', 'E12', 'S04', '2026-09-23', '待處理', 'payment', false],
    ['水電異常追蹤：B04 疑似漏水', 'B04', 'S05', '2026-09-22', '進行中', 'utility', false],
    ['水電異常追蹤：C08 空房用電', 'C08', 'S05', '2026-09-25', '待處理', 'utility', false],
    ['屋主回覆追蹤：A03 續約條件', 'A03', 'S02', '2026-09-26', '待處理', 'lease', false],
    ['點交準備：B15 10/14', 'B15', 'S02', '2026-10-13', '待處理', 'moveout', false],
    ['入住準備：D15 簽約後備品', 'D15', 'S02', '2026-09-28', '待處理', 'prep', false],
    ['設備保固到期檢視：B 棟熱水器', 'B02', 'S02', '2026-09-29', '待處理', 'equipment', false],
    ['知識庫更新：C 棟垃圾車時間異動', 'C01', 'S02', '2026-09-27', '待處理', 'billing', false],
    ['租金行情複查：中壢套房', 'A12', 'S02', '2026-09-30', '待處理', 'vacancy', false]
  ];
  DB.todos = TODO_SEED.map(function (r, i) {
    return {
      id: 'TD-' + pad2(i + 1), title: r[0], unitId: r[1], assigneeId: r[2], due: r[3],
      status: r[4], kind: r[5], overdue: r[6],
      overdueDays: r[6] ? daysBetween(r[3], TODAY) : 0
    };
  });
  DB.todosOf = function (staffId) { return DB.todos.filter(function (t) { return t.assigneeId === staffId && t.status !== '完成'; }); };
  DB.performance = {
    month: CURRENT_MONTH, monthLabel: monthLabel(CURRENT_MONTH),
    totals: { moveIn: 6, moveOut: 4, repair: 14, dunning: 9, showing: 11, renewal: 7 },
    byStaff: [
      { staffId: 'S02', name: '陳○○', role: '租務管理員', moveIn: 3, moveOut: 2, repair: 6, dunning: 5, showing: 4 },
      { staffId: 'S03', name: '劉○○', role: '租務管理員', moveIn: 3, moveOut: 2, repair: 4, dunning: 2, showing: 7 },
      { staffId: 'S04', name: '黃○○', role: '會計', moveIn: 0, moveOut: 0, repair: 0, dunning: 2, showing: 0 },
      { staffId: 'S05', name: '吳○○', role: '修繕人員', moveIn: 0, moveOut: 0, repair: 4, dunning: 0, showing: 0 }
    ]
  };
  /* 手上件數與逾期件數一律由 DB.todos 推導，避免待辦清單與績效表兩處數字打架 */
  DB.performance.byStaff.forEach(function (r) {
    var mine = DB.todos.filter(function (t) { return t.assigneeId === r.staffId && t.status !== '完成'; });
    r.open = mine.length;
    r.overdue = mine.filter(function (t) { return t.overdue; }).length;
  });

  /* ============================================================
   * 17. 匯出與 API（f20）
   * ============================================================ */
  DB.exportSets = [
    { key: 'tenants', name: '租客資料', count: function () { return DB.tenants.length; }, note: '姓名、聯絡方式、租約、繳費紀錄' },
    { key: 'leases', name: '租約（上游與下游）', count: function () { return DB.units.length * 2; }, note: '屋主與租客兩份合約條款' },
    { key: 'billing', name: '帳款與損益', count: function () { return DB.units.length * DB.months.length; }, note: '每間每月收入、成本、淨利' },
    { key: 'repairs', name: '修繕工單', count: function () { return DB.workOrders.length; }, note: '含報價、核准、發票與付款狀態' },
    { key: 'incidents', name: '重大事件', count: function () { return DB.incidents.length; }, note: '等級、對話、時間軸' },
    { key: 'photos', name: '照片與證據', count: function () { return DB.photos.length; }, note: '點交、報修、完工照片與通知紀錄' }
  ];
  DB.exportFormats = [
    { key: 'csv', name: 'CSV（試算表）', note: '每個資料集一個檔案，Excel 可直接開' },
    { key: 'json', name: 'JSON（開發用）', note: '保留完整欄位與關聯' },
    { key: 'zip', name: '完整備份 ZIP', note: '所有資料加照片原檔' }
  ];
  DB.exportHistory = [
    { id: 'EX-0042', at: '2026-09-01 09:12', by: '張○○', sets: ['帳款與損益'], format: 'CSV', size: '1.2 MB' },
    { id: 'EX-0041', at: '2026-08-01 09:05', by: '黃○○', sets: ['租客資料', '帳款與損益'], format: 'CSV', size: '1.8 MB' },
    { id: 'EX-0040', at: '2026-07-15 17:40', by: '張○○', sets: ['全部'], format: '完整備份 ZIP', size: '412 MB' }
  ];
  DB.apiEndpoints = [
    { method: 'GET', path: '/api/v1/units', desc: '所有物件與目前狀態',
      sample: '{\n  "id": "A01",\n  "building": "A",\n  "region": "中壢",\n  "type": "一房一廳",\n  "status": "rented",\n  "rent": 13000,\n  "tenant_id": "T01"\n}' },
    { method: 'GET', path: '/api/v1/leases?unit_id=A01', desc: '某物件的上游與下游租約',
      sample: '{\n  "upstream": { "owner_id": "O01", "end": "2028-06-30", "rent": 9300 },\n  "downstream": { "tenant_id": "T01", "end": "2027-03-31", "rent": 13000 }\n}' },
    { method: 'GET', path: '/api/v1/billing?month=2026-09', desc: '某月每間房的收入、成本與淨利',
      sample: '{\n  "unit_id": "A01",\n  "month": "2026-09",\n  "income": 13000,\n  "cost": 10100,\n  "net": 2900\n}' },
    { method: 'GET', path: '/api/v1/work-orders?status=open', desc: '未結案的修繕工單',
      sample: '{\n  "id": "WO-1043",\n  "unit_id": "B02",\n  "item": "馬桶水箱零件",\n  "quote": 3500,\n  "market_avg": 1800,\n  "status": "待核准"\n}' },
    { method: 'POST', path: '/api/v1/exports', desc: '建立一次完整匯出，回傳下載連結',
      sample: '{\n  "sets": ["tenants", "leases", "billing"],\n  "format": "zip",\n  "callback_url": "https://your-server/hook"\n}' }
  ];
  DB.ownershipPromises = [
    { title: '資料屬於安居包租代管', text: '所有租客、租約、帳款、修繕與照片的所有權都屬於貴公司，開發方只是保管者。' },
    { title: '隨時可完整匯出', text: '不需要提出申請，後台隨時可以匯出全部資料，含照片原檔。' },
    { title: '不因換系統商而受綁', text: '提供標準 API 與完整匯出格式，將來要換軟體商，資料全部帶得走。' }
  ];

  /* ============================================================
   * 18. 查詢工具
   * ============================================================ */
  DB.unit = U;
  DB.staffById = function (id) { return byId(DB.staff, id); };
  DB.ownerById = function (id) { return byId(DB.owners, id); };
  DB.unitsBy = function (q) {
    q = q || {};
    return DB.units.filter(function (u) {
      if (q.region && q.region !== '全部' && u.region !== q.region) return false;
      if (q.building && u.building !== q.building) return false;
      if (q.status && u.status !== q.status) return false;
      if (q.type && u.type !== q.type) return false;
      return true;
    });
  };
  DB.statusName = function (s) {
    return { rented: '出租中', leaving: '即將空房', prep: '整備中', listing: '招租中' }[s] || s;
  };
  /* 上游先到期、下面還有房客在租 → 風險清單（f01） */
  DB.riskUnits = function () {
    return DB.units.filter(function (u) {
      return u.tenantId && u.upstream.end < u.downstream.end;
    }).map(function (u) {
      return {
        unit: u, upEnd: u.upstream.end, downEnd: u.downstream.end,
        gapDays: daysBetween(u.upstream.end, u.downstream.end),
        daysToUpEnd: daysBetween(TODAY, u.upstream.end),
        text: '上游租約 ' + u.upstream.end + ' 到期，房客租約到 ' + u.downstream.end + '，仍有房客在租'
      };
    }).sort(function (a, b) { return a.daysToUpEnd - b.daysToUpEnd; });
  };
  /* 上游即將到期（60 天內）→ 續租待辦 */
  DB.upstreamExpiring = function (days) {
    days = days || 60;
    return DB.units.filter(function (u) {
      var d = daysBetween(TODAY, u.upstream.end);
      return d >= 0 && d <= days;
    }).sort(function (a, b) { return a.upstream.end < b.upstream.end ? -1 : 1; });
  };
  DB.leaseExpiring = function (days, side) {
    return DB.units.filter(function (u) {
      var end = side === 'upstream' ? u.upstream.end : u.downstream.end;
      var d = daysBetween(TODAY, end);
      return d >= 0 && d <= days;
    });
  };
  DB.pnlRanking = function (month, dir, limit) {
    var rows = DB.units.map(function (u) {
      var p = DB.pnlOf(u.id, month);
      return { unit: u, pnl: p, net: p.net };
    });
    rows.sort(function (a, b) { return dir === 'asc' ? a.net - b.net : b.net - a.net; });
    return rows.slice(0, limit || 5);
  };
  DB.lossUnits = function (month) {
    return DB.units.map(function (u) { return { unit: u, pnl: DB.pnlOf(u.id, month), net: DB.pnlOf(u.id, month).net }; })
      .filter(function (r) { return r.net < 0; })
      .sort(function (a, b) { return a.net - b.net; });
  };
  DB.thinMarginUnits = function (month) {
    return DB.units.map(function (u) { return { unit: u, pnl: DB.pnlOf(u.id, month), net: DB.pnlOf(u.id, month).net }; })
      .filter(function (r) { return r.net >= 0 && r.net < 2000; })
      .sort(function (a, b) { return a.net - b.net; });
  };

  /* ============================================================
   * 19. 彙總統計（f16 老闆儀表板）
   * ============================================================ */
  function regionStat(region, month) {
    var units = DB.unitsBy({ region: region });
    var income = 0, cost = 0, net = 0;
    units.forEach(function (u) {
      var p = DB.pnlOf(u.id, month);
      income += p.rentIncome; cost += p.cost; net += p.net;
    });
    return {
      region: region || '全部', count: units.length,
      income: Math.round(income), cost: Math.round(cost), net: Math.round(net),
      rented: units.filter(function (u) { return u.status === 'rented' || u.status === 'leaving'; }).length,
      vacant: units.filter(function (u) { return u.status === 'listing' || u.status === 'prep'; }).length
    };
  }
  DB.regionStat = regionStat;

  DB.stats = (function () {
    var month = CURRENT_MONTH;
    var total = DB.units.length;
    var rentedUnits = DB.units.filter(function (u) { return u.status === 'rented' || u.status === 'leaving'; });
    var vacantUnits = DB.units.filter(function (u) { return u.status === 'listing' || u.status === 'prep'; });
    var vacantDaysList = vacantUnits.map(function (u) { return u.vacantDays || 0; })
      .concat(PAST_VACANCY.map(function (p) { return p.days; }));
    var arrears = DB.tenants.filter(function (t) { return t.arrearsDays > 0; });
    var repairTotal = sum(DB.units, function (u) { return DB.pnlOf(u.id, month).repair; });
    var incomeTotal = sum(DB.units, function (u) { return DB.pnlOf(u.id, month).rentIncome; });
    var ownerRentTotal = sum(DB.units, function (u) { return DB.pnlOf(u.id, month).ownerRent; });
    var netTotal = sum(DB.units, function (u) { return DB.pnlOf(u.id, month).net; });

    var cashflow = [];
    for (var i = 0; i < 6; i++) {
      var m = addMonths(month + '-01', i).slice(0, 7);
      var expiring = DB.units.filter(function (u) { return monthOf(u.downstream.end) === m; }).length;
      var seasonal = 1 - (i * 0.012) - (expiring * 0.004);
      cashflow.push({
        month: m, monthLabel: monthLabel(m),
        income: Math.round(incomeTotal * seasonal),
        cost: Math.round((incomeTotal - netTotal) * (1 - i * 0.006)),
        net: 0, forecast: i > 0
      });
    }
    cashflow.forEach(function (r) { r.net = r.income - r.cost; });

    return {
      month: month, monthLabel: monthLabel(month),
      totalUnits: total,
      rented: rentedUnits.length,
      vacant: vacantUnits.length,
      occupancy: +(rentedUnits.length / total * 100).toFixed(1),
      vacancyRate: +(vacantUnits.length / total * 100).toFixed(1),
      avgVacantDays: Math.round(sum(vacantDaysList) / vacantDaysList.length),
      newMoveIn: DB.performance.totals.moveIn,
      moveOut: DB.performance.totals.moveOut,
      renewalRate: 87.5,
      arrearsCount: arrears.length,
      arrearsRate: +(arrears.length / rentedUnits.length * 100).toFixed(1),
      arrearsAvgDays: arrears.length ? Math.round(sum(arrears, function (t) { return t.arrearsDays; }) / arrears.length) : 0,
      arrearsAmount: sum(arrears, function (t) { return t.arrearsAmount; }),
      income: Math.round(incomeTotal),
      ownerRent: Math.round(ownerRentTotal),
      grossProfit: Math.round(incomeTotal - ownerRentTotal),
      netProfit: Math.round(netTotal),
      repairTotal: Math.round(repairTotal),
      repairRate: +(repairTotal / incomeTotal * 100).toFixed(1),
      repairPerUnit: Math.round(repairTotal / total),
      expiring30: DB.leaseExpiring(30, 'downstream').length,
      expiring60: DB.leaseExpiring(60, 'downstream').length,
      expiring90: DB.leaseExpiring(90, 'downstream').length,
      upstreamExpiring30: DB.leaseExpiring(30, 'upstream').length,
      upstreamExpiring60: DB.leaseExpiring(60, 'upstream').length,
      upstreamExpiring90: DB.leaseExpiring(90, 'upstream').length,
      riskCount: DB.riskUnits().length,
      cashflow: cashflow,
      regions: ['全部'].concat(DB.company.regions).map(function (r) { return regionStat(r === '全部' ? null : r, month); })
    };
  })();

  /* ============================================================
   * 20. AI 工作中心：今天需要人工處理的 7 件（f15）
   * ============================================================ */
  DB.workCenter = function () {
    var items = [];
    items.push({
      kind: 'billing', severity: 'warn', featureId: 'f14', unitId: 'A09',
      title: '帳款金額不符', desc: 'A09 本月收款 6,800 元，應收 7,000 元，差額 200 元待確認',
      action: '核對收款紀錄', roles: ['boss', 'accountant', 'manager'], link: 'f14-permissions-audit.html'
    });
    DB.tenants.filter(function (t) { return t.arrearsDays > 0; }).forEach(function (t) {
      items.push({
        kind: 'arrears', severity: t.arrearsDays > 10 ? 'danger' : 'warn', featureId: 'f13', unitId: t.unitId,
        title: '欠租 ' + t.arrearsDays + ' 天', desc: t.unitId + ' ' + t.name + ' 尚欠 ' + t.arrearsAmount.toLocaleString() + ' 元，已通知 ' + (t.unitId === 'E07' ? '3' : '2') + ' 次',
        action: '查看通知紀錄', roles: ['boss', 'accountant', 'manager'], link: 'f13-evidence.html'
      });
    });
    items.push({
      kind: 'repair', severity: 'warn', featureId: 'f07', unitId: 'C03',
      title: 'AI 無法判斷的修繕', desc: 'WO-1051 熱水器忽冷忽熱，租客兩次未回覆細節，AI 無法確定派工類別',
      action: '人工判斷並派工', roles: ['boss', 'manager', 'maintenance'], link: 'f07-vendors-workorders.html'
    });
    var risk = DB.riskUnits()[0];
    items.push({
      kind: 'lease', severity: 'danger', featureId: 'f01', unitId: risk.unit.id,
      title: '屋主合約即將到期', desc: risk.unit.id + ' 上游租約 ' + risk.upEnd + ' 到期，房客租約到 ' + risk.downEnd + '，仍有房客在租',
      action: '聯繫屋主續約', roles: ['boss', 'manager'], link: 'f01-upstream-lease.html'
    });
    items.push({
      kind: 'deposit', severity: 'danger', featureId: 'f04', unitId: 'D11',
      title: '退租押金尚未結算', desc: 'D11 退租已滿 45 天，押金 14,000 元仍未完成結算',
      action: '開始結算', roles: ['boss', 'accountant', 'manager'], link: 'f04-deposits.html'
    });
    items.push({
      kind: 'vacancy', severity: 'warn', featureId: 'f03', unitId: 'C08',
      title: '空房超過 14 天', desc: 'C08 已空置 33 天，共 3 組詢問、1 組帶看未成交，可能是租金偏高',
      action: '檢視租金建議', roles: ['boss', 'manager'], link: 'f03-vacancy-funnel.html'
    });
    return items;
  };
  DB.workCenterFor = function (role) {
    return DB.workCenter().filter(function (i) { return !i.roles || i.roles.indexOf(role) >= 0; });
  };
  DB.normalUnits = function () {
    var flagged = {};
    DB.workCenter().forEach(function (i) { if (i.unitId) flagged[i.unitId] = true; });
    return DB.units.filter(function (u) { return !flagged[u.id]; });
  };

  window.DB = DB;
})();
