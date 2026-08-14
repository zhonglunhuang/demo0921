#!/usr/bin/env bash
# 票務工具自動化測試（v4.12.1）：new-ticket.sh 的取號與 ticket-lint.sh 的守門。
#
# 為什麼要有：v4.11.0 把票號改成作者前綴時，取號腳本與 lint 都只靠**手動跑幾次看輸出**
# 驗證——而同一天就實際發生「讓號時檔名改了、frontmatter 的 id 忘了改」（源專案 BJ-0146）與
# 「lint 的錯誤路徑第一次執行就炸」（$base：黏全形字元）兩件事。守規則的工具自己沒有測試，
# 規則遲早再破一次。
#
# 全程在暫存沙盒跑（TICKETS_DIR 覆寫），不碰真的 tickets/；壞掉的遠端讓 fetch 走離線路徑，
# 不對外連線。掛在 make ticket-lint 之後（同一個 CI job）。
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fail=0
err() { echo "[ticket-tools-test] ✗ $1" >&2; fail=1; }
ok() { echo "[ticket-tools-test] ✓ $1"; }

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

# 假 git repo：讓 new-ticket 讀不到**真 repo 的 ticket.prefix**。
# 第一版沒隔離，跑在已設定前綴的 clone 上時「未設前綴要擋」測試就假失敗了——
# 測試自己第一次執行就抓到自己不夠密封，這正是要自動化的原因。
git init -q "$SANDBOX/fakegit"
FAKE_GIT_DIR="$SANDBOX/fakegit/.git"

run_new_ticket() {  # $1=prefix（空字串＝不給，測未設定路徑） $2=title
  GIT_DIR="$FAKE_GIT_DIR" TICKETS_DIR="$SANDBOX" TICKET_PREFIX="${1}" \
  TICKET_REMOTE="__no_such_remote__" \
    bash "$ROOT/scripts/new-ticket.sh" "$2" "行政" 2>/dev/null
}

run_lint() {
  TICKETS_DIR="$SANDBOX" bash "$ROOT/scripts/ticket-lint.sh" 2>&1
}

# ── 取號 ────────────────────────────────────────────────────────────────
# 1) 未設前綴要擋下並給指引，不能默默用錯身分
if run_new_ticket "" "無前綴要擋" >/dev/null; then
  err "未設前綴竟然開票成功——會默默用錯身分"
else
  ok "未設前綴被擋下"
fi

# 2) 第一張從 01 開始
run_new_ticket "TESTA" "第一張" >/dev/null
[ -f "$SANDBOX/TESTA-01-第一張.md" ] && ok "TESTA-01 建立" || err "第一張沒有取到 TESTA-01"

# 3) 同前綴遞增
run_new_ticket "TESTA" "第二張" >/dev/null
[ -f "$SANDBOX/TESTA-02-第二張.md" ] && ok "同前綴遞增到 02" || err "同前綴沒有遞增"

# 4) 不同前綴各自獨立（這就是不會撞號的核心保證）
run_new_ticket "TESTB" "別人的第一張" >/dev/null
[ -f "$SANDBOX/TESTB-01-別人的第一張.md" ] \
  && ok "不同前綴各自從 01 起（號碼空間獨立）" \
  || err "前綴的號碼空間沒有隔離——撞號問題沒真的解掉"

# ── lint 守門 ──────────────────────────────────────────────────────────
# 5) 剛開的票要能過 lint（新舊格式相容）
if run_lint | grep -q "OK"; then ok "新格式票通過 lint"; else err "新開的票過不了 lint：$(run_lint | head -2)"; fi

# 6) frontmatter id 與檔名不一致要抓到（BJ-0146 實際發生的事故）
sed -i '' 's/^id: TESTA-02$/id: TESTA-99/' "$SANDBOX/TESTA-02-第二張.md" 2>/dev/null \
  || sed -i 's/^id: TESTA-02$/id: TESTA-99/' "$SANDBOX/TESTA-02-第二張.md"
lint_mismatch=$(run_lint)
if echo "$lint_mismatch" | grep -q "檔名須以 id"; then
  ok "id 與檔名不一致被抓到（BJ-0146 事故的守門）"
else
  err "id 與檔名不一致沒被抓到——BJ-0146 那種事故會再發生。lint 輸出：$(echo "$lint_mismatch" | head -3)"
fi
sed -i '' 's/^id: TESTA-99$/id: TESTA-02/' "$SANDBOX/TESTA-02-第二張.md" 2>/dev/null \
  || sed -i 's/^id: TESTA-99$/id: TESTA-02/' "$SANDBOX/TESTA-02-第二張.md"

# 7) id 重複要抓到，而且**錯誤路徑本身不能炸**（$base：黏全形字元那個坑）
cp "$SANDBOX/TESTA-01-第一張.md" "$SANDBOX/TESTA-01-複製撞號.md"
lint_out=$(run_lint)
if echo "$lint_out" | grep -q "id 重複"; then
  ok "id 重複被抓到"
else
  err "id 重複沒被抓到：$lint_out"
fi
if echo "$lint_out" | grep -q "unbound variable"; then
  err "lint 的錯誤路徑自己炸了（unbound variable）——回報撞號的功能在最需要時死掉"
else
  ok "錯誤路徑本身活著（bash 3.2 全形字元坑的回歸）"
fi
rm -f "$SANDBOX/TESTA-01-複製撞號.md"

# 8) 舊制 BJ-XXXX 仍然合法（新舊並存是案主拍板）
cat > "$SANDBOX/BJ-9999-舊制相容.md" <<'EOF'
---
id: BJ-9999
title: 舊制相容
status: 待開發
roles: [行政]
spec:
created: 2026-08-07
updated: 2026-08-07
---
EOF
if run_lint | grep -q "OK"; then ok "舊制 BJ-XXXX 相容"; else err "舊制票被誤擋：$(run_lint | head -2)"; fi

if [ "$fail" -eq 0 ]; then
  echo "[ticket-tools-test] 全部通過"
fi
exit "$fail"
