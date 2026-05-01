#!/usr/bin/env bash
# T-13: Hooks Wrapper Script
# Reads stdin JSON (Claude Code hook protocol), emits event to TEAM_HOOKS_URL.
# Honors TEAM_HOOKS_DRY_RUN=1 → echo intent to stderr, no curl.
# Fire-and-forget: backgrounds curl so hook never blocks tool flow.

set -uo pipefail

EVENT_TYPE="${1:-tool_call}"
PAYLOAD="$(cat || true)"

# Empty stdin is OK (e.g. SessionStart may send empty). Continue with defaults.
extract() { [ -z "$PAYLOAD" ] && { echo ""; return; }; echo "$PAYLOAD" | jq -r "$1 // empty" 2>/dev/null || echo ""; }
extract_n() { [ -z "$PAYLOAD" ] && { echo 0; return; }; echo "$PAYLOAD" | jq -r "$1 // 0" 2>/dev/null || echo 0; }
extract_b() { [ -z "$PAYLOAD" ] && { echo true; return; }; echo "$PAYLOAD" | jq -r "$1 // true" 2>/dev/null || echo true; }

TOOL_NAME="$(extract '.tool_name')"
TOOL_USE_ID="$(extract '.tool_use_id')"
SESSION_ID="$(extract '.session_id')"
SOURCE="$(extract '.source')"
[ -z "$SOURCE" ] && SOURCE="claude-code"
DURATION_MS="$(extract_n '.duration_ms')"
SUCCESS="$(extract_b '.success')"

# Validate numeric/boolean fields before passing to jq --argjson (avoids silent jq failure)
case "$DURATION_MS" in ''|*[!0-9]*) DURATION_MS=0 ;; esac
case "$SUCCESS" in true|false) ;; *) SUCCESS=true ;; esac

# T-28: MCP tool_name extraction (already covered by .tool_name)
# T-14: skill_trigger detection (extract metadata.skill_name when tool=Skill)
SKILL_NAME=""
if [ "$TOOL_NAME" = "Skill" ]; then
  SKILL_NAME="$(extract '.tool_input.metadata.skill_name')"
  [ -z "$SKILL_NAME" ] && SKILL_NAME="$(extract '.tool_input.skill')"
fi

EVENT_JSON="$(jq -n \
  --arg type "$EVENT_TYPE" \
  --arg user "${TEAM_USER_ID:-unknown}" \
  --arg tool "$TOOL_NAME" \
  --arg tuid "$TOOL_USE_ID" \
  --arg sid "$SESSION_ID" \
  --arg src "$SOURCE" \
  --arg skill "$SKILL_NAME" \
  --argjson dur "$DURATION_MS" \
  --argjson ok "$SUCCESS" \
  '{
    type: $type,
    user_id: $user,
    tool_name: $tool,
    tool_use_id: $tuid,
    session_id: $sid,
    source: $src,
    skill_name: (if $skill == "" then null else $skill end),
    duration_ms: $dur,
    success: $ok,
    timestamp: now
  }' 2>/dev/null)"

# Bail out silently if jq construction failed (no event sent, hook returns 0 to not block).
if [ -z "$EVENT_JSON" ]; then
  echo "[send-event.sh] WARNING: jq event construction failed, skipping send" >&2
  exit 0
fi

if [ "${TEAM_HOOKS_DRY_RUN:-0}" = "1" ]; then
  echo "[send-event.sh DRY_RUN] event=$EVENT_TYPE tool=${TOOL_NAME:-_} user=${TEAM_USER_ID:-unknown}${SKILL_NAME:+ skill=$SKILL_NAME}" >&2
  exit 0
fi

URL="${TEAM_HOOKS_URL:-}"
KEY="${HOOKS_API_KEY:-}"
if [ -n "$URL" ] && [ -n "$KEY" ]; then
  (curl -sS --max-time 5 -X POST "${URL}/hooks/event" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -d "$EVENT_JSON" \
    >/dev/null 2>&1 &)
fi

exit 0
