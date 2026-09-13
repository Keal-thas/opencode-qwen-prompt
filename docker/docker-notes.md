# Docker dev/test sandbox — working notes

`Dockerfile` + `docker-compose.yml` (both here in `docker/`) give a
local, isolated container for exercising this repo's prompt/plugins
(`deploy/system-prompt.txt`, `deploy/opencode.json.example`,
`plugins/hook-logger.ts`, `plugins/llm-review-gate.ts`, ...) against a
real `opencode` install, without touching the host machine's own
opencode config and without needing to trust an all-permission agent
with anything outside the container.

## Launching it

Run from the repo root:

```sh
docker compose -f docker/docker-compose.yml run --rm opencode-dev
```

Drops you into an interactive bash shell as the container's `dev` user.
Each invocation creates a brand-new container and destroys it on exit
(`--rm`) — it is **not** restarting a stopped container, it's a fresh
one from the image every time. This is fine because nothing that
matters lives in the container's own writable layer (see below).

If you want one long-lived container to `exec` into repeatedly instead
of a fresh one per command, use `docker compose -f docker/docker-compose.yml up -d` +
`docker compose -f docker/docker-compose.yml exec opencode-dev bash` instead.
(The `-f` flag is only needed because this compose file isn't at the
repo root; drop it if you `cd docker/` first.)

## What actually persists, and where

Verified experimentally (2026-09-13): wrote a marker file under a
volume path and another outside any mount, across two separate
`run --rm` invocations.

- **Persists** — anything under the two named-volume mount points:
  - `~/.config/opencode/**` (volume `opencode-config`) — this is where
    the real `opencode` binary puts `opencode.jsonc` + `.gitignore`
    (confirmed against the actual binary, not docs — `XDG_CONFIG_HOME`
    is unset in the container so it falls back to the Linux XDG
    default of `$HOME/.config`).
  - `~/.local/share/opencode/**` (volume `opencode-data`) — this is
    where it puts `opencode.db` (+ `-shm`/`-wal`), `repos/`, and
    `log/opencode.log`. Same XDG-default reasoning, via
    `$HOME/.local/share`.
  - These survive `docker compose run --rm` (container destroyed every
    time), `docker compose down` (without `-v`), and `docker compose
    build` (image rebuilt). They do **not** survive `docker compose
    down -v`, an explicit `docker volume rm`, or a full Docker Desktop
    reset — those actually delete the volumes.
- **Also persists, different mechanism** — the project directory
  itself: `docker-compose.yml` bind-mounts the repo root (this repo on
  the Mac host) to `/home/dev/project`. This isn't container-lifecycle
  persistence, it's a live two-way link to the host filesystem — edit
  on the Mac, see it immediately in the container, and vice versa.
- **Does NOT persist** — anything else written inside the container
  (a file dropped in `/home/dev/` outside those two paths, an `apt-get
  install` run by hand inside a shell, scratch state anywhere else).
  That all lives in the container's writable layer, which is wiped the
  moment `--rm` destroys it.

The volumes live inside Docker Desktop's own VM disk image, not at a real Mac filesystem path — the path `docker volume inspect` prints is inside that VM. Don't try to touch it directly; go through `docker volume` or a throwaway container with `-v` if you need to look inside one.

## Container user

The container runs as `dev` (uid/gid 1000 by default, overridable via
the `UID`/`GID` build args in `docker-compose.yml`), not root. Has
nothing to do with any Docker Hub / registry account — it's just a
Linux user created in the `Dockerfile`, scoped entirely to inside the
container.

## Two bugs fixed after the first build (2026-09-13)

Worth remembering if the `Dockerfile` ever gets rewritten from scratch:

1. `node:22-bookworm` (was `node:20-bookworm` until the `plugins/`
   rewrite to TypeScript needed native type-stripping support — see
   below) already ships a `node` user/group at uid/gid
   1000 — collides with creating `dev` at the same default IDs.
   Fixed by dropping the unused `node` user/group first.
2. Docker creates named volumes root-owned before the image's `USER`
   directive takes effect, so `dev` got `EACCES` writing into
   `~/.config/opencode` / `~/.local/share/opencode` on first run.
   Fixed via `docker-entrypoint.sh`: container starts as root, chowns
   those two mount points to `dev`, then drops privileges with
   `runuser` before exec'ing the real command.

