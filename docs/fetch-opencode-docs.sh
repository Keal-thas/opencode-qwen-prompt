#!/usr/bin/env bash
# Fetches the top-level English opencode docs pages (upstream
# anomalyco/opencode, dev branch, packages/web/src/content/docs/) into
# docs/opencode-docs-reference/. Committed on purpose (not gitignored):
# the actual target machine has no internet access at all, so this
# travels with the repo in the zip transfer, and whoever is deploying or
# troubleshooting there can read the real docs instead of opencode.ai/docs.
#
# Only the top-level English .mdx files - the API also lists ~17 locale
# subdirectories (ar/, de/, zh-cn/, ...) alongside them; skipped on
# purpose, English-only mirror.
#
# Usage: ./docs/fetch-opencode-docs.sh
# Needs: curl, python3 (both already assumed elsewhere in this repo).

set -euo pipefail

REPO="anomalyco/opencode"
BRANCH="dev"
DOC_PATH="packages/web/src/content/docs"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/opencode-docs-reference"

mkdir -p "$OUT_DIR"

api_url="https://api.github.com/repos/${REPO}/contents/${DOC_PATH}?ref=${BRANCH}"
listing=$(curl -sf "$api_url")

error=$(echo "$listing" | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(d.get('message', '') if isinstance(d, dict) else '')
")
if [[ -n "$error" ]]; then
  echo "GitHub API error: $error" >&2
  exit 1
fi

files=$(echo "$listing" | python3 -c "
import json, sys
for item in json.load(sys.stdin):
    if item['type'] == 'file':
        print(item['name'] + '\t' + item['download_url'])
")

count=0
while IFS=$'\t' read -r name url; do
  [[ -z "$name" ]] && continue
  curl -sf "$url" -o "$OUT_DIR/$name"
  echo "[fetched] $name"
  count=$((count + 1))
done <<< "$files"

echo "Done: $count files into $OUT_DIR"
