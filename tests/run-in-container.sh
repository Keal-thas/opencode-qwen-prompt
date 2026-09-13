#!/usr/bin/env bash
# Meant to run *inside* the docker/ dev sandbox (see tests/README.md) -
# not against whatever node/bash happens to be on the host. Covers
# everything that needs no live opencode/model server: the plugin unit
# tests and the analyze-modules.sh integration test (stubbed opencode).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "== unit tests (node --test) =="
node --test tests/unit

echo
echo "== analyze-modules.sh integration test =="
bash tests/integration/analyze-modules.test.sh
