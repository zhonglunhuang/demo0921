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
target="$BASE/$path"
frame=""

# 手機模式：無頭 Chrome 的視窗寬度下限是 500px（實測 window-size=375 仍得到 innerWidth=500），
# 直接截圖會拿到「用 500px 排版再裁成 390px」的假畫面。改用等寬 iframe 當量測載具，
# 讓頁面真的在 390/375px 的 viewport 裡排版。載具放 repo 根目錄（不在 src/，不影響 static-check）。
case "$mode" in
  mobile*)
    w="${size%%,*}"; h="${size##*,}"
    frame=".shot-frame.html"
    cat > "$frame" <<HTML
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#fff}
  iframe{width:${w}px;height:${h}px;border:0;display:block}
</style></head><body><iframe src="$target" scrolling="no"></iframe></body></html>
HTML
    target="$BASE/$frame"
    extra+=(--user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
    ;;
esac

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size="$size" --virtual-time-budget=6000 "${extra[@]}" \
  --screenshot="$out" "$target" >/dev/null 2>&1
[ -n "$frame" ] && rm -f "$frame"
echo "[shot] $out ($size) ← $target"
