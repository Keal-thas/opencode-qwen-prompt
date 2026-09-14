# Docker dev/test sandbox — working notes

`Dockerfile` + `docker-compose.yml` (both in `docker/`) give a local, isolated container for exercising this repo's prompt/plugins against a real `opencode` install, without touching the host's own opencode config or trusting an all-permission agent with anything outside the container.

## Launching it

Run from the repo root:

```sh
docker compose -f docker/docker-compose.yml run --rm opencode-dev
```

Drops you into an interactive bash shell as the container's `dev` user. Each invocation creates a fresh container and destroys it on exit (`--rm`) — fine, since nothing that matters lives in the container's writable layer (see below).

For one long-lived container to `exec` into repeatedly instead: `docker compose -f docker/docker-compose.yml up -d`, then `docker compose -f docker/docker-compose.yml exec opencode-dev bash`. (Drop the `-f` flag if you `cd docker/` first.)

## What actually persists, and where

- **Persists** — anything under the two named-volume mount points:
  - `~/.config/opencode/**` (volume `opencode-config`) — where the real `opencode` binary puts `opencode.jsonc` + `.gitignore` (XDG default, since `XDG_CONFIG_HOME` is unset in the container).
  - `~/.local/share/opencode/**` (volume `opencode-data`) — where it puts `opencode.db` (+ `-shm`/`-wal`), `repos/`, `log/opencode.log`.
  - Survives `run --rm`, `docker compose down` (without `-v`), and rebuilds. Does **not** survive `down -v`, `docker volume rm`, or a full Docker Desktop reset.
- **Also persists, different mechanism** — the project directory itself: `docker-compose.yml` bind-mounts the repo root to `/home/dev/project`, a live two-way link to the host filesystem, not container-lifecycle persistence.
- **Does NOT persist** — anything else written inside the container (files elsewhere in `/home/dev/`, an ad-hoc `apt-get install`, other scratch state) — lives in the writable layer, wiped the moment `--rm` destroys it.

The volumes live inside Docker Desktop's own VM disk image, not a real Mac filesystem path — go through `docker volume` or a throwaway container with `-v` to look inside one, don't try to touch the path directly.

## Container user

Runs as `dev` (uid/gid 1000 by default, overridable via the `UID`/`GID` build args) — a plain Linux user created in the `Dockerfile`, unrelated to any Docker Hub/registry account.

## Dockerfile gotchas, if rewriting it from scratch

- `node:22-bookworm` already ships a `node` user/group at uid/gid 1000 — collides with creating `dev` at the same default IDs. Fixed by dropping the unused `node` user/group first.
- Docker creates named volumes root-owned before the image's `USER` directive takes effect, so `dev` gets `EACCES` writing into the two mount points on first run. Fixed via `docker-entrypoint.sh`: container starts as root, chowns those two mount points, then drops privileges with `runuser` before exec'ing the real command.

## Provider API keys — loaded from `~/.keys`, never in .zshrc or the repo

`docker-compose.yml` bind-mounts `${HOME}/.keys` read-only to `/home/dev/.keys`. `docker-entrypoint.sh` reads specific files from there into env vars (e.g. `DEEPSEEK_API_KEY` from `~/.keys/.deepseek-key`) before dropping to the `dev` user — scoped to that container's process tree only, nothing persisted to the Mac's shell environment or written into this repo. An already-set `DEEPSEEK_API_KEY` in the invoking shell still wins, for a one-off override.

To add a key for another provider: drop a file in `~/.keys/` (`chmod 700` the directory itself — a plain no-exec directory silently blocks all access, including your own `ls`), then add one `if [ -f ... ]; then export ...; fi` block to `docker-entrypoint.sh` following the existing DeepSeek one.

Claude never reads these key files' contents directly (only checks filenames/lengths) and never writes a real key into any file — a hard rule, independent of how low-stakes the key is claimed to be.

## Pinned version

