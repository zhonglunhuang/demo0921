#!/usr/bin/env bash
# framework-config.sh — 框架的專案層設定（由 setup 入口在初始化時填寫）。
# 所有框架腳本（agent-status / ticket-gate / ticket-lint / session-start）都 source 這份，
# 專案差異只改這裡，不改腳本本體。

# 專案名稱（顯示於簡報）
PROJECT_NAME="（未初始化——請走 setup 入口）"

# 票號前綴：tickets/ 的票一律命名 <前綴>-XXXX-<短題>.md（例：TK-0001-掃碼入庫.md）
TICKET_PREFIX="TK"

# 產品程式碼目錄（相對 repo 根目錄）：「無票不開發」閘門的守備範圍。
# 空陣列 = 閘門不擋任何路徑（初始化前的暫時狀態；setup 會要求填寫）。
PRODUCT_DIRS=()

# 本機健康檢查 URL（agent-status 簡報用；留空 = 跳過健康檢查）
HEALTH_URL=""
