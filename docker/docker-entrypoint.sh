#!/bin/bash
set -e

# Regenerate opencode's config fresh on every start. There's no
# persistent opencode-config volume anymore (see docker-compose.yml and
# docs/lessons-learned.md), so nothing else would ever populate this
# file - matches the container's own writable layer resetting on every
# `--rm`. Mirrors SETUP.md steps 1/2/4 for the real deployment:
# build/plan/general point at system-prompt.txt through the live
# bind-mounted project dir (not a build-time copy), so host edits to
# that file show up without a rebuild. The diagnostic dump plugin loads
# by bare "name@version" instead - editing deploy/system-prompt-tools.ts
# now needs `npm pack` in deploy/ *and* an image rebuild
# (`docker/dev.sh build`) to take effect here, since the actual install
# (extracting the tarball into opencode's own package cache, keyed by
# this exact spec string) was pre-warmed into the image layer (see the
# Dockerfile) - see docker-notes.md.
cat > /home/dev/.config/opencode/opencode.jsonc <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "build": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "plan": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "general": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" }
  },
  "plugin": ["opencode-system-prompt-tools@1.0.0"]
}
EOF
chown dev:dev /home/dev/.config/opencode/opencode.jsonc

# Load provider API keys from the read-only ~/.keys mount into this
# container's env only - never written back to the host, never logged.
# An already-set env var (passed through docker-compose.yml) wins.
# Add another line here per provider as needed.
if [ -z "$DEEPSEEK_API_KEY" ] && [ -f /home/dev/.keys/.deepseek-key ]; then
  export DEEPSEEK_API_KEY="$(cat /home/dev/.keys/.deepseek-key)"
fi

exec runuser -u dev -- "$@"
