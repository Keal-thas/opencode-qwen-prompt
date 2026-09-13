# Local dev/test sandbox for this repo: a real opencode install plus
# Node/npm/Python, so deploy/system-prompt.txt, deploy/opencode.json.example,
# and the plugins (deploy/system-prompt-tools.js, plugins/hook-logger.js,
# plugins/llm-review-gate.js) can be exercised against a real `opencode
# run` without touching the host machine's own opencode config or
# letting an all-permission agent loose on anything outside this
# container.
#
# The project directory itself is NOT copied in here — see
# docker-compose.yml (this build's context is the repo root, one level
# up from this Dockerfile), which bind-mounts the repo at build/run time
# so host edits show up immediately without a rebuild. This image only
# provides the toolchain.
FROM node:20-bookworm

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
# node:20-bookworm already ships a "node" user/group at 1000:1000, which
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

# Stays root at container start so the entrypoint can fix up the named
# volumes' ownership (see docker-entrypoint.sh) before dropping to dev.
COPY --chmod=755 docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bash"]
