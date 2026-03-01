#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PATTERN='rgba\(var\(--rgb-(white|black)\),'
MATCHES="$(rg -n --no-heading "$PATTERN" . --glob "*.css" --glob "*.ts" --glob "*.tsx" | rg -v '^\./styles/tokens\.css:' || true)"

if [[ -n "$MATCHES" ]]; then
  echo "Error: Direct rgba(var(--rgb-white|--rgb-black), ...) usage is disallowed outside styles/tokens.css."
  echo "Use semantic primitives (--rgb-ui-surface, --rgb-ui-contrast, --rgb-ui-scrim) instead."
  echo
  echo "$MATCHES"
  exit 1
fi

echo "OK: no direct literal rgb primitive rgba() usage found outside styles/tokens.css."
