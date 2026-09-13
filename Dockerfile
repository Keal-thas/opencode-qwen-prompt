# Local dev/test sandbox for this repo: a real opencode install plus
# Node/npm/Python, so system-prompt.txt / opencode.json.example / the
# plugins here (system-prompt-tools.js, hook-logger.js, llm-review-gate.js)
# can be exercised against a real `opencode run` without touching the
# host machine's own opencode config or letting an all-permission agent
# loose on anything outside this container.
#
# The project directory itself is NOT copied in here — see
# docker-compose.yml, which bind-mounts the repo at build/run time so
# host edits show up immediately without a rebuild. This image only
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
# environment instead of silently picking up a newer opencode. Bump
# deliberately: `npm view opencode-ai version` for the current release.
ARG OPENCODE_VERSION=1.18.30
RUN npm install -g "opencode-ai@${OPENCODE_VERSION}"

# Non-root user: an all-permission agent's blast radius should stay
# inside this container's filesystem view, not run as root within it.
ARG USERNAME=dev
ARG UID=1000
ARG GID=1000
RUN groupadd -g "${GID}" "${USERNAME}" \
    && useradd -m -u "${UID}" -g "${GID}" -s /bin/bash "${USERNAME}"

USER ${USERNAME}
WORKDIR /home/${USERNAME}/project

CMD ["bash"]
