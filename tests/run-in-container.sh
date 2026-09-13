#!/usr/bin/env bash
# Meant to run *inside* the docker/ dev sandbox (see tests/README.md) -
# not against whatever node/bash happens to be on the host. Covers
# everything that needs no live opencode/model server: the plugin unit
# tests and the analyze-modules.sh integration test (stubbed opencode).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "== unit tests (node --test) =="
# Explicit glob, not a bare directory: Node 20 auto-detected "tests/unit"
# as a directory to scan for test files, but Node 22 (this sandbox's
# base image as of 2026-09-13, see docker/docker-notes.md) does not -
# it tries to resolve/require the path as a single module and fails
# with ERR_MODULE_NOT_FOUND. Verified directly on real node-v20.18.1 and
# node-v22.23.2 builds, not assumed. The glob form works on both.
node --test tests/unit/*.test.mjs

echo
echo "== analyze-modules.sh integration test =="
bash tests/integration/analyze-modules.test.sh
