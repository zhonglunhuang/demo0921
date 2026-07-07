#!/usr/bin/env bash
# PreToolUse hook：「無票不開發」的機制化閘門。
# 當 agent 要 Edit/Write 產品程式碼（PRODUCT_DIRS，見 scripts/framework-config.sh）時，
# 檢查 tickets/ 是否存在「待開發 / 開發中」的功能票；沒有就擋下（exit 2）。
# 由 .claude/settings.json 的 hooks.PreToolUse 呼叫。
# 邊界（誠實聲明）：只能檢查「有沒有可開發的票」，無法判斷本次修改屬於哪張票。
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
. "$ROOT/scripts/framework-config.sh"

# 尚未設定產品目錄（初始化前）→ 閘門不擋
[ ${#PRODUCT_DIRS[@]} -eq 0 ] && exit 0

FILE_PATH=$(python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = d.get("tool_input") or {}
print(ti.get("file_path") or ti.get("notebook_path") or "")
' 2>/dev/null || true)

# 拿不到路徑（非檔案類工具）→ 放行
[ -z "$FILE_PATH" ] && exit 0

# 只閘產品程式碼目錄；框架檔、docs、tickets、cache、scripts 一律放行
hit=0
for d in "${PRODUCT_DIRS[@]}"; do
  case "$FILE_PATH" in
    "$ROOT/$d"/*) hit=1; break ;;
  esac
done
[ "$hit" -eq 0 ] && exit 0

# 紅燈救火豁免：使用者明確同意後 touch cache/hotfix-override（不進 git），
# 修完必須刪除該檔並補票（規則見 AGENTS.md「Ticket 工作流」）。
[ -f "$ROOT/cache/hotfix-override" ] && exit 0

# 有任何「待開發 / 開發中」的票 → 放行
if grep -lE '^status: *(待開發|開發中)' "$ROOT"/tickets/"$TICKET_PREFIX"-*.md >/dev/null 2>&1; then
  exit 0
fi

cat >&2 <<EOF
[ticket-gate] 無票不開發：tickets/ 目前沒有任何「待開發 / 開發中」的功能票，
產品程式碼（${PRODUCT_DIRS[*]}）的修改已被擋下。
- 新功能 / 行為修改 → 先走 /pm 確認角色與目的、開票，再從 /dev 依票開發。
- 紅燈救火（不改行為）→ 經使用者明確同意後執行
  \`mkdir -p cache && touch cache/hotfix-override\` 暫時放行；修完刪除該檔，行為有變要補票。
EOF
exit 2
