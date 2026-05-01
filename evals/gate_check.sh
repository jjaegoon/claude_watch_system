#!/usr/bin/env bash
# evals/gate_check.sh — T-37 자동 게이트 검증.
#
# Exit codes:
#   0 = PASS (또는 acceptable SKIP)
#   1 = FAIL (자동 검증 실패)
#   2 = BLOCKED (사용자 어드민 검토 필요)
#
# Usage: bash evals/gate_check.sh {B-1|B-2|M2|M1|M3|M4}

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

case "${1:-}" in
  B-1)
    # DB 스키마 + WAL 모드 검증. migrations 비어있으면 SKIP.
    if [ -z "$(ls packages/db/migrations 2>/dev/null)" ]; then
      echo "⚠️  Gate B-1 SKIP (migrations not authored yet)"
      exit 0
    fi
    pnpm --filter @team-claude/db migrate || { echo "❌ Gate B-1 FAIL: migrate error"; exit 1; }
    sqlite3 data/dev.db ".tables" | grep -qE "assets" || { echo "❌ Gate B-1 FAIL: assets table missing"; exit 1; }
    sqlite3 data/dev.db ".tables" | grep -qE "assets_fts" || { echo "❌ Gate B-1 FAIL: assets_fts virtual table missing"; exit 1; }
    sqlite3 data/dev.db ".tables" | grep -qE "webhook_jobs" || { echo "❌ Gate B-1 FAIL: webhook_jobs table missing"; exit 1; }
    sqlite3 data/dev.db ".tables" | grep -qE "users" || { echo "❌ Gate B-1 FAIL: users table missing"; exit 1; }
    sqlite3 data/dev.db ".tables" | grep -qE "usage_events" || { echo "❌ Gate B-1 FAIL: usage_events table missing"; exit 1; }
    sqlite3 data/dev.db "PRAGMA journal_mode" | grep -qi "wal" || { echo "❌ Gate B-1 FAIL: WAL mode not enabled"; exit 1; }
    ;;

  B-2)
    # Hooks installable + dry-run 검증.
    test -x "$HOME/.claude/team-hooks/send-event.sh" || { echo "❌ Gate B-2 FAIL: send-event.sh not executable"; exit 1; }
    test -x "$HOME/.claude/team-hooks/precheck-plan.sh" || { echo "❌ Gate B-2 FAIL: precheck-plan.sh not executable"; exit 1; }
    test -x "$HOME/.claude/team-hooks/precommit-check.sh" || { echo "❌ Gate B-2 FAIL: precommit-check.sh not executable"; exit 1; }
    test -f "$HOME/.claude/team-hooks/scan-secrets.js" || { echo "❌ Gate B-2 FAIL: scan-secrets.js missing"; exit 1; }
    test -f "$HOME/.claude/team-hooks/scanner-allowlist.ts" || { echo "❌ Gate B-2 FAIL: scanner-allowlist.ts missing"; exit 1; }
    test -f "$HOME/.claude/team-hooks/.checksums.json" || { echo "❌ Gate B-2 FAIL: .checksums.json missing"; exit 1; }
    test -f "test/hooks-dry-run.sh" || { echo "❌ Gate B-2 FAIL: test/hooks-dry-run.sh missing"; exit 1; }
    bash test/hooks-dry-run.sh || { echo "❌ Gate B-2 FAIL: hooks-dry-run.sh failed"; exit 1; }
    ;;

  M2)
    # Webhook e2e 검증. test 미존재 시 PENDING.
    if [ ! -f "apps/api/test/e2e/webhook-jobs.test.ts" ]; then
      echo "⚠️  Gate M2 PENDING (e2e suite not authored)"
      exit 0
    fi
    pnpm --filter @team-claude/api test:e2e -- webhook-jobs.test.ts || { echo "❌ Gate M2 FAIL"; exit 1; }
    ;;

  M1|M3|M4)
    cat <<EOF
🚧 Gate $1 BLOCKED — 사용자 어드민 검토 필요 (T-37)

이 게이트는 페르소나 리뷰 + 도그푸딩 검증이 필요하므로 자동 통과 불가.
검토 절차:
  1. 페르소나 리뷰 (8명 팀 또는 대표 페르소나)
  2. 도그푸딩 측정 결과 검토
  3. 사용자 어드민 명시적 승인
EOF
    exit 2
    ;;

  *)
    echo "Usage: $0 {B-1|B-2|M2|M1|M3|M4}"
    echo "Exit: 0=PASS|SKIP, 1=FAIL, 2=BLOCKED-user-admin"
    exit 1
    ;;
esac

echo "✅ Gate $1 자동 통과"
exit 0
