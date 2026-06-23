#!/bin/bash
# Run the light-mode navy → sage migration from repo root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Applying sage light-mode migration..."
node "$ROOT/scripts/apply-sage-light-mode.mjs"
echo ""
echo "Verifying no unpatched navy backgrounds remain (excluding marketing)..."
if command -v rg >/dev/null 2>&1; then
  UNPATCHED=$(rg 'bg-\[#1e2a3a\]|bg-\[#243347\]|bg-\[#0f1e3d\]|bg-\[#0f1623\]|bg-\[#161f30\]' "$ROOT/src" --glob '!(marketing)/**' | rg -v 'dark:bg-\[#' || true)
  if [ -n "$UNPATCHED" ]; then
    echo "WARNING — possible unpatched lines:"
    echo "$UNPATCHED"
  else
    echo "OK — all navy backgrounds use dark: variants for dark mode."
  fi
else
  echo "(install ripgrep to run verification)"
fi
