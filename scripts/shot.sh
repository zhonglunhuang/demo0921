#!/usr/bin/env bash
# shot.sh — 用無頭 Chrome 幫本機站截圖（驗證畫面用）。
# 用法：scripts/shot.sh <站內路徑> <輸出.png> [desktop|mobile|long|mobile-long]
#   站內路徑相對 repo 根目錄，例：src/index.html、src/app/f01-upstream-lease.html
set -euo pipefail
path="${1:?站內路徑}"; out="${2:?輸出檔}"; mode="${3:-desktop}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="${SHOT_BASE:-http://127.0.0.1:8010}"
case "$mode" in
  desktop) size="1440,900" ;;
  long) size="1440,3200" ;;
  mobile) size="390,844" ;;
  mobile-long) size="390,3000" ;;
  *) size="$mode" ;;   # 允許直接給 "寬,高"
esac
extra=("--no-first-run")
case "$mode" in mobile*) extra+=(--user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1") ;; esac
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size="$size" --virtual-time-budget=6000 "${extra[@]}" \
  --screenshot="$out" "$BASE/$path" >/dev/null 2>&1
echo "[shot] $out ($size) ← $BASE/$path"