## Provider API keys — loaded from `~/.keys`, never in .zshrc or the repo

`docker-compose.yml` bind-mounts `${HOME}/.keys` read-only to
`/home/dev/.keys`. `docker-entrypoint.sh` reads specific files from
there into env vars (e.g. `DEEPSEEK_API_KEY` from
`~/.keys/.deepseek-key`) *before* dropping to the `dev` user — scoped
to that one container's process tree only, nothing persisted to the
Mac's shell environment, nothing written into this repo or any git-
tracked file. An already-set `DEEPSEEK_API_KEY` in the invoking shell
still wins (see the `environment:` passthrough in `docker-compose.yml`)
if you ever want a one-off override.

To add a key for another provider: drop a file in `~/.keys/`
(`chmod 700` the directory itself — a plain `700`/no-exec directory
silently blocks all access, including your own `ls`, learned the hard
way 2026-09-13), then add one `if [ -f ... ]; then export ...; fi`
block to `docker-entrypoint.sh` following the existing DeepSeek one.

Claude never reads these key files' contents directly (only checks
filenames/lengths) and never writes a real key into any file — that's
a hard rule, independent of how low-stakes the key is claimed to be.

## Pinned version

`opencode-ai`'s version is pinned in exactly one place:
`OPENCODE_VERSION` in `docker/.env` (a committed, secret-free config
file - see its own header comment). `docker compose` loads it
automatically (it sits next to `docker-compose.yml`) and passes it into
the `Dockerfile`'s `ARG OPENCODE_VERSION`. Deliberately not `@latest`,
so a rebuild months from now reproduces the same environment instead of
silently picking up a newer opencode. Bump it by editing that one line
in `docker/.env` (check `npm view opencode-ai version` for the current
release first), then `docker compose -f docker/docker-compose.yml build`.

## Base image Node version

`FROM node:22-bookworm` — bumped from `node:20-bookworm` (2026-09-13)
when `plugins/hook-logger.js`/`plugins/llm-review-gate.js` were rewritten
in TypeScript against `@opencode-ai/plugin`'s `Plugin` type. Verified
directly (not assumed): downloaded real `node-v20.18.1` and
`node-v22.23.2` darwin-arm64 builds and ran `node --test` against the
rewritten `.ts` plugin unit tests on each — Node 20 has no TypeScript
support at all (not even behind a flag; `--experimental-strip-types`
doesn't exist on it), Node 22.23.2 runs `.ts` files with type
annotations natively, no flag needed. Node 20 ("Iron") was also at or
past its own LTS end-of-life by the time of this bump anyway. If a
future plugin needs TS syntax that isn't purely type-erasable (enums,
`namespace`, parameter-property shorthand), those still need an actual
transpile step — Node's type-stripping only erases annotations, it
doesn't compile.

