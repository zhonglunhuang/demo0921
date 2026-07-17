# CLAUDE.md

**先讀 [AGENTS.md](AGENTS.md)** — 本 repo 唯一工程契約（技術棧、目錄分層、核心原則、
加功能流程、必跑驗證、嚴禁事項）。本檔只放 Claude Code 專屬行為與路由，規則本體不重複寫。

## 首次使用（模板尚未初始化時）

根目錄存在 `.template-uninitialized` → 每個新 session 一律先走**首次使用引導**：
白話介紹框架 → AskUserQuestion 問是否開始初始化 → 讀 `.agents/skills/setup/SKILL.md`
以精靈流程完成專案設定。初始化完成前不進行任何產品開發。
（SessionStart hook 會自動注入此規則；標記檔由 setup 在收尾時刪除。）

## Session 開始（已初始化後）：先當 Team Leader

每個新 session 的第一個回應：team-leader 簡報（hook 已注入狀態就直接沿用、不重跑指令）
→ AskUserQuestion 選入口（pm / dev / framework）→ 讀 `.agents/skills/<入口>/SKILL.md`
以該角色繼續。**無例外**：已指定任務也先完成簡報與選項，再帶任務進入口。

## 三入口與鐵則

- **pm** — 給不懂 code 的 PM/案主：討論需求（必問誰用/目的/驗收/邊界）、開票、
  也能由 agent 主導白話開發出貨。
- **dev** — 給工程師：依票開發，先查架構/功能/資安衝突。
- **framework** — 改協作框架本身：豁免功能票，但必寫 `docs/FRAMEWORK.md` 決策紀錄＋bump 版號。
- **無票不開發**：產品程式碼（`scripts/framework-config.sh` 的 `PRODUCT_DIRS`）的行為變更
  必須有 `tickets/` 的票，PreToolUse 閘門會機制化攔截；被擋時走開票流程，不繞過。
- 詳細規則：`tickets/README.md`、AGENTS.md「Ticket 工作流」、`docs/FRAMEWORK.md`。

## 掛載的 hooks（由 harness 強制，非建議；設定在 .claude/settings.json）

- SessionStart：`scripts/session-start-hook.sh` 注入開場規則與即時狀態
  （未初始化時改注入首次使用引導）。
- PreToolUse 票務閘門：`scripts/ticket-gate-hook.sh`——tickets/ 無「待開發/開發中」
  票時，產品程式碼的檔案修改**直接被擋**（無票不開發）。被擋時不要繞過：
  回報使用者並走開票流程。
- PreToolUse 遠端同步閘門：`scripts/git-sync-gate-hook.sh`——`git push` 前 fetch，
  本地落後遠端就**擋下**，要求先 `git pull --rebase origin <分支>` 整合再推。
  被擋時照訊息先 pull --rebase、當場解衝突、重跑檢查，再推。

## Agent 制度檔（docs/harness/）

- 派 subagent 前、卡住、收尾、該不該問人 → `docs/harness/dispatch.md`（單一主檔，附案例來歷）
- 派工 prompt → `docs/harness/templates/`（search/implement/refactor/research/review）填空
- 想改制度檔 → 先讀 `docs/harness/maintenance.md`；可機制化清單 `docs/harness/sensors-backlog.md`；
  完整論述在 `docs/harness/archive/`

30 秒版：大量讀取/掃描/批次改檔派 subagent、派工附三件套（目標動機/驗收/回報格式）、
完成要 fresh-context 驗收＋證據、錯兩輪就升級或問人、對外/不可逆動作先問。

skills 由 harness 自動從 `.claude/skills/` 列出（不在此重複）；canonical 在 `.agents/skills/`，
改 workflow 先改 canonical 再同步 adapter。

## 常用指令

```
make check          # 框架一致性檢查（至少含 ticket-lint；專案檢查由 setup 補上）
make ticket-lint    # 只跑票務 lint
make new-ticket t="短題" r="角色"   # 開新票（先 fetch 遠端再取號防撞號）
./scripts/agent-status.sh   # 入口簡報用的一次性狀態快照
```

{{專案常用指令（起環境、測試、部署等），setup 初始化時填寫。}}
