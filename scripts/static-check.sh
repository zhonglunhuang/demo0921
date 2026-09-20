#!/usr/bin/env bash
# static-check.sh — 純靜態站的基本檢查（由 setup 初始化時建立）。
# 不需要 node / npm，只用 bash + grep。檢查項目見 .agents/skills/run-checks/SKILL.md。
set -uo pipefail
cd "$(dirname "$0")/.."

SRC="src"
fail=0
err() { echo "  ✗ $*"; fail=1; }

if [ ! -d "$SRC" ]; then
  echo "[static-check] 尚無 $SRC/（還沒開始做網站）——跳過。"
  exit 0
fi

html_files=$(find "$SRC" -name '*.html' -type f | sort)
if [ -z "$html_files" ]; then
  echo "[static-check] $SRC/ 下還沒有 HTML 檔——跳過。"
  exit 0
fi

# 1) 首頁存在
[ -f "$SRC/index.html" ] || err "缺少 $SRC/index.html（首頁）"

# 2) 站內引用的檔案是否存在；3) 是否用了絕對路徑
while IFS= read -r f; do
  dir=$(dirname "$f")
  refs=$(grep -oE '(href|src)="[^"]*"' "$f" | sed -E 's/^(href|src)="//; s/"$//' || true)
  while IFS= read -r ref; do
    [ -z "$ref" ] && continue
    case "$ref" in
      http://*|https://*|//*|mailto:*|tel:*|data:*|\#*) continue ;;
      /*) err "$f 使用絕對路徑 \"$ref\"（GitHub Pages 子路徑下會失效，改用相對路徑）"; continue ;;
    esac
    target="${ref%%\#*}"; target="${target%%\?*}"
    [ -z "$target" ] && continue
    [ -e "$dir/$target" ] || err "$f 引用的檔案不存在：$ref"
  done <<< "$refs"
done <<< "$html_files"

# 4) 殘留佔位內容
placeholders=$(grep -rniE 'lorem ipsum|\{\{[^}]*\}\}|TODO' $SRC --include='*.html' --include='*.css' --include='*.js' || true)
if [ -n "$placeholders" ]; then
  echo "  ⚠ 發現疑似未完成的佔位內容（交給客戶前請確認）："
  echo "$placeholders" | sed 's/^/     /'
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "[static-check] 未通過。"
  exit 1
fi
echo "[static-check] OK（$(echo "$html_files" | wc -l | tr -d ' ') 個 HTML 檔，引用路徑與佔位內容皆正常）"