This bump also broke `tests/run-in-container.sh`'s `node --test
tests/unit` invocation in an unrelated way: on Node 20 a bare directory
argument gets auto-scanned for test files, but on Node 22 it throws
`ERR_MODULE_NOT_FOUND` (tries to resolve the directory path as a single
module instead). Caught by actually running `./tests/run-all.sh`
end-to-end against the real rebuilt image, not by reasoning about the
Node bump in isolation. Fixed by switching that line to an explicit
glob, `node --test tests/unit/*.test.mjs`, which works on both
versions. Full pipeline (build + unit tests + both integration tests)
verified green after the fix, 2026-09-13.

## Oracle test instance, for exercising mcp/oracle/

A second service in `docker-compose.yml`, `oracle` (image `gvenzl/oracle-free`, version pinned via `ORACLE_FREE_VERSION` in `docker/.env` next to `OPENCODE_VERSION` - same reasoning, same file), gives `mcp/oracle/` a real Oracle instance to run against instead of only being tested via a manually-launched throwaway container each time (which is how it was first verified, 2026-09-13 - see `docs/feature-points/13-oracle-mcp-server.md`).

**Starts automatically, every time - no manual step, by deliberate choice.** `opencode-dev` declares `depends_on: oracle: condition: service_healthy`, so both `docker compose run --rm opencode-dev` and a bare `docker compose up -d` bring `oracle` up and wait for its healthcheck before `opencode-dev` itself starts - verified experimentally (2026-09-13) for both invocation styles. An earlier version of this gated `oracle` behind `profiles: ["oracle"]` so it stayed opt-in; that was deliberately reversed the same day after weighing it against the risk of a forgotten manual start (a human or an agent testing `mcp/oracle/` simply not remembering to bring the DB up first) - see git history for the opt-in version if useful as a reference. The accepted tradeoffs, spelled out because they're easy to forget once this reads as "just how it works":
- idle RAM/CPU for `oracle` on every sandbox session, including ones that have nothing to do with it
- on a brand-new machine or a wiped `oracle-data` volume, the DB's 1-3 minute first-time init blocks *every* `run --rm opencode-dev` invocation until that volume is warm, not just ones that touch `mcp/oracle/`
- `opencode-dev` now fails to start at all if `oracle` can't become healthy (disk full, corrupted volume, bad pull) - a failure in a part of the sandbox unrelated to whatever you're actually doing can block everything

First-time init (creating the `FREE` database and its `FREEPDB1` pluggable DB from scratch) takes 1-3 minutes. That only happens once - the `oracle-data` named volume persists it across `docker compose down`/container recreation the same way `opencode-config`/`opencode-data` do (see "What actually persists" above). Measured (2026-09-13): once that volume is warm, a later start was already `healthy` within a few seconds, not minutes. Once started, `oracle` keeps running in the background even after a `run --rm opencode-dev` session exits (`--rm` only tears down the `opencode-dev` container it created, not services it depends on) - stop it explicitly with `docker compose stop oracle && docker compose rm -f oracle`, or `docker compose down` for everything.

From inside `opencode-dev`, it's reachable as `oracle:1521/FREEPDB1` via Compose's default service DNS - no extra network config, both services land on the same `opencode-qwen-prompt_default` network automatically. `opencode-dev`'s own `environment` block pre-wires `ORACLE_CONNECT_STRING`/`ORACLE_USER`/`ORACLE_PASSWORD` to point at it (matching the env var names `mcp/oracle/server.js` reads), so testing needs zero setup inside the container - `cd mcp/oracle && npm install && npm start` just works. Credentials (`ORACLE_APP_USER` / `ORACLE_APP_USER_PASSWORD` in `docker/.env`) are throwaway sandbox fixtures, not real secrets, same as `OPENCODE_VERSION` being a plain committed value - never exposed outside this docker network.

Gotcha found while verifying this (2026-09-13, not a docker-compose issue): a standalone Node script using `@modelcontextprotocol/sdk`'s `StdioClientTransport` to spawn `mcp/oracle/server.js` directly does **not** inherit the parent process's environment by default - it needs an explicit `env: process.env` (or specific keys) passed in the transport config, or the spawned server sees none of the `ORACLE_*` vars and exits immediately. Plain `npm start`/`node server.js` from an interactive shell doesn't hit this (a shell-spawned child always inherits its parent's env) - it only bites a client that spawns the server itself. Worth checking whether opencode's own `local` MCP server spawning has the same non-inheriting default before wiring `mcp/oracle/` into `deploy/opencode.json.example` - its `mcp.<name>.environment` config field (see `docs/opencode-docs-reference/mcp-servers.mdx`) suggests it might.

## Verifying the system-prompt override actually works

**Status: user-confirmed working, 2026-09-13.** Automated as of 2026-09-13 in `../tests/integration/docker-prompt-override.test.sh` (run via `../tests/run-all.sh`) — it launches its own disposable container from this image and scripts the exact `opencode debug config` check below, rather than needing a human to re-paste it by hand each time.

The manual version, if you want to reproduce it by hand inside an interactive session of this sandbox: confirmed via `opencode debug config`,
which showed `agent.build/plan/general.prompt` fully replaced with
`deploy/system-prompt.txt`'s real content (not the built-in
`default.txt`). To reproduce, write this into the container's
`~/.config/opencode/opencode.jsonc` (inside the `opencode-config`
named volume — **not** copied from `deploy/opencode.json.example`,
which uses a relative path meant for the real target-machine
deployment, not this sandbox):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "build": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "plan": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "general": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" }
  },
  "plugin": ["/home/dev/project/deploy/system-prompt-tools.js"]
}
```

This lives only inside the named volume, not in any tracked file — it
will **not** survive `docker volume rm` / a fresh volume. Re-paste it
by hand if you need to re-verify (e.g. after an opencode upgrade).
