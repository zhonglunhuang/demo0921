# 00 — Harness 診斷：三大失效模式與修法

> 2026-07-03 由 Fable 5 session 診斷。證據來自本 repo 的實際歷史，不是通論。
> 後面所有制度檔（10/20/30/40）都是針對這三條開的藥方。

## 第 1 名【漏 token】：主對話自己下場做大量讀取

**症狀**：主對話直接 Read 整份大檔（compose、FRAMEWORK、SKILL 動輒一兩百行的全文
進 context）、自己掃 repo、自己追 log。每一份原文都永久佔據主對話 context，
弱模型 context 被塞滿後開始遺忘早前指令、品質下滑。

**證據**：2026-07-03 的 dev-lite session，主對話為了改 4 個檔讀了 ~600 行原文。
強模型撐得住，弱模型會在長 session 後段失憶。

**修法**（詳 `10-MODEL-DISPATCH.md` §2 下場門檻）：
- 超過門檻（>2 檔或 >300 行）的讀取 → 派 `Explore` subagent，只回結論＋檔案:行號。
- 已知要讀哪段就用 Read 的 offset/limit，不整檔讀。
- 長輸出（log、diff、測試報告）→ 導到 scratchpad 檔案，主對話只 tail/grep 摘要。

## 第 2 名【易出錯】：自驗偏誤＋「動作成功」誤當「結果成功」

**症狀**：(a) 寫的人自己說「做完了」，沒有獨立驗收；(b) 把中間動作的成功
（push 成功、指令 exit 0）當成最終結果的成功（部署成功、功能可用）。

**證據**：本 repo 的 stage CD 管線 SSH secrets 未設，**每次 push 的自動部署其實都失敗**；
2026-07-03 session 靠主動查 `gh run list` 才發現「push 成功」≠「stage 更新了」。
弱模型極易在此宣告勝利然後離開。

**修法**（詳 `20-JUDGMENT.md` §2 完成的定義、`10-MODEL-DISPATCH.md` §6 驗證不自驗）：
- 完成 = 驗收條件逐條有證據（測試輸出／read-back／實跑結果），不是「code 寫完」。
- 驗收派 fresh-context subagent（沒看過實作過程的），不由實作者自驗。
- 對外動作要驗「終態」：push 後查 CI/CD run 結論；部署後打 healthz；寫檔後 read-back。

## 第 3 名【易失焦】：重試螺旋與範圍蔓延

**症狀**：(a) 遇錯原地重試同一招，越試越多輪，token 燒光；(b) 順手修「路過看到的問題」，
diff 越長越大，最後連原任務都驗不動。

**證據**：本 repo 框架 v1.0.0 的決策紀錄——早期 agent 自行假設使用者角色與登入方式，
導致登入與權限被反覆重構（FRAMEWORK.md §3）。「無票不開發」與「PM 必問四件事」
就是那次的傷疤。

**修法**（詳 `10-MODEL-DISPATCH.md` §5 升降級、`20-JUDGMENT.md` §4 換路訊號）：
- 同一子任務同一層級最多 2 輪，然後升級模型或問使用者，**沒有第三次**。
- 題外發現用 `spawn_task`（背景任務 chip）或開票隔離，不在當前 diff 裡順手修。
- 票務閘門擋下時不硬闖：回報＋建議開票，不要嘗試繞過。

## 次要（知道就好，不立專章）

- 開場儀式（簡報＋選入口）是使用者明令且 hook 強制的，成本已由 hook 注入狀態壓到最低；
  **不要試圖優化掉它**（見 `90-LETTER.md`）。
- CLAUDE.md 曾重複列 skills 清單（harness 本來就自動列出）→ 已在 v2.2.0 刪除。
- MCP 工具已走 deferred loading（ToolSearch），不構成常態洩漏。
