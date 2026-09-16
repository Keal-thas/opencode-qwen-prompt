#!/usr/bin/env bash
# Refreshes deploy/models-dev-snapshot.json from the real models.dev
# catalog. Committed to git on purpose, and also listed in .gitignore -
# same reasoning as docs/opencode-docs-reference/ (see
# docs/fetch-opencode-docs.sh): the target machine has no internet at
# all, so this travels with the repo in the zip transfer (SETUP.md step
# 3), but it's generated data, not hand-authored content, so it's kept
# out of broad recursive search.
#
# Needs a real opencode install with internet access - runs `opencode
# models --refresh` inside this repo's own docker sandbox (never
# against the host's own opencode install, per CLAUDE.md), which caches
# the catalog at ~/.cache/opencode/models.json, then copies that out via
# the sandbox's live bind mount of the project directory.
#
# Usage: ./deploy/fetch-models-snapshot.sh

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

docker/dev.sh run --rm opencode-dev bash -c '
  opencode models --refresh >/dev/null
  cp ~/.cache/opencode/models.json /home/dev/project/deploy/models-dev-snapshot.json
'

echo "Done: deploy/models-dev-snapshot.json refreshed"
