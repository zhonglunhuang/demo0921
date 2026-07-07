# FRAMEWORK.md — Agent 協作框架（總覽 + 決策紀錄）

> **框架版本：v4.0.0**（版號規則見 §2.8；此為單一事實來源，`scripts/agent-status.sh` 簡報會讀這裡）
>
> 本檔記錄**協作框架本身**：角色入口怎麼設計、為什麼這樣設計、歷次變更。
> 框架的變更由 `framework` 入口討論與落地（豁免功能票）；每次變更**必須**同時
> (1) bump 上面的版號、(2) 在 §3 決策紀錄補一列（版號 / 日期 / 改了什麼 / 為什麼）。
> 產品功能的規格請看 `docs/SPEC.md`；工程規範請看 `AGENTS.md`。

## 1. 框架總覽

```
新對話開始
   │（模板未初始化 → 先進 [setup] 初始化精靈，完成後才有下面的流程）
   ▼
[team-leader] 專案現況簡報（SPEC 狀態 / ticket 看板 / 分支環境）
   │
   ├─→ [pm]        非工程師入口（不懂 code 的 PM/案主）：討論需求（必問角色/目的/驗收/邊界）
   │                → 開票 tickets/ + 同步 SPEC；使用者要的話 agent 主導、白話幫他開發並上實機
   │                討論過程與 demo 素材 → cache/（不進 git）
   │
   ├─→ [dev]       工程師入口：無票不開發 → 衝突/資安檢查 → 實作 → 推進票況 + 同步 SPEC
   │
   │   ↑ pm 與 dev 能力相同（都先開票、共用「分支與出貨流程」）；差在使用者是誰與呈現方式。
   │   共用出貨流程：從 stage 開 feature/* → 依票實作 → 檢查綠燈 → 問使用者 → merge 回 stage → 實機測試
   │
   └─→ [framework] 框架入口：討論與修改框架本身（入口、規則、資料夾約定）
                    → 落地後在本檔決策紀錄補一列（豁免票）
```

### 資料夾與規則檔的分工

| 位置 | 進 git | 角色 |
|------|:------:|------|
| `AGENTS.md` | ✅ | 唯一工程契約（規範「必須怎麼做」；`{{…}}` 佔位符由 setup 填寫） |
| `CLAUDE.md` | ✅ | Claude Code 入口行為（session 開始先 team-leader）與 adapter 說明 |
| `.agents/skills/` | ✅ | 所有角色入口與工作流的 canonical（單一來源） |
| `.claude/skills/` | ✅ | Claude Code adapter，只指回 canonical，不放第二套邏輯 |
| `scripts/framework-config.sh` | ✅ | 專案層設定（專案名、票號前綴、產品目錄、健康檢查 URL） |
| `.template-uninitialized` | ✅ | 模板未初始化標記；存在時 SessionStart 導向 setup，由 setup 刪除 |
| `tickets/` | ✅ | 功能票（產品開發唯一依據） |
| `docs/SPEC.md` | ✅ | 產品「目前實際行為」單一事實來源 |
| `docs/FRAMEWORK.md` | ✅ | 框架設計與決策紀錄（本檔） |
| `cache/` | ❌ | 戰情資料（PM 討論過程、demo 素材），可隨時丟棄 |

### Harness 原語對照（為什麼入口用 skill 做）

| 原語 | 特性 | 本框架的用法 |
|------|------|--------------|
| Skill（slash command） | 載入主對話、可互動提問 | 角色入口（pm/dev/framework/team-leader）＋ setup 精靈（都需要來回討論） |
| Subagent（Agent 工具，背景執行） | 獨立 context、跑完自動通知、不可互動 | 長任務背景執行——唯讀調查、demo 素材（pm）、依票實作於隔離 worktree（dev）；進行中每回合回報一行狀態 |
| CLAUDE.md 指令 | 每 session 自動載入 | 觸發「開場先 team-leader / 未初始化先 setup」 |
| Hook | 工具呼叫前後的攔截 | SessionStart（開場規則與即時狀態；未初始化改注入 setup 引導）＋ PreToolUse 票務閘門與 git 同步閘門 |

## 2. 框架規則摘要

1. **入口紀律**：新 session 先 team-leader 簡報 → AskUserQuestion 選入口，**無例外**——
   即使第一句話已明確指定任務，也先完成簡報與入口選項，選定後帶著任務進入口。
   （SessionStart hook 會注入開場規則與即時狀態，簡報直接沿用、不重跑指令。）
   **任何入口（pm / dev / framework）被進入時，都要先回報專案現況**（壓縮版 ≤10 行，帶角色視角）；
   本對話已簡報過則改 3 行內差異更新。
2. **無票不開發**（產品程式碼）：新功能 / 行為修改必須有 `tickets/` 的票；純問答、調查、不改行為的救火豁免。
   由 PreToolUse hook（`scripts/ticket-gate-hook.sh`）**機制化強制**：無「待開發/開發中」票時，
   `PRODUCT_DIRS` 內的檔案寫入直接被擋；救火經使用者同意後以 `cache/hotfix-override` 暫時放行，事後補票。
   票的格式與一致性由 `scripts/ticket-lint.sh` 檢查（`make ticket-lint`，含在 `make check`）。
