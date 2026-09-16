# Local dev/test sandbox for this repo: a real opencode install plus
# Node/npm/Python, so deploy/system-prompt.txt, deploy/opencode.json.example,
# and the plugins (plugins/system-prompt-tools.ts, plugins/hook-logger.ts,
# plugins/llm-review-gate.ts) can be exercised against a real `opencode
# run` without touching the host machine's own opencode config or
# letting an all-permission agent loose on anything outside this
# container. Each plugin is a standalone .ts file, copied as-is into
# opencode's local-plugin directory (`~/.config/opencode/plugins/`,
# auto-loaded at startup per opencode's own docs) - no package, no
# registry, no `plugin` config entry needed. Confirmed live in this
# sandbox, outbound network cut, that this resolves with zero network
# round-trip (see docker-notes.md's "Plugin dependency pre-warming"
# section) before adopting it for the real deployment.
#
# The project directory itself is NOT copied in here — see
# docker-compose.yml (this build's context is the repo root, one level
# up from this Dockerfile), which bind-mounts the repo at build/run time
# so host edits show up immediately without a rebuild. This image only
# provides the toolchain.
FROM node:22-bookworm

# git: opencode itself shells out to it (repo checks, the <env> block).
# python3: SETUP.md's JSON-validation step uses a `python -c` one-liner.
# build-essential: in case any future plugin dependency needs to build
#   a native addon.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      curl \
      python3 \
      build-essential \
      ca-certificates \
      vim \
      less \
    && rm -rf /var/lib/apt/lists/*

# Pinned, not @latest, so a rebuild months from now reproduces the same
# environment instead of silently picking up a newer opencode. The
# actual version lives in one place: OPENCODE_VERSION in docker/.env
# (docker-compose.yml passes it through as this build arg) - bump it
# there, not here.
ARG OPENCODE_VERSION
RUN npm install -g "opencode-ai@${OPENCODE_VERSION}"

# Non-root user: an all-permission agent's blast radius should stay
# inside this container's filesystem view, not run as root within it.
# node:22-bookworm already ships a "node" user/group at 1000:1000, which
# we don't use — drop it first so it doesn't collide with our default.
ARG USERNAME=dev
ARG UID=1000
ARG GID=1000
RUN (userdel -r node 2>/dev/null || true) \
    && (groupdel node 2>/dev/null || true) \
    && groupadd -g "${GID}" "${USERNAME}" \
    && useradd -m -u "${UID}" -g "${GID}" -s /bin/bash "${USERNAME}" \
    && mkdir -p /home/${USERNAME}/.config/opencode /home/${USERNAME}/.local/share/opencode \
    && chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}

WORKDIR /home/${USERNAME}/project

# Pre-warm opencode's own @opencode-ai/plugin support package into this
# image layer instead of a runtime volume (there's no opencode-config
# volume anymore - see docker-compose.yml). This install happens the
# first time opencode ever processes a config with any plugin present -
# confirmed live that it's triggered the same way regardless of whether
# the plugin comes from the npm `plugin` array or the local-file
# `~/.config/opencode/plugins/` directory (see docker-notes.md's
# "Plugin dependency pre-warming" section), so a throwaway local-file
# plugin here is enough to trigger and cache it once, at build time,
# instead of paying opencode's ~50-60s cold install on every fresh
# container's first use. Our actual plugins (plugins/system-prompt-tools.ts,
# plugins/hook-logger.ts, plugins/llm-review-gate.ts) are NOT baked in
# here - docker-entrypoint.sh copies them fresh from the live bind mount
# on every container start, so host edits take effect without a
# rebuild, same as deploy/system-prompt.txt already does. Runs as
# ${USERNAME}, not root, so HOME resolves to /home/${USERNAME} and the
# node_modules land where the entrypoint-generated config will actually
# look for them at runtime.
USER ${USERNAME}
RUN mkdir -p "/home/${USERNAME}/.config/opencode/plugins" \
    && printf 'export const Warm = async () => ({});\n' > "/home/${USERNAME}/.config/opencode/plugins/warm.ts" \
    && opencode debug config >/dev/null \
    && rm "/home/${USERNAME}/.config/opencode/plugins/warm.ts"
USER root

# Stays root at container start so the entrypoint can load provider keys
# and (re)generate opencode.jsonc as the dev user before exec'ing the
# real command - see docker-entrypoint.sh.
COPY --chmod=755 docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bash"]
