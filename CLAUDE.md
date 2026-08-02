# Working notes for this repo

See README.md for what the project does and its current status/open
items. This file is about *how* to work on it.

## Hard-won lessons from building this

- **There is no single authoritative list of `OPENCODE_*` env vars —
  not even in official docs.** `cli.mdx`'s `## Environment variables` +
  `### Experimental` tables (checked 2026-08-02) are the closest thing
  to a real reference, but cross-checking against actual source
  (`packages/core/src/flag/flag.ts`) found mismatches both ways:
  `OPENCODE_MODELS_PATH` — the var this repo's SETUP.md step 3 and
  `models-dev-snapshot.json` depend on — is real and works but is
  **completely absent from the docs table**; conversely the docs table
  lists vars (`OPENCODE_AUTO_SHARE`, `OPENCODE_ENABLE_EXA`,
  `OPENCODE_DISABLE_CLAUDE_CODE`, etc.) not present in that one source
  file, meaning env vars get read from more than one place in the
  codebase, not centralized in `flag.ts` alone. Don't trust either list
  as exhaustive — when a specific var's existence/behavior actually
  matters, grep the real source for it, the way `OPENCODE_MODELS_PATH`
  and `OPENCODE_DISABLE_MODELS_FETCH` were originally confirmed.
- **A local copy of opencode's own docs lives at
  `opencode-docs-reference/`** (gitignored, not part of this repo's
  content) — all 35 `.mdx` pages from
  `packages/web/src/content/docs/` in upstream, fetched 2026-08-02 for
  reference while working on this project. Re-fetch if it goes stale.
- **Don't trust blog posts / third-party gists about opencode's
  internals — verify against the actual installed binary/config.**
  Got burned twice: a gist claimed a `qwen.txt` fallback prompt exists
  (false, no evidence), and multiple sources disagreed on whether
  `agent.prompt` fully replaces or just appends to the provider prompt.
  Both got settled in minutes by actually testing against a real
  opencode install (`opencode debug config`, writing a throwaway
  plugin, diffing captured output) instead of reading more docs.
- **Prefer the simplest mechanism that works, even if it means undoing
  earlier work.** First approach was a JS plugin that intercepted and
  rewrote the system prompt via `experimental.chat.system.transform`,
  including hand-rolling the `<env>` block. Turned out `agent.prompt` +
  `{file:...}` in plain `opencode.json` does the same replacement
  natively, with opencode generating the env block itself — no JS
  needed. Threw away the more complex version without hesitation once
  the simpler one was proven to work.
- **When cutting "hand-holding" content from a prompt, diff against the
  original first.** Some of what looked like beginner hand-holding
  (URL-guessing warning, explaining state-changing commands before
  running them, not overstepping requested scope) was actually a
  safety/quality guardrail, not tone. Line-by-line diff against upstream
  `default.txt` caught the difference; a first pass by feel did not.
- **A subagent reporting "waiting" or similar is not a real result** —
  resume it and demand an actual answer plus confirmation that any
  cleanup it was supposed to do actually happened. Don't take a vague
  or non-committal subagent report at face value.
- **When you can run the real binary, do that before reading source or
  docs — but confirm surprising findings against source too.**
  `opencode debug agent <name>` gave the resolved prompt for every
  built-in agent directly (no need to trigger each one through a live
  chat, and subagents like `explore`/`general` can't even be invoked
  directly from the CLI — `opencode run --agent explore ...` prints an
  explicit warning and falls back to `build` rather than doing it
  silently). Still
  went and confirmed the `general` agent's missing prompt against
  actual upstream source (below) once it looked like a real gap worth
  acting on, rather than trusting the debug output alone.
- **opencode enforces behavior via permissions, not prompt text — this
  is why sharing one prompt across build/plan/general is safe.**
  `plan`'s "can't edit files" restriction lives entirely in its
  permission ruleset (`edit: deny`), not in any prompt wording — the
  `provider()` function that picks a base system prompt
  (`session/system.ts`) branches only on model ID, never on agent name
  or mode. Confirmed by testing: overriding all three agents' prompt
  with the same `system-prompt.txt` did not affect plan's edit
  restriction, because that restriction was never prompt-encoded to
  begin with. Don't assume the reverse holds elsewhere, though —
  anything NOT enforced by a permission rule (tone, "when to delegate
  to Task", etc.) only exists if the prompt says it.
- **The Task tool's subagent result is fragile — worth knowing before
  leaning on `general` for this Qwen setup.** `tool/task.ts` runs the
  subagent to completion and returns `result.parts.findLast(p => p.type
  === "text")?.text ?? ""` — only the subagent's last text block, no
  concatenation of earlier text or tool output, and a silent `""` if
  the subagent's final message has no text part at all (e.g. it ends on
  a tool call). No error is raised either way. A subagent that does
  real work via tools but closes with a thin or missing summary hands
  the parent agent nothing useful, and there's no system-level warning
  when that happens — this is a real risk for a smaller model that
  doesn't reliably self-summarize, independent of whether the
  delegation *prompt* line (above) gets the model to invoke `general`
  in the first place.

