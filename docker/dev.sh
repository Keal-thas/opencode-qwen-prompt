#!/usr/bin/env bash
# Wrapper for `docker compose -f docker/docker-compose.yml` that gives
# each worktree its own isolated Compose project, so two worktrees
# running the sandbox at the same time never collide on the same
# container/network name (see docs/lessons-learned.md and TODO.md for
# the collision this replaces). Always launch the opencode-dev sandbox
# through this script, not `docker compose` directly.
#
# Usage: same arguments you'd pass to `docker compose -f
# docker/docker-compose.yml ...`, e.g.:
#   docker/dev.sh run --rm opencode-dev
#   docker/dev.sh run --rm opencode-dev bash tests/run-in-container.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# oracle is a genuinely shared fixture, not per-worktree state (see
# docker/docker-compose.oracle.yml's own header comment) - bring it up
# idempotently before starting/creating opencode-dev, replacing the
# in-file `depends_on` this design used to rely on (which can't reach
# across compose projects). `--wait` blocks until its healthcheck
# passes, same effect `depends_on: condition: service_healthy` used to
# have. Only for `run`/`up` (the subcommands that actually start a fresh
# opencode-dev container) - skip it for `build`, `down`, `exec`, etc.
# Must run before COMPOSE_PROJECT_NAME is exported below - that env var
# overrides a compose file's own top-level `name:`, and would otherwise
# hijack this fixed-name project too.
case "${1:-}" in
  run|up)
    docker compose -f docker/docker-compose.oracle.yml up -d --wait
    ;;
esac

if command -v sha256sum >/dev/null 2>&1; then
  WORKTREE_HASH="$(pwd | sha256sum | cut -c1-8)"
else
  WORKTREE_HASH="$(pwd | shasum -a 256 | cut -c1-8)"
fi
export COMPOSE_PROJECT_NAME="opencode-qwen-prompt-${WORKTREE_HASH}"

exec docker compose -f docker/docker-compose.yml "$@"
