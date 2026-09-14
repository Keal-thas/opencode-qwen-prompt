# Local dev/test sandbox for this repo: a real opencode install plus
# Node/npm/Python, so deploy/system-prompt.txt, deploy/opencode.json.example,
# and the plugins (deploy/system-prompt-tools.ts, plugins/hook-logger.ts,
# plugins/llm-review-gate.ts) can be exercised against a real `opencode
# run` without touching the host machine's own opencode config or
# letting an all-permission agent loose on anything outside this
# container.
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

# Pre-warm the system-prompt-tools plugin's node_modules into this image
# layer instead of a runtime volume (there's no opencode-config volume
# anymore - see docker-compose.yml). opencode installs a plugin's
# dependency tree into ~/.config/opencode/node_modules on first use of a
# `plugin` config entry, which costs ~20-25s of pure network wait
# (measured); paying that once at build time means every container
# already has it warm (verified: 0.6s vs 20-24s). `opencode debug
# config` alone reliably triggers the install and exits 0 once it's
# done (~50-60s wall time the first time, no real provider needed) -
# `opencode run` also works but is unrelated to this and has its own
# known hang bug (see docs/lessons-learned.md), so this deliberately
# uses debug config instead. Runs as ${USERNAME}, not root, so HOME
# resolves to /home/${USERNAME} and the install lands where the
# entrypoint-generated config (see docker-entrypoint.sh) will actually
# look for it at runtime.
COPY --chown=${USERNAME}:${USERNAME} deploy/system-prompt-tools.ts deploy/system-prompt-tools.ts
USER ${USERNAME}
RUN printf '{"$schema":"https://opencode.ai/config.json","plugin":["/home/%s/project/deploy/system-prompt-tools.ts"]}' "${USERNAME}" > "/home/${USERNAME}/.config/opencode/opencode.jsonc" \
    && opencode debug config >/dev/null \
    && rm "/home/${USERNAME}/.config/opencode/opencode.jsonc"
USER root

# Stays root at container start so the entrypoint can load provider keys
# and (re)generate opencode.jsonc as the dev user before exec'ing the
# real command - see docker-entrypoint.sh.
COPY --chmod=755 docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bash"]
