# Docker dev/test sandbox — working notes

`Dockerfile` + `docker-compose.yml` (both here in `docker/`) give a
local, isolated container for exercising this repo's prompt/plugins
(`deploy/system-prompt.txt`, `deploy/opencode.json.example`,
`plugins/hook-logger.js`, `plugins/llm-review-gate.js`, ...) against a
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

1. `node:20-bookworm` already ships a `node` user/group at uid/gid
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
