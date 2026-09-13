#!/usr/bin/env bash
# Unattended, concurrency-limited, resumable per-module analysis runner.
#
# Iterates every immediate subdirectory of MODULES_DIR, and for each one
# runs opencode's `plan` agent (edit/write tools permission-denied) to
# produce a module-analysis doc. The analysis prompt comes from
# prompt-template.md in this same directory (single source of truth, no
# duplicated copy): @@MODULES_ROOT@@ is substituted once here, and
# @@MODULE_PATH@@ per module below.
# The agent can't write the doc itself (that's the point), so this script
# captures its final answer via --format json and writes it to the output
# file directly. Safe to interrupt and re-run: any module that already
# has a non-empty output file is skipped.
#
# Usage:
#   MODULES_DIR=/path/to/project/src/modules \
#   OUT_DIR=/path/to/project/docs/module-analysis \
#   ./analyze-modules.sh
#
# Tune CONCURRENCY down if the shared vLLM server starts queuing/slowing
# down under load; there's no hard reason to keep it low otherwise since
# total wall time isn't a constraint (each module run is independent).

set -euo pipefail

MODULES_DIR="${MODULES_DIR:?set MODULES_DIR to the directory containing one subdirectory per module}"
OUT_DIR="${OUT_DIR:?set OUT_DIR to where the analysis .md files should be written}"
LOG_DIR="${LOG_DIR:-$OUT_DIR/../logs/module-analysis}"
CONCURRENCY="${CONCURRENCY:-2}"
# plan: a primary agent with edit/write tools permission-denied (confirmed
# via `opencode debug agent plan`). explore would fit better by design,
# but it's a subagent and can't be run directly — `opencode run --agent
# explore` silently falls back to the full-access build agent instead.
# Caveat: plan's bash tool is unrestricted, so this blocks the edit/write
# tool path, not a model that deliberately shells out to modify files —
# that's still enforced by the prompt only (see "只读分析" in the template).
AGENT="${AGENT:-plan}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_TEMPLATE="$(cat "$SCRIPT_DIR/prompt-template.md")"
if [[ "$PROMPT_TEMPLATE" != *"@@MODULE_PATH@@"* || "$PROMPT_TEMPLATE" != *"@@MODULES_ROOT@@"* ]]; then
  echo "error: prompt-template.md must contain both @@MODULE_PATH@@ and @@MODULES_ROOT@@ placeholders" >&2
  exit 1
fi

# @@...@@ tokens are used instead of {{}} because braces are pattern-
# special in bash's ${var//pattern/replacement}; @@ has no special chars,
# and the replacement side takes & and \ literally in POSIX bash.
PROMPT_TEMPLATE="${PROMPT_TEMPLATE//@@MODULES_ROOT@@/$MODULES_DIR}"

mkdir -p "$OUT_DIR" "$LOG_DIR"

analyze_one() {
  local module_dir="$1"
  local module_name
  module_name=$(basename "$module_dir")
  local out_file="$OUT_DIR/${module_name}.md"
  local log_file="$LOG_DIR/${module_name}.log"

  if [[ -s "$out_file" ]]; then
    echo "[skip] $module_name already analyzed"
    return 0
  fi

  local prompt="${PROMPT_TEMPLATE//@@MODULE_PATH@@/$module_dir}"

  echo "[start] $module_name"
  # --format json: raw JSON-events stream, so the final answer can be
  # pulled out reliably instead of scraping ANSI-decorated terminal
  # output. The agent's own write tool is denied by permission (see
  # AGENT above), so the analysis text never lands anywhere unless this
  # script extracts it itself.
  if opencode run --agent "$AGENT" --format json "$prompt" > "$log_file" 2>&1; then
    python3 - "$log_file" "$out_file" <<'PYEOF'
import json
import sys

log_path, out_path = sys.argv[1], sys.argv[2]
text = ""
with open(log_path) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue  # a non-JSON line (e.g. a stderr warning captured via 2>&1)
        if event.get("type") == "text":
            text = event.get("part", {}).get("text", "")
with open(out_path, "w") as f:
    f.write(text)
PYEOF
  fi

  if [[ -s "$out_file" ]]; then
    echo "[done] $module_name"
  else
    echo "[FAIL] $module_name (see $log_file)"
  fi
}

export -f analyze_one
export OUT_DIR LOG_DIR AGENT PROMPT_TEMPLATE

find "$MODULES_DIR" -mindepth 1 -maxdepth 1 -type d \
  | xargs -P "$CONCURRENCY" -I{} bash -c 'analyze_one "$@"' _ {}

total=$(find "$MODULES_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l)
done_count=$(find "$OUT_DIR" -maxdepth 1 -name '*.md' -size +0c | wc -l)
echo "进度: ${done_count} / ${total}，结果在 $OUT_DIR"
