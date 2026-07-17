# Makefile — 統一指令入口。
# 模板初始只有框架檢查；setup / framework 入口依技術棧把專案的
# lint / test / build / 起環境指令補進來（並同步 AGENTS.md「最小驗證」與 run-checks skill）。

.PHONY: help check ticket-lint new-ticket

help: ## 列出所有指令
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

check: ticket-lint ## 跑所有檢查（= CI；setup 後應包含專案的 lint/test）
	@echo "[check] OK（目前僅框架檢查；專案檢查由 setup 補上）"

ticket-lint: ## 票務格式與一致性檢查
	./scripts/ticket-lint.sh

new-ticket: ## 開新票（先 fetch 遠端再取號防撞號）：make new-ticket t="短題" r="行政"
	@./scripts/new-ticket.sh "$(t)" "$(r)"
