# Docker dev/test sandbox

Lives in `docker/`. An isolated container (real `opencode` install, pinned version via `docker/.env`, non-root `dev` user) for exercising the prompt/plugins against a real opencode without touching the host's own config. Named volumes persist config/data across runs; the repo is live bind-mounted; provider API keys load from a read-only `~/.keys` mount, never written to any tracked file.

**Tested:** this *is* the execution environment for the rest of the suite (`tests/run-in-container.sh` runs inside it via `docker compose run`) — plus `tests/integration/docker-prompt-override.test.sh` specifically automates the sandbox's own "does the override actually work" check that `docker/docker-notes.md` previously documented as manual-only.