- **Checking for full-width/Chinese punctuation via shell `grep -P` in
  this bash environment is unreliable** — multi-byte Unicode literals
  typed into a grep pattern get garbled (matches ASCII `"` instead of
  the intended curly/full-width chars, silently). Verified by running
  the same check both ways and getting different results. Use a small
  Python script with explicit `chr(0xFF0C)`-style codepoints instead —
  confirmed accurate. Relevant any time future Chinese content gets
  added here, given the global rule (`~/.claude/CLAUDE.md`) is English
  punctuation only, even in Chinese text — missed this once writing
  `SETUP-walkthrough.zh.md` from scratch, caught and fixed on a
  follow-up review, not while writing it originally.
- **Don't "fix" punctuation in verbatim captured data** —
  `captured-example-prompt.txt` has real full-width Chinese punctuation
  inside a captured custom-instructions block, left as-is on purpose:
  it's a literal dump of what a real request actually contained, not
  prose written for this repo. Rewriting it to match the punctuation
  rule would misrepresent what was actually captured. The rule applies
  to docs authored here, not to raw logged/captured evidence.

## Where things live

- opencode's real upstream repo is
  [anomalyco/opencode](https://github.com/anomalyco/opencode) (`dev`
  branch), npm package `opencode-ai`. Built-in agent definitions are in
  `packages/opencode/src/agent/agent.ts`; the four agents with their
  own dedicated native prompt (`explore`, `compaction`, `summary`,
  `title`) load them from `packages/opencode/src/agent/prompt/*.txt` in
  that repo. `build`, `plan`, and `general` have no prompt field set in
  source at all — worth remembering if this needs re-checking after an
  opencode upgrade, since version 1.14.30 (installed on this dev
  machine) is what all of the above was verified against. Permission
  logic is `packages/opencode/src/permission/index.ts`; the Task tool
  (subagent invocation) is `packages/opencode/src/tool/task.ts` +
  `task.txt`; base-prompt-by-model-ID selection is
  `packages/opencode/src/session/system.ts`.
- The actual target machine's model server (Ollama/vLLM, reachable only
  from the restricted machine's own network, not from this dev machine)
  exposes an **OpenAI-compatible API** — relevant when someone finally
  writes the real `provider` block into `opencode.json` there; opencode
  supports OpenAI-compatible providers natively.
- **Two separate machines, not one — don't conflate them.** (1) The
  restricted/offline machine: single-user (belongs to the user alone,
  not shared), Windows, accessed via git-bash, no internet, opencode
  installed there (also used through `web`/`serve` modes, not just the
  CLI — doesn't matter for this override, all interfaces read the same
  `opencode.json`). This is where SETUP.md gets executed. (2) A
  *separate* model-serving machine/server running Ollama (with a
  planned future move to vLLM by whoever administers that server) that
  exposes an OpenAI-compatible API reachable over the restricted
  machine's internal network — the user has **no admin access to this
  server**, only consumes it as an API client from the restricted
  machine's `opencode.json` provider config. So "someone else migrating
  Ollama to vLLM" refers to that separate server's admin, not a second
  person touching the restricted machine or its `opencode.json` — no
  multi-user file-contention concern on the opencode side. Confirmed
  2026-08-02.
  Model in use: **`Qwen3.6-35B-A3B`** — real, released 2026-04-16,
  Apache 2.0, sparse MoE (35B total params, ~3B active per forward
  pass, ~12:1 sparsity). Native context 262,144 tokens, extensible to
  1,010,000 via RoPE scaling — notably large, don't assume small-model
  context constraints apply here. Has a "thinking preservation" feature
  (retains reasoning traces across multi-turn) — worth checking whether
  `opencode.json`'s model config sets the `reasoning`/`interleaved`
  fields to actually take advantage of it. Benchmarks: 73.4%
  SWE-bench Verified, 51.5% Terminal-Bench 2.0, 92.6% AIME 2026 (per
  https://qwen.ai/blog?id=qwen3.6-35b-a3b and
  https://huggingface.co/Qwen/Qwen3.6-35B-A3B — found via web search
  since this postdates the 2026-01 knowledge cutoff; first guess of
  "likely Qwen3-30B-A3B" was wrong, don't trust that old guess anywhere
  it might still linger). Hardware specs (GPU/VRAM) of the model server
  unknown. `$CONFIG_DIR` on the restricted machine is the opencode
  default (no override). Deployment happens by handing SETUP.md to the
  restricted machine's own opencode to execute (matches SETUP.md's
  intended usage — written for an agent to run, not a human to follow
  by hand).
