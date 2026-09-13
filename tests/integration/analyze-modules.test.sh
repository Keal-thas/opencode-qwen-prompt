#!/usr/bin/env bash
# Integration test for module-analysis/analyze-modules.sh. Runs the real
# script against a stub `opencode` binary (tests/integration/fixtures/stub-bin)
# instead of the real CLI, so it needs no model server and is fast/deterministic.
# Covers: happy path (per-module output written from the agent's captured
# answer), a failed module leaving no output but a log file, and the
# resumability/skip logic (a module with an existing non-empty output file
# must never be re-invoked).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STUB_BIN_DIR="$REPO_ROOT/tests/integration/fixtures/stub-bin"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

MODULES_DIR="$WORK_DIR/modules"
OUT_DIR="$WORK_DIR/out"
LOG_DIR="$WORK_DIR/logs"
mkdir -p "$MODULES_DIR/moduleA" "$MODULES_DIR/moduleB" "$MODULES_DIR/moduleC" "$MODULES_DIR/moduleD"
mkdir -p "$OUT_DIR" "$LOG_DIR"

# moduleD is already analyzed - the resumable/skip path must leave it
# untouched and must never invoke opencode for it at all.
echo "SENTINEL - already done" > "$OUT_DIR/moduleD.md"

PATH="$STUB_BIN_DIR:$PATH" \
MODULES_DIR="$MODULES_DIR" \
OUT_DIR="$OUT_DIR" \
LOG_DIR="$LOG_DIR" \
CONCURRENCY=2 \
  "$REPO_ROOT/module-analysis/analyze-modules.sh" > "$WORK_DIR/stdout.log" 2>&1 || true

fail=0

assert_file_contains() {
  local file="$1" needle="$2"
  if [[ ! -f "$file" ]]; then
    echo "FAIL: expected file to exist: $file"
    fail=1
    return
  fi
  if ! grep -qF "$needle" "$file"; then
    echo "FAIL: expected $file to contain: $needle"
    fail=1
  fi
}

# Happy path: each module's captured text answer lands in its own .md file.
assert_file_contains "$OUT_DIR/moduleA.md" "moduleA analysis result"
assert_file_contains "$OUT_DIR/moduleB.md" "moduleB analysis result"

# Failure path: a non-zero opencode exit must leave no (or empty) output,
# but the log file should still capture what the stub said on stderr.
if [[ -s "$OUT_DIR/moduleC.md" ]]; then
  echo "FAIL: moduleC.md should be empty/absent after a simulated opencode failure"
  fail=1
fi
assert_file_contains "$LOG_DIR/moduleC.log" "simulated failure for moduleC"

# Resumability: a module that already had a non-empty output file must be
# skipped entirely - untouched content, and no opencode invocation (so no
# log file gets created for it).
content="$(cat "$OUT_DIR/moduleD.md")"
if [[ "$content" != "SENTINEL - already done" ]]; then
  echo "FAIL: moduleD.md was overwritten even though it was already analyzed"
  fail=1
fi
if [[ -f "$LOG_DIR/moduleD.log" ]]; then
  echo "FAIL: moduleD.log exists - the skip path should never invoke opencode"
  fail=1
fi

if [[ "$fail" -eq 0 ]]; then
  echo "PASS: analyze-modules.sh integration test"
  exit 0
else
  echo "--- stdout/stderr from the run under test ---"
  cat "$WORK_DIR/stdout.log"
  exit 1
fi
