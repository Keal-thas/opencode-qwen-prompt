# Module analysis toolkit

Unattended, batch-driven opencode workflow for building an architecture
map of a large single-module monolith split into many
`Controller`/`Service`/etc. subdirectories — for someone who doesn't
know the system and doesn't want to read all of it by hand first.

This is a separate, standalone tool that happens to live in this repo
alongside the system-prompt override — it doesn't depend on
`deploy/system-prompt.txt` being installed, only on `opencode` being on
PATH and configured with a working provider (e.g. the vLLM + Qwen setup
this repo's SETUP.md configures).

## What's here

- `prompt-template.md` — the analysis prompt, plus the reasoning
  behind its structure (evidence citations + confidence markers,
  specifically to stop the model from fabricating explanations for
  code whose intent isn't actually recoverable — see that file for
  why this matters more than output formatting).
- `analyze-modules.sh` — the driver script. Runs one `opencode run
  --agent plan` call per module subdirectory (edit/write denied by
  permission, so the model can't touch the codebase it analyzes — see
  the script for why `plan` rather than `explore`) and writes the
  agent's captured answer to the output file itself. Concurrency-
  limited and resumable — modules that already have a non-empty output
  file are skipped, so it's safe to interrupt and re-run.

## Usage

```bash
MODULES_DIR=/path/to/project/src/modules \
OUT_DIR=/path/to/project/docs/module-analysis \
./analyze-modules.sh
```

Optional env vars: `CONCURRENCY` (default `2` — raise once you've
confirmed the model server handles it without queuing/degrading),
`LOG_DIR` (defaults next to `OUT_DIR`), and `AGENT` (default `plan` —
edit/write denied by permission, so a prompt failure can't turn into
an actual code edit; doesn't restrict bash, so it's not a hard sandbox
against a model that deliberately shells out — see `analyze-modules.sh`
for the full reasoning).

For a genuinely unattended multi-hour run (walk away, don't keep a
terminal open), background it with `nohup`/`tmux`/`screen`, or on the
Windows target machine, register it as a Scheduled Task. Progress and
failures are visible via the per-module log files in `LOG_DIR`, and
the final summary line in stdout.

## Status / open items

- This is a first pass covering one module directory in isolation per
  run. Cross-module business logic that spans a strongly-coupled group
  of modules won't be fully captured this way — a planned second pass
  is to group modules by the dependency edges this pass surfaces and
  re-analyze each group together with shared context. Not built yet.
- Not yet run against a real target codebase — designed and reviewed,
  but unverified end-to-end.