- **Known model quirk, not an opencode/repo issue — better explanation
  found 2026-08-02, correcting an earlier guess**: user hit a "tool
  call not supported" error on one smaller Qwen model served via Ollama
  (referred to as "qwen2.7b" — exact model unconfirmed). Originally
  guessed this was a missing tools-branch in the model's Ollama
  Modelfile chat template. opencode's own `providers.mdx` docs give a
  more likely, more actionable cause: "If tool calls aren't working,
  try increasing `num_ctx` in Ollama. Start around 16k - 32k." — Ollama
  defaults `num_ctx` low (historically 2048), which can silently
  truncate the tool-call schema/instructions out of the prompt entirely
  before the model ever sees them, producing exactly this symptom.
  Check `num_ctx` first; the chat-template theory is still possible but
  now the second thing to check, not the first. Not something this
  repo's system prompt override can fix either way; if it recurs after
  the vLLM migration, check vLLM's `--tool-call-parser` flag instead.

- **The models.dev catalog fetch does NOT block startup on a fully
  offline machine — verified directly from source, not assumed**
  (`packages/core/src/models-dev.ts` +
  `packages/opencode/script/build.ts` in upstream, checked 2026-08-02).
  On boot it first tries `$CACHE_DIR/models.json` (any age, no
  staleness check); if that's missing it falls back to a snapshot
  baked into the binary at build time via esbuild
  `define: { OPENCODE_MODELS_DEV: generated.modelsData }` — the
  offline single-exe build embeds this, so a brand-new install with
  zero cache and zero network still resolves synchronously, no fetch
  attempted. The only real network call is a background refresh every
  60 minutes, forked (non-blocking) with failures caught and ignored
  (`Effect.ignore`) — can't hang or crash startup, worst case is an
  hourly failed-fetch line in the log forever on a machine that can
  never reach the internet. Also irrelevant to our setup either way:
  the target machine's Qwen provider is fully custom
  OpenAI-compatible, defined by hand in `opencode.json`, not looked up
  from this catalog. To kill the pointless hourly retry noise, set env
  var `OPENCODE_DISABLE_MODELS_FETCH=1` on that machine (skips fetch
  entirely, cache/snapshot-only). To point at an actual local file
  instead of relying on the stale build-time snapshot, set
  `OPENCODE_MODELS_PATH=<path>` too — but **both** variables are needed
  for a true zero-network guarantee: `OPENCODE_MODELS_PATH` only
  affects the initial `populate()` load (`loadFromDisk` reads that path
  instead of `$CACHE_DIR/models.json`); the background 60-minute
  refresh loop is gated purely by `OPENCODE_DISABLE_MODELS_FETCH` and
  checks `$CACHE_DIR/models.json`'s mtime regardless of
  `OPENCODE_MODELS_PATH`, so without the disable flag it still attempts
  a doomed network fetch every hour even with a local path configured.
  This repo ships `models-dev-snapshot.json` (a captured
  `opencode models --refresh` output) for this exact purpose — see
  SETUP.md step 3.
- This repo used to be a subfolder of an unrelated Java project
  (`java-remote-debug-with-idea`) before being moved out — if you see
  references to that path in old commit messages, that's why.
- Claude's own cross-session memory about this project (for when a
  session starts elsewhere and this repo comes up) is a short pointer
  at `~/.claude/projects/C--Users-DecVens-Desktop-codes-opencode-qwen-prompt/memory/`
  — kept intentionally thin since the real content lives here now.
