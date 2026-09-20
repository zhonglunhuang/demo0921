# Makefile — 統一指令入口。
# 模板初始只有框架檢查；setup / framework 入口依技術棧把專案的
# lint / test / build / 起環境指令補進來（並同步 AGENTS.md「最小驗證」與 run-checks skill）。

.PHONY: help check ticket-lint static-check new-ticket

help: ## 列出所有指令
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

check: ticket-lint static-check ## 跑所有檢查（= CI：票務 lint + 靜態站檢查）
	@echo "[check] OK（票務 lint + 靜態站檢查皆通過）"

ticket-lint: ## 票務格式與一致性檢查
	./scripts/ticket-lint.sh
	@bash scripts/ticket-tools-test.sh  # 守規則的工具自己也要有測試（源專案 v4.12.1）

static-check: ## 靜態站基本檢查（HTML 引用路徑、絕對路徑、殘留佔位內容）
	./scripts/static-check.sh

new-ticket: ## 開新票（先 fetch 遠端再取號防撞號）：make new-ticket t="短題" r="行政"
	@./scripts/new-ticket.sh "$(t)" "$(r)"
