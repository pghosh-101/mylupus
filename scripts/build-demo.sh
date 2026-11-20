#!/usr/bin/env bash
# Builds the public web demo into dist-demo/.
# - EXPO_PUBLIC_DEMO=1 turns on demo mode (sample data, pre-written AI answers, no API calls).
# - EXPO_NO_DOTENV=1 stops Expo from reading .env files, so no API key can end up in the build.
# - Afterwards the output is scanned for anything that looks like a key, and the build fails if found.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=dist-demo
BASE="${EXPO_BASE_URL:-/mylupus}"
rm -rf "$OUT"
EXPO_NO_DOTENV=1 EXPO_PUBLIC_DEMO=1 EXPO_BASE_URL="$BASE" CI=1 npx expo export --platform web --output-dir "$OUT"

# GitHub Pages: don't run Jekyll (it would hide the _expo folder).
touch "$OUT/.nojekyll"

echo "Checking the build for API keys..."
fail=0
if grep -rEl "sk-ant-[A-Za-z0-9_-]{8,}" "$OUT" >/dev/null 2>&1; then
  echo "FOUND an Anthropic-style key in the build"; fail=1
fi
# Any value from local .env files must not appear in the output.
for f in .env .env.local .env.*.local; do
  [ -f "$f" ] || continue
  while IFS='=' read -r name value; do
    value="${value%\"}"; value="${value#\"}"
    [ -n "$value" ] && [ ${#value} -ge 8 ] || continue
    if grep -rqF -- "$value" "$OUT"; then echo "FOUND the value of $name (from $f) in the build"; fail=1; fi
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$f")
done
if [ "$fail" -ne 0 ]; then echo "Build contains secrets. Not safe to publish."; exit 1; fi
echo "No keys found. $OUT/ is safe to publish."
