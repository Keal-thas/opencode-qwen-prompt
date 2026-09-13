#!/bin/bash
set -e

# Named volumes are created by Docker (root-owned) before this container's
# non-root USER takes effect, so opencode's own writes under these paths
# (config, provider auth, the prompt-dump log) would fail with EACCES.
# Fix ownership here, every start, as root — then drop to the dev user.
chown -R dev:dev /home/dev/.config /home/dev/.local

# Load provider API keys from the read-only ~/.keys mount into this
# container's env only — never written back to the host, never logged.
# An already-set env var (passed through docker-compose.yml) wins.
# Add another line here per provider as needed.
if [ -z "$DEEPSEEK_API_KEY" ] && [ -f /home/dev/.keys/.deepseek-key ]; then
  export DEEPSEEK_API_KEY="$(cat /home/dev/.keys/.deepseek-key)"
fi

exec runuser -u dev -- "$@"
