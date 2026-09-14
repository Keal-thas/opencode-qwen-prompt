# Docker dev/test sandbox — working notes

`Dockerfile` + `docker-compose.yml` + `docker-compose.oracle.yml` (all in `docker/`) give a local, isolated container for exercising this repo's prompt/plugins against a real `opencode` install, without touching the host's own opencode config or trusting an all-permission agent with anything outside the container.

## Launching it

Always go through `docker/dev.sh`, not `docker compose` directly — it isolates each worktree's Compose project so two worktrees running the sandbox at the same time never collide (see "Per-worktree isolation" below). Run from the repo root:

```sh
docker/dev.sh run --rm opencode-dev
```

Drops you into an interactive bash shell as the container's `dev` user. Each invocation creates a fresh container and destroys it on exit (`--rm`) — fine, since nothing that matters lives in the container's writable layer (see below).

For one long-lived container to `exec` into repeatedly instead: `docker/dev.sh up -d`, then `docker/dev.sh exec opencode-dev bash`.

## Per-worktree isolation

`docker/dev.sh` hashes the calling worktree's absolute path into `COMPOSE_PROJECT_NAME` before invoking `docker compose -f docker/docker-compose.yml`, so Compose auto-derives distinct project/network/container names per worktree (`docker-compose.yml` itself has no top-level `name:` or `container_name:` — letting Compose auto-derive both is what makes this collision-free). Verified live: 20 concurrent `run --rm` calls in one project never collided on a container name, and two different worktree paths (hashed to different `COMPOSE_PROJECT_NAME`s) ran fully concurrently with no interference — see [docs/lessons-learned.md](../docs/lessons-learned.md). No locking/serialization within a single worktree either — concurrent `docker/dev.sh run` calls from the *same* worktree are safe on their own.

The image tag (`opencode-qwen-prompt-dev:latest`) stays fixed and global on purpose, unlike the container name — rebuilding the multi-GB toolchain per worktree would be wasteful, and it doesn't depend on worktree identity. Known residual risk from that: see TODO.md's build-race item.

## What actually persists, and where

- **Nothing in `~/.config/opencode`/`~/.local/share/opencode` persists across containers anymore** — no named volumes for these (removed 2026-09-14; see docs/lessons-learned.md for why). They live entirely in the container's own writable layer and reset with it on every `--rm`. `docker-entrypoint.sh` (re)generates `opencode.jsonc` fresh on every start instead (see "Verifying the system-prompt override" below) — nothing else would ever populate it now.
- **The project directory itself persists via a live bind mount, not container-lifecycle persistence** — `docker-compose.yml` bind-mounts the repo root to `/home/dev/project`: edits to `deploy/system-prompt.txt` on the Mac host show up immediately, no rebuild. The `system-prompt-tools.ts` plugin does **not** get this anymore now that it loads from a committed tarball (`deploy/opencode-system-prompt-tools-1.0.0.tgz`) via a `file:` npm spec instead of the raw `.ts` path — editing the source needs `npm pack` in `deploy/` to refresh the tarball, and then an image rebuild (see "Plugin dependency pre-warming" below) since the install is pre-warmed into the image layer, not read fresh from the bind mount on every start.
- **The plugins' `node_modules`/package cache persist because they're baked into the image itself**, not a volume — see "Plugin dependency pre-warming" below.
- **`oracle`'s data persists in its own volume**, in its own compose project — see "Oracle test instance" below.
- **Does NOT persist** — anything else written inside the container (files elsewhere in `/home/dev/`, an ad-hoc `apt-get install`, other scratch state) — lives in the writable layer, wiped the moment `--rm` destroys it.

## Container user

Runs as `dev` (uid/gid 1000 by default, overridable via the `UID`/`GID` build args) — a plain Linux user created in the `Dockerfile`, unrelated to any Docker Hub/registry account.

## Dockerfile gotchas, if rewriting it from scratch

- `node:22-bookworm` already ships a `node` user/group at uid/gid 1000 — collides with creating `dev` at the same default IDs. Fixed by dropping the unused `node` user/group first.
- Everything the `dev` user needs to write to at runtime (`~/.config/opencode`, `~/.local/share/opencode`) is created and `chown`'d at build time now, not fixed up by the entrypoint at container start — there's no volume that would reset that ownership anymore.

## Plugin dependency pre-warming

