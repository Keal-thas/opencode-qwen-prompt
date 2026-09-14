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

# oracle/loki are genuinely shared fixtures, not per-worktree state (see
# each compose file's own header comment) - bring them up idempotently
# before starting/creating opencode-dev, replacing the in-file
# `depends_on` this design used to rely on (which can't reach across
# compose projects). Only for `run`/`up` (the subcommands that actually
# start a fresh opencode-dev container) - skip it for `build`, `down`,
# `exec`, etc. Must run before COMPOSE_PROJECT_NAME is exported below -
# that env var overrides a compose file's own top-level `name:`, and
# would otherwise hijack these fixed-name projects too.
case "${1:-}" in
  run|up)
    # `--wait` blocks until its healthcheck passes, same effect
    # `depends_on: condition: service_healthy` used to have.
    docker compose -f docker/docker-compose.oracle.yml up -d --wait

    # loki has no Docker HEALTHCHECK to `--wait` on - its official image
    # is distroless (no shell/wget/curl inside the container to run one -
    # see docker-compose.loki.yml's own comment), so poll its published
    # port from the host instead. Loki has no slow first-time-init like
    # Oracle's DB creation, so this is normally sub-second.
    docker compose -f docker/docker-compose.loki.yml up -d
    for _ in $(seq 1 30); do
      curl -sf http://127.0.0.1:3100/ready >/dev/null 2>&1 && break
      sleep 1
    done
    ;;
esac

if command -v sha256sum >/dev/null 2>&1; then
  WORKTREE_HASH="$(pwd | sha256sum | cut -c1-8)"
else
  WORKTREE_HASH="$(pwd | shasum -a 256 | cut -c1-8)"
fi
export COMPOSE_PROJECT_NAME="opencode-qwen-prompt-${WORKTREE_HASH}"

exec docker compose -f docker/docker-compose.yml "$@"
