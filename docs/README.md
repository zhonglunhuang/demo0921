# 文件地圖

這個專案的所有文件索引。**這份是 canonical 索引**，README.md 與 AGENTS.md 都指向這裡。

## 規範 vs 說明（先看這個）

| 類型 | 文件 | 性質 |
|------|------|------|
| **規範（normative）** | [AGENTS.md](../AGENTS.md)、[PRINCIPLES.md](PRINCIPLES.md) | 「你必須怎麼做」。衝突時**以這些為準**。 |
| **規格（spec）** | [SPEC.md](SPEC.md) | 「系統現在做什麼」。隨功能同步維護的單一事實來源。 |
| **說明（informative）** | 其餘文件 | 協助理解，不可與規範牴觸；發現牴觸以規範為準並回報。 |

## 給非工程師

- [SPEC.md](SPEC.md) — ★ 功能規格書：目前提供哪些功能、怎麼運作。對焦需求與驗收用它。
- [PM_GUIDE.md](PM_GUIDE.md) — 用 AI Agent VibeCoding 的劇本（說需求、開票、驗收）。

## 給 AI Agent

- [../AGENTS.md](../AGENTS.md) — ★ 工程契約（唯一規範來源），任何 agent 動工前先讀。
- [../.agents/skills](../.agents/skills) — Claude / Codex / Cursor 共用的 canonical workflow skills。
- [../CLAUDE.md](../CLAUDE.md) — Claude Code 專屬入口（`.claude/skills/` 只是 adapter）。
- [SPEC.md](SPEC.md) — ★ 功能規格書：動工前先讀對焦既有行為，功能改完主動更新。
- [PRINCIPLES.md](PRINCIPLES.md) — ★ 生產原則鐵則（每加功能必讀）。
- [harness/dispatch.md](harness/dispatch.md) — 派 subagent 的門檻、派工表、驗證判準（附案例來歷）。
- [../.cursor/rules](../.cursor/rules) — Cursor always-apply rules，指回 AGENTS 與 `.agents/skills/`。

## 框架本身

- [FRAMEWORK.md](FRAMEWORK.md) — ★ 協作框架總覽、規則摘要、帶版號的決策紀錄。
- [harness/](harness/) — agent 派工制度：`dispatch.md`（主檔）、`templates/`（派工模板）、
  `sensors-backlog.md`（可機制化清單）、`maintenance.md`（維護協議）、`archive/`（完整論述與前史）。
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — 分支模型（分支即環境）、commit 規範、PR 流程。
- [../tickets/README.md](../tickets/README.md) — 功能票格式與狀態流。

## 專案技術文件

{{setup / framework 入口依技術棧補充（架構、部署、環境設定等），並登記在這裡。}}