The `system-prompt-tools.ts` plugin loads from a committed npm tarball (`deploy/opencode-system-prompt-tools-1.0.0.tgz`) via a `file:` spec in the `plugin` config array, not a raw file path (see CLAUDE.md and `docs/feature-points/02-system-prompt-tools-plugin.md` for why — `plugins/`'s `opencode-hook-plugins-1.0.0.tgz` already used this same pattern). Resolving a `plugin` entry — whether a `file:` tarball spec or a raw local path — makes opencode extract the package into `~/.cache/opencode/packages/` and install its own `@opencode-ai/plugin` dependency into `~/.config/opencode/node_modules`, once at **image build time** rather than on every container start. Without this, every fresh container (no more config volume - see above) would pay opencode's ~20-25s cold install on first use of a `plugin` config entry — measured, pure network wait. Paying it once at build time means every container already has it warm (measured: 0.6s vs 20-24s).

The Dockerfile does this by writing a temporary `opencode.jsonc` with the plugin wired in, then running `opencode debug config` as the `dev` user (so `HOME` resolves to `/home/dev`, matching where the entrypoint-generated config will look for it at runtime) — that alone reliably triggers and completes the install, ~50-60s wall time the first time, no real provider needed. Deliberately not `opencode run` for this — that has its own, unrelated hang bug in this sandbox (see [docs/lessons-learned.md](../docs/lessons-learned.md)). Verified directly in this sandbox with real network access cut (a broken `HTTP_PROXY`/`HTTPS_PROXY` forcing any outbound request to fail fast) that a `file:` tarball spec installs successfully with no network round-trip — this is what makes it safe to rely on for the actually-offline target machine.

If a plugin's dependencies change, `npm pack` its source directory to regenerate the committed tarball, then rebuild the image (`docker/dev.sh build`) to re-warm — same mental model as bumping `OPENCODE_VERSION`. Editing `deploy/system-prompt-tools.ts` on the host no longer takes effect in a running container without both steps, unlike `deploy/system-prompt.txt` (see "What actually persists, and where" above).

## Provider API keys — loaded from `~/.keys`, never in .zshrc or the repo

`docker-compose.yml` bind-mounts `${HOME}/.keys` read-only to `/home/dev/.keys`. `docker-entrypoint.sh` reads specific files from there into env vars (e.g. `DEEPSEEK_API_KEY` from `~/.keys/.deepseek-key`) before dropping to the `dev` user — scoped to that container's process tree only, nothing persisted to the Mac's shell environment or written into this repo. An already-set `DEEPSEEK_API_KEY` in the invoking shell still wins, for a one-off override.

To add a key for another provider: drop a file in `~/.keys/` (`chmod 700` the directory itself — a plain no-exec directory silently blocks all access, including your own `ls`), then add one `if [ -f ... ]; then export ...; fi` block to `docker-entrypoint.sh` following the existing DeepSeek one.

Claude never reads these key files' contents directly (only checks filenames/lengths) and never writes a real key into any file — a hard rule, independent of how low-stakes the key is claimed to be.

## Pinned version

`opencode-ai`'s version is pinned in exactly one place: `OPENCODE_VERSION` in `docker/.env` (committed, secret-free — see its own header comment). `docker compose` loads it automatically and passes it into the `Dockerfile`'s `ARG OPENCODE_VERSION`. Deliberately not `@latest`, so a rebuild months from now reproduces the same environment instead of silently picking up a newer opencode. Bump by editing that one line (check `npm view opencode-ai version` first), then `docker/dev.sh build`.

## Base image Node version

`FROM node:22-bookworm` (bumped from `node:20-bookworm` 2026-09-13 for the `plugins/` TypeScript rewrite — Node 20 has no native TS support at all, 22 runs `.ts` files with type annotations natively, no flag needed). If a future plugin needs TS syntax that isn't purely type-erasable (enums, `namespace`, parameter-property shorthand), that still needs an actual transpile step — Node's type-stripping only erases annotations. Full story, and an unrelated `node --test` regression this bump surfaced: [docs/lessons-learned.md](../docs/lessons-learned.md).

## Oracle test instance, for exercising mcp/oracle/

Lives in its own compose file/project, `docker/docker-compose.oracle.yml` (fixed project name `opencode-qwen-prompt-oracle`), separate from `docker-compose.yml`'s per-worktree one — it's a genuinely shared, read-mostly test fixture, not per-worktree state, and would be forced into per-worktree isolation if it stayed in the same file (see "Per-worktree isolation" above). `oracle` (image `gvenzl/oracle-free`, version pinned via `ORACLE_FREE_VERSION` in `docker/.env`, same reasoning as `OPENCODE_VERSION`) gives `mcp/oracle/` a real Oracle instance to test against.

**`docker/dev.sh` brings it up automatically before `run`/`up`, by deliberate choice** — `docker compose -f docker/docker-compose.oracle.yml up -d --wait`, idempotent, blocking until healthy. This replaces the `depends_on: condition: service_healthy` the old single-file design used; `depends_on` can't reach across separate compose projects, which is what splitting `oracle` out required. Accepted tradeoffs (weighed against the risk of a forgotten manual start):
- idle RAM/CPU for `oracle` on every sandbox session, even ones unrelated to it
- on a fresh machine or wiped volume, first-time DB init (1-3 min) blocks every `opencode-dev` invocation via `dev.sh`, not just ones touching `mcp/oracle/`
- `docker/dev.sh` fails outright if `oracle` can't become healthy

First-time init takes 1-3 minutes and only happens once — the `oracle-data` volume (in `docker-compose.oracle.yml`'s own project) persists it. Once warm, later starts are `healthy` within seconds. `oracle` keeps running after a `run --rm opencode-dev` session exits, and across every worktree — stop it explicitly with `docker compose -f docker/docker-compose.oracle.yml down`.

Reachable from `opencode-dev` as `oracle:1521/FREEPDB1` via Compose service-name DNS, even though the two containers belong to different compose projects — `docker-compose.yml` joins `docker-compose.oracle.yml`'s network as `external: true` (both declare the same fixed network name, `opencode-qwen-prompt-oracle-net`), and Compose's service-name DNS resolution works per-network, not per-project. `opencode-dev`'s `environment` block pre-wires `ORACLE_CONNECT_STRING`/`ORACLE_USER`/`ORACLE_PASSWORD` to match, so `cd mcp/oracle && npm install && npm start` just works with zero setup. Credentials (`ORACLE_APP_USER`/`ORACLE_APP_USER_PASSWORD` in `docker/.env`) are throwaway sandbox fixtures, never exposed outside this docker network.

## Loki test instance, for exercising mcp/loki/

Same shared-fixture shape as the Oracle section above: its own compose file/project, `docker/docker-compose.loki.yml` (fixed project name `opencode-qwen-prompt-loki`), separate from `docker-compose.yml`'s per-worktree one. `loki` (image `grafana/loki`, version pinned via `LOKI_VERSION` in `docker/.env`, same reasoning as `OPENCODE_VERSION`/`ORACLE_FREE_VERSION` — pins the *sandbox's test instance* only, not a requirement `mcp/loki/server.js` itself imposes, since the Loki HTTP query API it calls has been stable across 2.x/3.x) gives `mcp/loki/` a real Loki instance to test against. Runs with its stock default config (`auth_enabled: false`, filesystem storage) — no mounted config file needed, confirmed by reading the image's real upstream `cmd/loki/loki-docker-config.yaml` rather than assumed.

**`docker/dev.sh` brings it up automatically before `run`/`up`**, same as `oracle`, but readiness is checked differently: `loki`'s official image is built `FROM gcr.io/distroless/static:nonroot` (confirmed from its real upstream `cmd/loki/Dockerfile`) — no shell, `wget`, or `curl` inside the container, so it can't run a Docker `HEALTHCHECK` the way `gvenzl/oracle-free` does. `docker/dev.sh` instead publishes the container's port to `127.0.0.1:3100` and polls `/ready` from the host in a short retry loop after `up -d` (no `--wait`, since there's no healthcheck for it to wait on). Loki has no slow first-time DB init like Oracle's, so this is normally sub-second — the retry loop is a safety margin, not an expected wait.