`opencode-ai`'s version is pinned in exactly one place: `OPENCODE_VERSION` in `docker/.env` (committed, secret-free — see its own header comment). `docker compose` loads it automatically and passes it into the `Dockerfile`'s `ARG OPENCODE_VERSION`. Deliberately not `@latest`, so a rebuild months from now reproduces the same environment instead of silently picking up a newer opencode. Bump by editing that one line (check `npm view opencode-ai version` first), then `docker compose -f docker/docker-compose.yml build`.

## Base image Node version

`FROM node:22-bookworm` (bumped from `node:20-bookworm` 2026-09-13 for the `plugins/` TypeScript rewrite — Node 20 has no native TS support at all, 22 runs `.ts` files with type annotations natively, no flag needed). If a future plugin needs TS syntax that isn't purely type-erasable (enums, `namespace`, parameter-property shorthand), that still needs an actual transpile step — Node's type-stripping only erases annotations. Full story, and an unrelated `node --test` regression this bump surfaced: [docs/lessons-learned.md](../docs/lessons-learned.md).

## Oracle test instance, for exercising mcp/oracle/

A second service in `docker-compose.yml`, `oracle` (image `gvenzl/oracle-free`, version pinned via `ORACLE_FREE_VERSION` in `docker/.env`, same reasoning as `OPENCODE_VERSION`), gives `mcp/oracle/` a real Oracle instance to test against.

**Starts automatically every time, by deliberate choice** — `opencode-dev` declares `depends_on: oracle: condition: service_healthy`, so both `run --rm` and `up -d` bring `oracle` up and wait for its healthcheck first. Accepted tradeoffs (weighed against the risk of a forgotten manual start):
- idle RAM/CPU for `oracle` on every sandbox session, even ones unrelated to it
- on a fresh machine or wiped volume, first-time DB init (1-3 min) blocks every `opencode-dev` invocation, not just ones touching `mcp/oracle/`
- `opencode-dev` fails to start at all if `oracle` can't become healthy

First-time init takes 1-3 minutes and only happens once — the `oracle-data` volume persists it the same way `opencode-config`/`opencode-data` do. Once warm, later starts are `healthy` within seconds. `oracle` keeps running after a `run --rm opencode-dev` session exits (`--rm` only tears down the container it created) — stop it explicitly with `docker compose stop oracle && docker compose rm -f oracle`, or `docker compose down` for everything.

Reachable from `opencode-dev` as `oracle:1521/FREEPDB1` via Compose's default service DNS. `opencode-dev`'s `environment` block pre-wires `ORACLE_CONNECT_STRING`/`ORACLE_USER`/`ORACLE_PASSWORD` to match, so `cd mcp/oracle && npm install && npm start` just works with zero setup. Credentials (`ORACLE_APP_USER`/`ORACLE_APP_USER_PASSWORD` in `docker/.env`) are throwaway sandbox fixtures, never exposed outside this docker network.

## Verifying the system-prompt override actually works

**Status: user-confirmed working, 2026-09-13.** Automated in `../tests/integration/docker-prompt-override.test.sh` (run via `../tests/run-all.sh`) — launches its own disposable container and scripts the `opencode debug config` check below.

Manual version, to reproduce by hand inside an interactive session: confirmed via `opencode debug config`, which showed `agent.build/plan/general.prompt` fully replaced with `deploy/system-prompt.txt`'s real content. Write this into the container's `~/.config/opencode/opencode.jsonc` (inside the `opencode-config` volume — **not** copied from `deploy/opencode.json.example`, which uses a path meant for the real target-machine deployment):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "build": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "plan": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "general": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" }
  },
  "plugin": ["/home/dev/project/deploy/system-prompt-tools.ts"]
}
```

Lives only inside the named volume, not any tracked file — won't survive `docker volume rm` / a fresh volume. Re-paste by hand to re-verify (e.g. after an opencode upgrade).
