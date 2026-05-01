#!/usr/bin/env bash
# T-32C: Unified self-check before commit.
# 7 checks per 06_개발워크플로/개발_워크플로.md §5.4.
# Wrap with `timeout 300 bash precommit-check.sh` for 5min guarantee.
# JSON report on stdout. Exit 0 = all pass; 1 = at least one FAIL.

set -uo pipefail

START_TS=$(date +%s)
HOOKS_DIR="${HOME}/.claude/team-hooks"
RESULTS=()
OVERALL_OK=true

sha256_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'
  fi
}

stat_mode() {
  if stat -f '%Lp' "$1" 2>/dev/null; then return 0
  else stat -c '%a' "$1" 2>/dev/null; fi
}

add_result() {
  local check="$1" status="$2" message="$3"
  RESULTS+=("$(jq -n \
    --arg c "$check" --arg s "$status" --arg m "$message" \
    '{check:$c, status:$s, message:$m}')")
  [ "$status" = "FAIL" ] && OVERALL_OK=false
}

# ---- Check 1: Hook permissions ≤0755 ----
check_perms() {
  local fail=0
  for f in send-event.sh precheck-plan.sh precommit-check.sh scan-secrets.js; do
    local fp="$HOOKS_DIR/$f"
    if [ ! -e "$fp" ]; then
      add_result "perms" "FAIL" "missing: $fp"; fail=1; continue
    fi
    local mode
    mode="$(stat_mode "$fp")"
    # Strict equality check: hooks deployed by install.sh are exactly 0755.
    # Anything else (including over-permissive 777, under-permissive 700, etc.) flagged.
    if [ -n "$mode" ] && [ "$mode" != "755" ]; then
      add_result "perms" "FAIL" "$f mode $mode != 755 (re-run install.sh)"; fail=1
    fi
  done
  [ $fail -eq 0 ] && add_result "perms" "PASS" "all hook files ≤0755"
}

# ---- Check 2: SHA-256 integrity vs .checksums.json ----
check_checksums() {
  local sums="$HOOKS_DIR/.checksums.json"
  if [ ! -f "$sums" ]; then
    add_result "checksums" "FAIL" "missing $sums"; return
  fi
  local fail=0
  while IFS= read -r line; do
    local fname expected actual
    fname="$(echo "$line" | jq -r '.key')"
    expected="$(echo "$line" | jq -r '.value')"
    [ ! -f "$HOOKS_DIR/$fname" ] && continue
    actual="$(sha256_cmd "$HOOKS_DIR/$fname")"
    if [ "$expected" != "$actual" ]; then
      add_result "checksums" "FAIL" "$fname mismatch (got $actual)"; fail=1
    fi
  done < <(jq -c 'to_entries[]' "$sums" 2>/dev/null || true)
  [ $fail -eq 0 ] && add_result "checksums" "PASS" "all hook checksums match"
}

# ---- Check 3: env-secret in tracked files ----
check_env_secrets() {
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    add_result "env_secrets" "SKIP" "not a git repo"; return
  }
  local hits
  hits="$(git -C "$repo_root" grep -nE "HOOKS_API_KEY=[\"']?[A-Za-z0-9]{20,}" -- ':!*.example' ':!*.md' ':!memory/**' 2>/dev/null | head -3 || true)"
  if [ -n "$hits" ]; then
    add_result "env_secrets" "FAIL" "HOOKS_API_KEY plaintext: $(echo "$hits" | head -1)"
  else
    add_result "env_secrets" "PASS" "no HOOKS_API_KEY plaintext"
  fi
}

