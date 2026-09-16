#!/bin/bash
set -e

# Regenerate opencode's config fresh on every start. There's no
# persistent opencode-config volume anymore (see docker-compose.yml and
# docs/lessons-learned.md), so nothing else would ever populate this
# file - matches the container's own writable layer resetting on every
# `--rm`. Mirrors SETUP.md steps 1/2/4 for the real deployment:
# build/plan/general point at system-prompt.txt through the live
# bind-mounted project dir (not a build-time copy), so host edits to
# that file show up without a rebuild.
cat > /home/dev/.config/opencode/opencode.jsonc <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "build": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "plan": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" },
    "general": { "prompt": "{file:/home/dev/project/deploy/system-prompt.txt}" }
  }
}
EOF
chown dev:dev /home/dev/.config/opencode/opencode.jsonc

# The diagnostic dump plugin (and, if ever wanted, hook-logger.ts /
# llm-review-gate.ts) loads from opencode's local-plugin directory, not
# the `plugin` config array above - auto-loaded at startup, no package,
# no registry (see SETUP.md steps 4/5, docker-notes.md's "Plugin
# dependency pre-warming"). Copied fresh from the live bind mount on
# every start, so host edits to the .ts source show up without an image
# rebuild - the Dockerfile only pre-warms opencode's own
# @opencode-ai/plugin support package, not these files themselves.
mkdir -p /home/dev/.config/opencode/plugins
cp /home/dev/project/plugins/system-prompt-tools.ts /home/dev/.config/opencode/plugins/system-prompt-tools.ts
chown -R dev:dev /home/dev/.config/opencode/plugins

# Load provider API keys from the read-only ~/.keys mount into this
# container's env only - never written back to the host, never logged.
# An already-set env var (passed through docker-compose.yml) wins.
# Add another line here per provider as needed.
if [ -z "$DEEPSEEK_API_KEY" ] && [ -f /home/dev/.keys/.deepseek-key ]; then
  export DEEPSEEK_API_KEY="$(cat /home/dev/.keys/.deepseek-key)"
fi

exec runuser -u dev -- "$@"