3. **PM 必問四件事**：誰使用、目的、驗收標準、邊界——沒確認不開票。
   **PM 入口也能實際開發**（給不懂 code 的人用，agent 主導、白話回報），但**開發前一樣先開票**，
   無票不開發不豁免；pm 與 dev 差在使用者是誰與呈現方式，不在能力。
4. **票三態**：待開發 → 開發中 → 完成（作廢標記不刪檔）。
5. **框架變更豁免票**：走 framework 入口討論確認後直接改，但**必須**在本檔決策紀錄留痕。
6. **canonical/adapter 一致**：改工作流先改 `.agents/skills/`，再確認 `.claude/skills/` adapter 與
   CLAUDE.md / README / team-leader 入口清單同步。
7. **長任務走背景 subagent**：大範圍調查、demo 素材、已開票的長實作（限隔離 worktree）
   派背景 subagent 執行，主對話不中斷。任務描述必須自包含（subagent 中途不能提問）；
   進行中每回合開頭回報一行狀態，完成/失敗自動彙報；「無票不開發」同樣約束 subagent，
   實作結果由主對話驗證（run-checks）與驗收後才合回，票況與 SPEC 由主對話推進。
   派工門檻、模型調度、驗證判準見 `docs/harness/dispatch.md`。
8. **框架版號（semver）**：每次框架變更**必須** bump 檔頭「框架版本」並於 §3 補一列（含版號欄）。
   - **MAJOR**：不相容變更——移除/改寫入口、推翻既有規則、改變資料夾契約。
   - **MINOR**：新增能力——新入口、新機制/腳本、新規則（不破壞既有）。
   - **PATCH**：修 bug、文字、微調（不改行為契約）。
   一次涵蓋多項變更時，取最高等級 bump 一次；各項在 §3 分列、共用該版號。
   （**專案初始化（setup 填佔位符）不 bump**：屬專案設定，非框架變更，但在 §3 留一列。）
9. **分支與出貨流程**（pm/dev 共用，細節見 AGENTS.md「分支與出貨流程」、權威分支定義見 CONTRIBUTING.md
   「分支即環境」）：開發都從 **`stage`** 開 `feature/<票號>-<短題>`；判斷可實機測試時**先問使用者**，
   同意後 merge 回 `stage`，在實機環境驗收。分支模型：`stage` 整合分支、`prod` production。
   進 stage/prod 與部署都是對外動作，先確認。
10. **模板初始化（setup）**：`.template-uninitialized` 存在時，SessionStart hook 導向 setup 精靈；
    setup 只填佔位符與 `framework-config.sh`，不改框架規則；收尾刪除標記、在 §3 留痕（不 bump）。

## 3. 決策紀錄（changelog）

> 新版在上。每列：版號 / 日期 / 改了什麼 / 為什麼。版號規則見 §2.8。

| 版號 | 日期 | 決策（改了什麼） | 原因（為什麼） |
|------|------|------|------|
| v4.0.0 | 2026-07-07 | **模板化（template 化）**：(1) 剝離源專案（baojay）的全部業務程式碼、票、stack 綁定文件與 git 歷史，框架改為 stack 無關；(2) 目錄壓平成單一 repo（原「工作區＋專案子目錄」兩層併一層，hooks 路徑改 `$CLAUDE_PROJECT_DIR/scripts/`）；(3) 專案差異外部化到 `scripts/framework-config.sh`（專案名/票號前綴/產品目錄/健康檢查 URL），四支框架腳本改讀設定不寫死；(4) 新增 **setup 入口**（初始化精靈）＋ `.template-uninitialized` 標記：未初始化時 SessionStart hook 改注入首次使用引導，setup 問 5 組問題代填 AGENTS.md 佔位符與設定，收尾刪標記；(5) AGENTS.md 改為含 `{{…}}` 佔位符的骨架，stack 綁定 skills（add-*/deploy-safely/troubleshoot）移除、run-checks 改為由 setup 填寫的佔位版。MAJOR：移除入口、改變資料夾契約 | 使用者要把源專案的協作框架做成可發布的 template：業務程式碼是客戶 IP 不能散布；stack 綁定會限縮適用面；新使用者需要被引導而不是自己讀文件——用既有原語（skill + SessionStart hook + 標記檔）實作首次使用引導，不發明新機制 |
| — | 2026-07-02 ~ 07-04 | **前史（v1.0.0–v3.1.0，源專案 baojay）**：三角色入口以 skill 實作、每 session 開場簡報（SessionStart hook 強制）、無票不開發（PreToolUse hook 機制化）＋ ticket-lint、PM 升級為非工程師開發代理（能力=dev、差在呈現）、分支即環境出貨流程、框架版號制度、背景 subagent、harness 制度檔（dispatch/templates/sensors/maintenance）、git 同步閘門。完整決策表見 `docs/harness/archive/FRAMEWORK-history.md` | 每條規則的「為什麼」都來自源專案的真實踩坑（假設角色致重構、push 成功但 CD 失敗、平行開發互相覆蓋等）；歷史保留供翻舊帳，本表只留摘要 |
