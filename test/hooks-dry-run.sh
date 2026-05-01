#!/usr/bin/env bash
# test/hooks-dry-run.sh — gate_check.sh B-2 의 핵심 검증.
# TEAM_HOOKS_DRY_RUN=1 환경에서 4 hooks의 무부작용 동작 + scan-secrets 양/음성 케이스 검증.
#
# 종료 코드: 0 = 모든 검증 통과; 1 = 하나 이상 실패.

set -uo pipefail

HOOKS="$HOME/.claude/team-hooks"
FAIL_COUNT=0
PASS_COUNT=0

run() {
  local name="$1"; shift
  local expected_exit="$1"; shift
  local actual_exit
  "$@" >/dev/null 2>&1
  actual_exit=$?
  if [ "$actual_exit" = "$expected_exit" ]; then
    echo "  ✓ $name (exit=$actual_exit)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  ✗ $name (expected exit=$expected_exit, got=$actual_exit)" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

echo "=== hooks-dry-run.sh ==="
echo

echo "[1] send-event.sh — synthetic Edit tool_call (DRY_RUN)"
PAYLOAD='{"tool_name":"Edit","tool_use_id":"toolu_test_01","duration_ms":42,"success":true,"session_id":"sess_test"}'
run "send-event Edit DRY_RUN exit=0" 0 \
  bash -c "echo '$PAYLOAD' | TEAM_HOOKS_DRY_RUN=1 TEAM_USER_ID=test bash '$HOOKS/send-event.sh' tool_call"

echo "[2] send-event.sh — Skill tool with metadata (DRY_RUN)"
SKILL_PAYLOAD='{"tool_name":"Skill","tool_use_id":"toolu_test_02","tool_input":{"metadata":{"skill_name":"anthropic-skills:pdf"}},"duration_ms":8,"success":true}'
run "send-event Skill DRY_RUN exit=0" 0 \
  bash -c "echo '$SKILL_PAYLOAD' | TEAM_HOOKS_DRY_RUN=1 TEAM_USER_ID=test bash '$HOOKS/send-event.sh' tool_call"

echo "[3] send-event.sh — session_start (empty stdin OK)"
run "send-event session_start empty stdin exit=0" 0 \
  bash -c "echo '' | TEAM_HOOKS_DRY_RUN=1 TEAM_USER_ID=test bash '$HOOKS/send-event.sh' session_start"

echo "[4] send-event.sh — invalid duration (validation falls back to 0)"
INVALID_PAYLOAD='{"tool_name":"Edit","duration_ms":"not_a_number","success":"maybe"}'
run "send-event invalid duration → exit 0 with fallback" 0 \
  bash -c "echo '$INVALID_PAYLOAD' | TEAM_HOOKS_DRY_RUN=1 bash '$HOOKS/send-event.sh' tool_call"

echo "[5] precheck-plan.sh — plan exists (this conversation's plan file)"
run "precheck-plan plan exists exit=0" 0 \
  bash -c "echo '{\"tool_name\":\"Edit\"}' | bash '$HOOKS/precheck-plan.sh'"

echo "[6] scan-secrets.js — clean text"
run "scan-secrets clean exit=0" 0 \
  bash -c "echo 'no secrets here, just text' | node '$HOOKS/scan-secrets.js'"

echo "[7] scan-secrets.js — github_pat secret"
run "scan-secrets github_pat exit=1" 1 \
  bash -c "echo 'ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' | node '$HOOKS/scan-secrets.js'"

echo "[8] scan-secrets.js — anthropic key"
run "scan-secrets sk-ant exit=1" 1 \
  bash -c "echo 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' | node '$HOOKS/scan-secrets.js'"

echo "[9] scan-secrets.js — AWS ASIA temporary token"
run "scan-secrets ASIA exit=1" 1 \
  bash -c "echo 'ASIAIOSFODNN7EXAMPLE' | node '$HOOKS/scan-secrets.js'"

echo "[10] scan-secrets.js — file in allowlist (evals/golden_set/**/*.json)"
TMP_DIR=$(mktemp -d)
mkdir -p "$TMP_DIR/evals/golden_set"
echo 'ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' > "$TMP_DIR/evals/golden_set/test.json"
run "scan-secrets allowlisted file exit=0" 0 \
  bash -c "cd '$TMP_DIR' && node '$HOOKS/scan-secrets.js' evals/golden_set/test.json"
rm -rf "$TMP_DIR"

echo "[11] precommit-check.sh — clean run (JSON output, overall_ok=true)"
JSON_OUT=$(bash "$HOOKS/precommit-check.sh" 2>/dev/null)
if echo "$JSON_OUT" | jq -e '.overall_ok == true' >/dev/null 2>&1; then
  echo "  ✓ precommit-check JSON valid + overall_ok=true"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  ✗ precommit-check JSON invalid or overall_ok != true" >&2
  echo "$JSON_OUT" | head -5 >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo "[12] .checksums.json — parseable + non-empty"
if jq -e 'length > 0' "$HOOKS/.checksums.json" >/dev/null 2>&1; then
  echo "  ✓ .checksums.json valid JSON with entries"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  ✗ .checksums.json malformed or empty" >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo "[13] scanner-allowlist.ts — paths array parseable"
ALLOW_PATHS=$(node -e "
const fs = require('node:fs');
const txt = fs.readFileSync('$HOOKS/scanner-allowlist.ts', 'utf8');
const m = txt.match(/paths\\s*:\\s*\\[([\\s\\S]*?)\\]/);
if (!m) { process.exit(1); }
const paths = [...m[1].matchAll(/['\"]([^'\"]+)['\"]/g)].map(x => x[1]);
console.log(paths.length);
" 2>/dev/null || echo 0)
if [ "$ALLOW_PATHS" -ge 4 ]; then
  echo "  ✓ scanner-allowlist.ts has $ALLOW_PATHS paths (≥4 expected)"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  ✗ scanner-allowlist.ts has $ALLOW_PATHS paths (expected ≥4)" >&2
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo
echo "=== Summary ==="
echo "PASS: $PASS_COUNT"
echo "FAIL: $FAIL_COUNT"

if [ $FAIL_COUNT -eq 0 ]; then
  echo "✅ hooks-dry-run.sh ALL PASS"
  exit 0
else
  echo "❌ hooks-dry-run.sh $FAIL_COUNT failure(s)"
  exit 1
fi
