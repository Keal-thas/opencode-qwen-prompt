# TODO

Concrete, actionable follow-up work for this repo. Different from README.md's "Status / open items" (known limitations/facts about the current setup) — this file is things that should actually get done. Remove an item once it's done instead of leaving it checked off.

- **Let `docker/` sandbox support concurrent use across worktrees/agents.** Added 2026-09-13. Currently only one worktree/agent can build or run it at a time: `docker-compose.yml` pins a fixed Compose project name and container name so its named volumes persist regardless of which worktree invokes it — but that means two concurrent `docker compose run`/`up` calls from different worktrees collide on that same container name. Worse than a flaky retry: the bind-mounted repo path is relative per worktree, so whichever container wins the name race decides which worktree's files actually end up mounted inside it. Confirmed by reading `docker/docker-compose.yml`, not by reproducing the race live.

  **Decided direction (Franco, 2026-09-14):** isolate per worktree, not globally — derive the project/container name from the worktree path so two worktrees never collide. Within a single worktree, don't add locking/serialization for concurrent `docker compose run` invocations — that's on the caller to manage.

  **Design** (worked out 2026-09-13/14, not yet implemented):
  - Hash the worktree's absolute path into `COMPOSE_PROJECT_NAME` (stable per worktree, not random — avoids leaking a new default network per invocation).
  - Drop both `container_name:` overrides, let Compose auto-derive names (verified: 20 concurrent `docker compose run --rm` in the same project never collided; the shared per-project default network races on creation but Compose swallows the "already exists" error and every run still exits 0 — benign).
  - Drop the `opencode-config`/`opencode-data` named volumes entirely rather than trying to keep them shared (verified: with no plugin configured, not persisting them costs ~0; with a plugin configured it's a real ~20-24s cold penalty, because opencode reinstalls the plugin's dependency tree into `~/.config/opencode/node_modules` from scratch every time — reproduced 3x).
  - Eliminate that cost by pre-installing the plugin's `node_modules` at Docker image build time instead (verified: a container `commit`ted after that install starts warm, ~0.6s, no volume needed — paid once per image build, already shared across worktrees).
  - Keep `oracle` genuinely shared by splitting it into its own `docker/docker-compose.oracle.yml` with a fixed project name; `opencode-dev`'s (now worktree-hashed) project joins it over an `external: true` Docker network instead of `depends_on` in the same file.

  Full writeup with reasoning and measurements: `.local/docker-sandbox-concurrency-design-2026-09-13.md` (gitignored scratch — check git history if it's gone).

  Two residual risks, deliberately deferred (small, separate from the collision above — see the two items below).

- **Oracle singleton first-time-startup race (deferred).** Added 2026-09-13, arises from the design above (not yet implemented). If two worktrees both race to bring up the shared Oracle container for the very first time ever on a machine, one `docker compose up -d` succeeds and the other gets a real, non-zero-exit `Conflict: container name already in use` error. Once Oracle is already running, later concurrent `up -d` calls from any worktree are fine (idempotent reconcile). Narrow window, low blast radius (just retry) — a `flock`-style lock around "ensure Oracle is up" in the wrapper script would close it if it ever actually bites.

- **Docker image tag (`opencode-qwen-prompt-dev:latest`) build race across worktrees (deferred).** Added 2026-09-13, arises from the design above. The image is deliberately global/shared across all worktrees (rebuilding a multi-GB toolchain image per worktree would be wasteful) — so it sits outside the worktree-hash isolation on purpose. If two worktrees have different uncommitted `Dockerfile` content and both run `docker compose build` around the same time, whichever finishes last silently wins the `:latest` tag — the other's successful build just becomes untagged/dangling, and that worktree's next `docker compose run` quietly uses someone else's image instead of the one it just built, with no error. Same "small, deferred" treatment as the Oracle race above.
