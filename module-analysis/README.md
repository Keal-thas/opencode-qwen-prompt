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

- `prompt-template.md` — the analysis prompt, raw template text with two
  placeholders: `@@MODULE_PATH@@` (the module directory being analyzed)
  and `@@MODULES_ROOT@@` (the parent directory holding all modules, so
  the agent has an actually-executable scope for its reverse-dependency
  grep). This file is the single source of truth: `analyze-modules.sh`
  reads it and substitutes the placeholders rather than carrying its
  own copy of the prompt. See "Why the prompt looks like this" below
  for the thinking behind its structure.
- `analyze-modules.sh` — the driver script. Runs one `opencode run
  --agent plan` call per module subdirectory (edit/write denied by
  permission, so the model can't touch the codebase it analyzes — see
  the script for why `plan` rather than `explore`) and writes the
  agent's captured answer to the output file itself. Concurrency-
  limited and resumable — modules that already have a non-empty output
  file are skipped, so it's safe to interrupt and re-run.

## Why the prompt looks like this

The failure mode the prompt is built around: on messy/legacy code, a
model asked to "explain the business logic" will confidently fabricate
a plausible-sounding explanation for code whose actual intent isn't
recoverable from the file alone. Formatting instructions alone don't
fix that — the fix is forcing every claim to carry a `file:line`
citation and an explicit confidence marker, so an ungrounded answer is
visibly flagged rather than indistinguishable from a grounded one.
Anything without evidence must be written as "意图不明,需人工确认"
(or the English equivalent), never smoothed over into a made-up
explanation.

Structural choices beyond that core rule:

- **Methodology and output are kept as separate sections.** The
  working rules come first (grep-first, bounded search scope, no
  whole-file reading by default), then each output section carries its
  own fill-in instructions and exact table columns — no "see step 2"
  indirection left for the model to resolve.
- **Reverse-dependency search gets an explicit scope**
  (`@@MODULES_ROOT@@`). "在其他模块目录里 grep" was unexecutable as
  written — the agent was never told where sibling modules live.
  Negative findings now must record the search that came up empty,
  instead of just asserting absence.
- **Worked examples** (an evidence-cited line and a `[推测]` row) are
  included because the citation format is the one place where sloppiness
  silently destroys the value of the whole output — a smaller model
  needs to see the exact expected shape, not just be told the rule.
- **Coverage honesty**: if the module is too big for one reply, list
  what wasn't examined instead of plausibly filling it in.

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
- The concurrency/driver design in `analyze-modules.sh` (a shell loop
  over `xargs -P`, JSON-events output parsed with an inline Python
  snippet) is known to be rougher than the rest of this workspace and
  likely to get revisited, rather than treated as the final shape of
  this tool.
