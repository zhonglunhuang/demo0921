#!/usr/bin/env bash
# 開票助手（<前綴>-XXXX）：開票當下先 fetch 遠端，再從「本地 + 遠端整合分支」的最大票號 +1 取號，
# 然後照 tickets/README.md 模板建檔。票號前綴讀 scripts/framework-config.sh 的 TICKET_PREFIX。
#
# 目的：多 session / 多人平行開發時，開票的那一刻就看到別人剛開的票號，從源頭降低撞號。
# （撞號的最後防線仍是 scripts/ticket-lint.sh 的唯一性檢查；本腳本是「預防」那一層。）
#
# 用法：scripts/new-ticket.sh "短題（kebab 或中文）" ["角色，如 行政 或 客戶,業務"]
#   也可： make new-ticket t="匯出對帳單" r="行政"
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
. "$ROOT/scripts/framework-config.sh"
TICKETS_DIR="$ROOT/tickets"
REMOTE="${TICKET_REMOTE:-origin}"
BASE_BRANCH="${TICKET_BASE_BRANCH:-stage}"

title="${1:-}"
roles="${2:-}"
if [ -z "$title" ]; then
  echo "用法：scripts/new-ticket.sh \"短題\" [\"角色\"]" >&2
  echo "  例：scripts/new-ticket.sh \"匯出對帳單\" \"行政\"" >&2
  exit 2
fi

# 1) 先 fetch 遠端——取號的重點：讓本地看到別人剛推上去的票號
if git -C "$ROOT" fetch "$REMOTE" "$BASE_BRANCH" >/dev/null 2>&1; then
  echo "[new-ticket] 已 fetch ${REMOTE}/${BASE_BRANCH}（取號會納入遠端最新票）"
  remote_nums=$(git -C "$ROOT" ls-tree -r --name-only "$REMOTE/$BASE_BRANCH" -- tickets/ 2>/dev/null | grep -oE "${TICKET_PREFIX}-[0-9]{4}")
else
  echo "[new-ticket][warn] fetch 失敗（離線或無此遠端）——改用本地最大號，撞號風險較高；push 前務必先 pull --rebase" >&2
  remote_nums=""
fi

# 2) 本地 + 遠端合併取最大號 +1（10# 強制十進位，避免前導零被當八進位）
local_nums=$(ls "$TICKETS_DIR/$TICKET_PREFIX"-*.md 2>/dev/null | grep -oE "${TICKET_PREFIX}-[0-9]{4}")
max=$(printf '%s\n%s\n' "$local_nums" "$remote_nums" | grep -oE '[0-9]{4}' | sort -n | tail -1)
max=${max:-0000}
next=$(printf '%s-%04d' "$TICKET_PREFIX" "$((10#$max + 1))")

# 3) 短題正規化到檔名（空白、斜線→ -）
slug=$(printf '%s' "$title" | tr ' /' '--')
file="$TICKETS_DIR/$next-$slug.md"
today=$(date +%Y-%m-%d)
if [ -n "$roles" ]; then roles_field="[$roles]"; else roles_field="[]"; fi

if [ -e "$file" ]; then
  echo "[new-ticket] 檔案已存在，未覆寫：$file" >&2
  exit 1
fi

cat > "$file" <<EOF
---
id: $next
title: $title
status: 待開發        # 待開發 | 開發中 | 完成 | 作廢
roles: $roles_field
owner:
spec: docs/SPEC.md#TODO-對應章節錨點
created: $today
updated: $today
---

<!-- roles 誰使用：填產品的角色（清單見 docs/SPEC.md 產品概述，可多個；未填 ticket-lint 會擋）；owner 動工時填；spec 換成實際章節錨點 -->

## 目的（要解決什麼問題）

一句話說明為什麼要做。

## 使用角色與情境

- 誰、在什麼場景、用什麼裝置操作。

## 需求細節

- 與案主確認過的具體行為（含欄位、流程、規則）。

## 驗收標準

- [ ] 可驗證的條件一
- [ ] 可驗證的條件二

## 邊界（明確不做什麼）

- 這張票不包含的範圍，避免無限延伸。

## 開發備註（/dev 填寫）

- 實作決策、風險、對應 commit / PR。
EOF

echo "[new-ticket] 已建立 $next → $file"
echo "[new-ticket] 記得補：roles（誰用）、目的、驗收；動工時標「開發中」+ 填 owner。"
