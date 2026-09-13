#!/usr/bin/env bash
# Automates the manual verification procedure documented in
# docker/docker-notes.md ("Verifying the system-prompt override actually
# works") - until now that check was hand-run and undocumented as a test.
#
# NOTE on where this runs: unlike the rest of tests/, this script itself
# must run on the host, because it's the thing invoking `docker run` -
# nothing can launch a container from inside one without docker-in-docker,
# which this repo's sandbox deliberately doesn't set up (see docker-notes.md).
# It still honors the "never run opencode/node against the host" rule: the
# only thing docker itself does is start a throwaway container from the
# already-built dev image; every actual opencode invocation happens inside
# that container. It touches none of the sandbox's persistent named volumes
# (opencode-config/opencode-data) - the container gets its own throwaway
# HOME, so a real dev session's saved provider config is never at risk.
#
# Requires the dev image to already be built:
#   docker compose -f docker/docker-compose.yml build
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="opencode-qwen-prompt-dev:latest"

# The container's real ENTRYPOINT (docker-entrypoint.sh) chowns
# ~/.config + ~/.local for the `dev` user then drops root via runuser -
# we ride that as-is rather than overriding --entrypoint, so this exercises
# the same startup path a real `docker compose run` session does. The repo
# is bind-mounted read-only: this test never needs to write into it.
if ! OUTPUT="$(docker run --rm \
  -v "$REPO_ROOT:/home/dev/project:ro" \
  "$IMAGE" \
  bash -c '
    set -e
    mkdir -p ~/.config/opencode
    cat > ~/.config/opencode/opencode.jsonc <<CONFIGEOF
{
  "\$schema": "https://opencode.ai/config.json",
  "agent": {
    "build": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "plan": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "general": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" }
  }
}
CONFIGEOF
    opencode debug config
  ')"; then
  echo "FAIL: could not run $IMAGE. Build it first:"
  echo "  docker compose -f docker/docker-compose.yml build"
  exit 1
fi

fail=0
CUSTOM_PROMPT="$(cat "$REPO_ROOT/deploy/system-prompt.txt")"

check() {
  local agent="$1"
  local resolved
  resolved="$(printf '%s' "$OUTPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data['agent']['$agent']['prompt'])
")"
  if [[ "$resolved" != "$CUSTOM_PROMPT" ]]; then
    echo "FAIL: agent.$agent.prompt does not match deploy/system-prompt.txt verbatim"
    fail=1
  fi
  if [[ "$resolved" == *"interactive CLI tool that helps users with software engineering tasks"* ]]; then
    echo "FAIL: agent.$agent.prompt still looks like the untouched upstream default"
    fail=1
  fi
}

check build
check plan
check general

if [[ "$fail" -eq 0 ]]; then
  echo "PASS: docker sandbox resolves build/plan/general prompts to deploy/system-prompt.txt"
  exit 0
else
  echo "--- opencode debug config output ---"
  printf '%s\n' "$OUTPUT"
  exit 1
fi
