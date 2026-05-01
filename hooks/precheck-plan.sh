#!/usr/bin/env bash
# T-32B: PreToolUse Plan-mode enforcement.
# Blocks Edit/Write if no recent (mtime <60min) plan file in ~/.claude/plans/.
# Stdin JSON is consumed silently (hook protocol compliance).
#
# DEFENSE-IN-DEPTH: settings.json registers this hook with matcher "Edit|Write" so
# Claude Code only invokes it for those tools. If the matcher is mis-configured or
# the hook is invoked manually for testing, the gate still applies (conservative).

set -uo pipefail

# Drain stdin (Claude Code hooks send JSON; we ignore content but must consume).
cat >/dev/null 2>&1 || true

PLANS_DIR="${HOME}/.claude/plans"

if [ ! -d "$PLANS_DIR" ]; then
  echo "[precheck-plan.sh BLOCK] $PLANS_DIR does not exist." >&2
  echo "[precheck-plan.sh BLOCK] Author a plan via plan mode first." >&2
  exit 1
fi

RECENT="$(find "$PLANS_DIR" -maxdepth 2 -name '*.md' -type f -mmin -60 2>/dev/null | head -1)"

if [ -z "$RECENT" ]; then
  echo "[precheck-plan.sh BLOCK] No recent plan file (~/.claude/plans/*.md, mtime <60min)." >&2
  echo "[precheck-plan.sh BLOCK] Edit/Write blocked. Enter plan mode and write a plan first." >&2
  exit 1
fi

# Allow.
exit 0
