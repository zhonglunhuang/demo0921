#!/usr/bin/env bash
# console-check.sh — 印出頁面載入時的 JS 錯誤（無輸出＝乾淨）。
# 用法：scripts/console-check.sh <站內路徑>
set -uo pipefail
path="${1:?站內路徑}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="${SHOT_BASE:-http://127.0.0.1:8010}"
"$CHROME" --headless=new --disable-gpu --enable-logging=stderr --v=0 --virtual-time-budget=6000 \
  --dump-dom "$BASE/$path" 2>&1 >/dev/null | grep -E 'CONSOLE|Uncaught|Error' | grep -vE 'CVDisplayLink|GPU|dbus|TensorFlow|sandbox|DevTools' || true
