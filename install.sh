#!/usr/bin/env bash
# Stage 2 hook installer.
# Stages from repo `hooks/` → ~/.claude/team-hooks/.
# Generates .checksums.json for SHA-256 integrity verification (T-32C check #2).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$REPO_ROOT/hooks"
TARGET="$HOME/.claude/team-hooks"

if [ ! -d "$SOURCE" ]; then
  echo "ERROR: hooks/ directory missing at $SOURCE" >&2
  exit 1
fi

mkdir -p "$TARGET"

EXEC_FILES=(send-event.sh precheck-plan.sh precommit-check.sh scan-secrets.js)
DATA_FILES=(scanner-allowlist.ts)

for f in "${EXEC_FILES[@]}" "${DATA_FILES[@]}"; do
  if [ ! -f "$SOURCE/$f" ]; then
    echo "ERROR: missing source $SOURCE/$f" >&2
    exit 1
  fi
  cp "$SOURCE/$f" "$TARGET/$f"
done

for f in "${EXEC_FILES[@]}"; do
  chmod 0755 "$TARGET/$f"
done
for f in "${DATA_FILES[@]}"; do
  chmod 0644 "$TARGET/$f"
done

# Portable sha256
sha256_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# Atomic write: tmp file + rename to avoid partial-state on rapid re-install.
TMP_SUMS="$TARGET/.checksums.json.tmp.$$"
{
  echo "{"
  total_files=("${EXEC_FILES[@]}" "${DATA_FILES[@]}")
  count=${#total_files[@]}
  i=0
  for f in "${total_files[@]}"; do
    i=$((i+1))
    sum="$(sha256_cmd "$TARGET/$f")"
    if [ $i -lt $count ]; then
      printf '  "%s": "%s",\n' "$f" "$sum"
    else
      printf '  "%s": "%s"\n' "$f" "$sum"
    fi
  done
  echo "}"
} > "$TMP_SUMS"
mv -f "$TMP_SUMS" "$TARGET/.checksums.json"

echo "✅ Installed to $TARGET"
echo "  exec: ${EXEC_FILES[*]}"
echo "  data: ${DATA_FILES[*]}"
echo "  checksums: .checksums.json"
ls -la "$TARGET"