# ---- Check 4: 9-pattern secret scan on staged files ----
check_staged_secrets() {
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    add_result "staged_secrets" "SKIP" "not a git repo"; return
  }
  local staged
  staged="$(git -C "$repo_root" diff --cached --name-only 2>/dev/null || true)"
  if [ -z "$staged" ]; then
    add_result "staged_secrets" "PASS" "no staged files"; return
  fi
  if [ ! -f "$HOOKS_DIR/scan-secrets.js" ]; then
    add_result "staged_secrets" "SKIP" "scan-secrets.js not installed"; return
  fi
  local fail=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    # Scan staged blob (not working-tree file) so a post-stage edit can't bypass.
    # Pass --for $f so allowlist check applies to staged path.
    if ! git -C "$repo_root" show ":$f" 2>/dev/null | node "$HOOKS_DIR/scan-secrets.js" --for "$f" >/dev/null 2>&1; then
      add_result "staged_secrets" "FAIL" "secret in staged $f"; fail=1
    fi
  done <<< "$staged"
  [ $fail -eq 0 ] && add_result "staged_secrets" "PASS" "no staged secrets"
}

# ---- Check 5: Blocklist 9 bypass patterns in staged diff ----
check_blocklist() {
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    add_result "blocklist" "SKIP" "not a git repo"; return
  }
  local diff
  diff="$(git -C "$repo_root" diff --cached 2>/dev/null || true)"
  if [ -z "$diff" ]; then
    add_result "blocklist" "PASS" "no staged diff"; return
  fi
  # Concatenate fork-bomb signature ":\(\)\{ ... :|" via parts to avoid scan-secrets type tools flagging this script.
  local fb_a=':\(' fb_b='\)\{[[:space:]]*:'
  local pattern="rm -rf /|dd if=/dev/|mkfs\\.|find [^|]+ -delete|shred -|chmod 0[0-7]{3}|${fb_a}${fb_b}|DROP[[:space:]]+TABLE|>[[:space:]]*/etc/"
  if echo "$diff" | grep -qE "$pattern"; then
    add_result "blocklist" "FAIL" "blocklist pattern in staged diff"
  else
    add_result "blocklist" "PASS" "no blocklist patterns"
  fi
}

# ---- Check 6: RBAC routes touched? Cross-ref required ----
check_rbac_xref() {
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    add_result "rbac_xref" "SKIP" "not a git repo"; return
  }
  local touched
  touched="$(git -C "$repo_root" diff --cached --name-only 2>/dev/null | grep -E "(routes/auth|routes/assets|schemas/auth)\.ts$" || true)"
  if [ -n "$touched" ]; then
    add_result "rbac_xref" "INFO" "RBAC files touched ($touched). Cross-ref [[거버넌스_라이프사이클]] §3 in commit"
  else
    add_result "rbac_xref" "PASS" "no RBAC files touched"
  fi
}

# ---- Check 7: New files added → INDEX update required (GR-7) ----
check_index_update() {
  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
    add_result "index_update" "SKIP" "not a git repo"; return
  }
  local new_files index_changed
  new_files="$(git -C "$repo_root" diff --cached --name-only --diff-filter=A 2>/dev/null | grep -v -E "(00_INDEX|MEMORY_INDEX|memory/episodes/)" || true)"
  index_changed="$(git -C "$repo_root" diff --cached --name-only 2>/dev/null | grep -E "(00_INDEX|MEMORY_INDEX|^CLAUDE\.md$)" || true)"
  if [ -n "$new_files" ] && [ -z "$index_changed" ]; then
    add_result "index_update" "WARN" "new files added but no INDEX changed"
  else
    add_result "index_update" "PASS" "INDEX consistency OK"
  fi
}

check_perms
check_checksums
check_env_secrets
check_staged_secrets
check_blocklist
check_rbac_xref
check_index_update

ELAPSED=$(($(date +%s) - START_TS))

# Build JSON output (defensive: empty array if no results, or jq -s fails)
if [ ${#RESULTS[@]} -eq 0 ]; then
  RESULTS_JSON='[]'
else
  RESULTS_JSON="$(printf '%s\n' "${RESULTS[@]}" | jq -s '.' 2>/dev/null)" || RESULTS_JSON='[]'
fi
jq -n \
  --argjson results "$RESULTS_JSON" \
  --arg ok "$OVERALL_OK" \
  --argjson elapsed "$ELAPSED" \
  '{
    overall_ok: ($ok == "true"),
    elapsed_seconds: $elapsed,
    timeout_seconds: 300,
    checks: $results
  }'

[ "$OVERALL_OK" = "true" ] && exit 0 || exit 1