First-time init is effectively instant (no schema/DB bootstrap) — the `loki-data` volume (in `docker-compose.loki.yml`'s own project) still persists ingested test data across container restarts, same pattern as `oracle-data`. `loki` keeps running after a `run --rm opencode-dev` session exits, and across every worktree — stop it explicitly with `docker compose -f docker/docker-compose.loki.yml down`.

Reachable from `opencode-dev` as `loki:3100` via Compose service-name DNS, same `external: true` shared-network join as `oracle-net` (`opencode-qwen-prompt-loki-net`). `opencode-dev`'s `environment` block pre-wires `LOKI_BASE_URL=http://loki:3100`, so `cd mcp/loki && npm install && npm start` just works with zero setup. No credentials needed — the sandbox's `loki` runs unauthenticated, matching `mcp/loki/README.md`'s "auth is optional" design.

## Verifying the system-prompt override actually works

**Automatic now, not a manual step.** `docker-entrypoint.sh` (re)generates `~/.config/opencode/opencode.jsonc` fresh on every container start — `agent.build/plan/general.prompt` wired to `/home/dev/project/deploy/system-prompt.txt` (the bind-mounted, live file) and the diagnostic plugin loaded via `file:/home/dev/project/deploy/opencode-system-prompt-tools-1.0.0.tgz` (the committed tarball, pre-warmed into the image — see "Plugin dependency pre-warming" above). There's no config volume to hand-edit anymore.

Automated end-to-end in `../tests/integration/docker-prompt-override.test.sh` (run via `../tests/run-all.sh`) — launches its own disposable container (via plain `docker run`, not `docker/dev.sh`, since it's testing the container's own startup path directly) and asserts `opencode debug config` resolves `agent.*.prompt` to `system-prompt.txt`'s exact content.

To reproduce by hand inside an interactive `docker/dev.sh run --rm opencode-dev` session, just run `opencode debug config` directly — the config is already there, generated by the entrypoint before your shell even started.
