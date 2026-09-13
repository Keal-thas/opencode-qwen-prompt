# Working notes for this repo

See README.md for what the project does and its current status/open
items. This file is about *how* to work on it.

## Preferences

This is a single-person project used across multiple machines/environments (this Mac, the Windows target machine, wherever it's cloned next), not a team — these preferences are git-tracked here, instead of living only in a Claude Code memory file tied to one machine/user account, specifically so they hold regardless of which environment a session is running in.

- **Deliver anything needing confirmation or unhurried reading as a file, not a chat wall of text.** Keep the chat reply itself to one or two sentences: the headline plus a pointer to the file. Attention is limited and chat output doesn't get read exhaustively — stated directly, more than once. This repo uses a gitignored `.local/` directory at the repo root for exactly this (scratch notes, session summaries, pending-decision write-ups); clean up a `.local/` file once its content has actually been acted on, don't let it accumulate.
- **Test claims against the real system when the tooling exists, rather than reasoning from inspection alone.** Paid off repeatedly: whether `opencode.json` vs `.jsonc` mattered was a false alarm caught by testing live; the `module-analysis` script's `explore`-agent silently falling back to `build` (a real safety bug) was only caught by actually running it; relocating `docker-compose.yml` during the 2026-09-13 reorg silently changed Compose's project name and would have orphaned a working config volume, caught only by rebuilding and running the sandbox afterward, not by inspection. (These three examples all happened on the Mac Docker dev sandbox — mentioned here for illustration, not because the lesson is environment-specific; it applies to the Windows/vLLM target machine equally.)
- **Centralize a config value in one place instead of repeating the literal across files.** Flagged unprompted the moment the opencode-ai Docker image version turned out hardcoded independently in both `Dockerfile`'s `ARG` default and in `docker-notes.md` prose — the concern is drift risk, not just tidiness. Historical/point-in-time facts (e.g. "verified against version X on date Y") are a different case and should stay as literal, dated records; this is about *live* config values.
- **Don't manually wrap prose lines when writing documents.** The editor in use (IntelliJ) has soft-wrap on — hard-wrapping at ~72-80 characters fights with that and produces choppy short lines. Write each paragraph as one long source line. Applies to markdown/prose; code comments still wrap per normal language convention. Files written before this was said (most of this repo's docs, as of 2026-09-13) were not proactively reflowed — only fix an existing file's wrapping if asked, or while otherwise editing it anyway.

## Hard-won lessons from building this

- **Don't undersell this repo's scope as just the Qwen prompt
  override.** Corrected by Franco 2026-09-13 after an audit ranked
  `module-analysis/` and `plugins/` as low-importance/unrelated
  hitchhikers: this is actually his general opencode tooling
  workspace — prompt override, custom plugins, practical scripts, and
  planned MCP work — and the prompt override just happens to be the
  first piece and the repo's namesake. Don't re-derive the narrower
  framing from the repo name or from `deploy/` looking like "the real
  content."
- **There is no single authoritative list of `OPENCODE_*` env vars —
  not even in official docs.** `cli.mdx`'s `## Environment variables` +
  `### Experimental` tables (checked 2026-08-02) are the closest thing
  to a real reference, but cross-checking against actual source
  (`packages/core/src/flag/flag.ts`) found mismatches both ways:
  `OPENCODE_MODELS_PATH` — the var this repo's SETUP.md step 3 and
  `deploy/models-dev-snapshot.json` depend on — is real and works but is
  **completely absent from the docs table**; conversely the docs table
  lists vars (`OPENCODE_AUTO_SHARE`, `OPENCODE_ENABLE_EXA`,
  `OPENCODE_DISABLE_CLAUDE_CODE`, etc.) not present in that one source
  file, meaning env vars get read from more than one place in the
  codebase, not centralized in `flag.ts` alone. Don't trust either list
  as exhaustive — when a specific var's existence/behavior actually
  matters, grep the real source for it, the way `OPENCODE_MODELS_PATH`
  and `OPENCODE_DISABLE_MODELS_FETCH` were originally confirmed.
- **A local copy of opencode's own docs lives at
  `docs/opencode-docs-reference/`** — committed (not gitignored,
  2026-09-13 onward), since the actual target machine has no internet
  and this travels with the repo. All 36 top-level English `.mdx`
  pages from `packages/web/src/content/docs/` in upstream (locale
  subdirectories skipped on purpose). Refresh with
  `./docs/fetch-opencode-docs.sh`.
- **Concrete incidents behind the "verify against the real thing" preference above** — kept here since they're specific enough to be worth remembering, even though the general rule already lives in Preferences: a third-party gist falsely claimed a `qwen.txt` fallback prompt exists (settled in minutes by testing instead of trusting the gist); sources disagreed on whether `agent.prompt` replaces or just appends to the provider prompt (settled via `opencode debug config` + a throwaway plugin); `opencode debug agent <name>` gives the resolved prompt for every built-in agent directly, without needing to trigger each one through a live chat, and confirmed `explore`/`general` can't be invoked directly via `opencode run --agent` (prints a warning, falls back to `build`) — which is exactly the mechanism that later caused the real `module-analysis` safety bug.
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
- **Confirm surprising findings against source too, not just the debug output** — the `general` agent's missing prompt (above) got double-checked against actual upstream source once it looked like a real gap worth acting on, rather than trusting `opencode debug agent` alone.
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
  `deploy/captured-example-prompt.txt` has real full-width Chinese punctuation
  inside a captured custom-instructions block, left as-is on purpose:
  it's a literal dump of what a real request actually contained, not
  prose written for this repo. Rewriting it to match the punctuation
  rule would misrepresent what was actually captured. The rule applies
  to docs authored here, not to raw logged/captured evidence.

## Where things live

- **This repo's own layout, post-2026-09-13 reorg** (was flat, everything
  loose in the root): `deploy/` is the only directory that actually
  ships to the target machine (`system-prompt.txt`,
  `opencode.json.example`, `system-prompt-tools.js`,
  `models-dev-snapshot.json`, `captured-example-prompt.txt`,
  `default-prompt-original.txt`) — SETUP.md's `$SRC_DIR/...` paths all
  point in there now. `docker/` is the local dev/test sandbox
  (Dockerfile, docker-compose.yml, docker-entrypoint.sh,
  docker-notes.md, `.env` — see docker-notes.md's "Pinned version"
  section for why `.env` is committed and not secret). `plugins/` is
  the separate `opencode-hook-plugins` npm package (hook-logger +
  llm-review-gate) — a real part of this workspace's "write tools for
  opencode" scope, just not tied to the Qwen override; written directly
  against opencode's raw hook API and slated for a rewrite against a
  proper SDK. `docs/` is misc research notes plus
  `opencode-docs-reference/` (see above). `module-analysis/` is its own
  standalone toolkit, unchanged by the reorg — its concurrency/driver
  design is known to be rougher than the rest of this workspace.
  `.dockerignore` stays at the repo root
  (Docker looks for it at the build context root, and the context is
  the repo root even though the Dockerfile lives in `docker/`).
  `memory/` (added 2026-09-13, after the reorg) is git-tracked project
  memory — see its own `MEMORY.md` — kept deliberately separate from
  this file's technical "how to work on it" focus.
- opencode's real upstream repo is
  [anomalyco/opencode](https://github.com/anomalyco/opencode) (`dev`
  branch), npm package `opencode-ai`. Built-in agent definitions are in
  `packages/opencode/src/agent/agent.ts`; the four agents with their
  own dedicated native prompt (`explore`, `compaction`, `summary`,
  `title`) load them from `packages/opencode/src/agent/prompt/*.txt` in
  that repo. `build`, `plan`, and `general` have no prompt field set in
  source at all — originally verified against 1.14.30, re-confirmed
  2026-09-13 against 1.18.30 (npm-latest at the time) via the Docker
  sandbox below, so this still holds four minor versions later. Keep
  pinned versions at npm-latest and re-check this note on future
  upgrades rather than assuming it still holds. Permission
  logic is `packages/opencode/src/permission/index.ts`; the Task tool
  (subagent invocation) is `packages/opencode/src/tool/task.ts` +
  `task.txt`; base-prompt-by-model-ID selection is
  `packages/opencode/src/session/system.ts`.
- The actual target machine's model server (vLLM, reachable only from
  the restricted machine's own network, not from this dev machine)
  exposes an **OpenAI-compatible API** — relevant when someone finally
  writes the real `provider` block into `opencode.json` there; opencode
  supports OpenAI-compatible providers natively.
- **Two separate machines, not one — don't conflate them.** (1) The
  restricted/offline machine: single-user (belongs to the user alone,
  not shared), Windows, accessed via git-bash, no internet, opencode
  installed there (also used through `web`/`serve` modes, not just the
  CLI — doesn't matter for this override, all interfaces read the same
  `opencode.json`). This is where SETUP.md gets executed. (2) A
  *separate* model-serving machine/server running vLLM that exposes an
  OpenAI-compatible API reachable over the restricted machine's
  internal network — the user has **no admin access to this server**,
  only consumes it as an API client from the restricted machine's
  `opencode.json` provider config. So any changes to that server are
  its admin's business, not a second person touching the restricted
  machine or its `opencode.json` — no multi-user file-contention
  concern on the opencode side. Confirmed 2026-08-02.
  Model in use: **`Qwen3.6-35B-A3B`** (real, released 2026-04-16,
  Apache 2.0, sparse MoE — confirmed via web search, postdates the
  2026-01 knowledge cutoff, don't rely on training-data recall for this
  model). Native context 262,144 tokens, extensible to 1,010,000 via
  RoPE scaling — notably large, don't assume small-model context
  constraints apply here. Has a "thinking preservation" feature
  (retains reasoning traces across multi-turn) — worth checking whether
  `opencode.json`'s model config sets the `reasoning`/`interleaved`
  fields to actually take advantage of it. Hardware specs (GPU/VRAM) of
  the model server unknown. `$CONFIG_DIR` on the restricted machine is
  the opencode
  default (no override). Deployment happens by handing SETUP.md to the
  restricted machine's own opencode to execute (matches SETUP.md's
  intended usage — written for an agent to run, not a human to follow
  by hand).
- **Known model quirk, not an opencode/repo issue**: user hit a "tool
  call not supported" error on one smaller Qwen model (referred to as
  "qwen2.7b" — exact model unconfirmed). Not something this repo's
  system prompt override can fix; if it recurs, check vLLM's
  `--tool-call-parser` flag on the model server.

- **The models.dev catalog fetch doesn't block startup on a fully offline machine** (verified from source, 2026-08-02) — a build-time snapshot is embedded in the offline binary, so a fresh install resolves synchronously with zero network. Only cosmetic fallout: an hourly failed-fetch log line forever, harmless but annoying. Silence it with `OPENCODE_DISABLE_MODELS_FETCH=1`; add `OPENCODE_MODELS_PATH=<path>` (pointing at `deploy/models-dev-snapshot.json`, see SETUP.md step 3) too if you also want fresher data than the build-time snapshot — both vars are needed together, `OPENCODE_MODELS_PATH` alone doesn't stop the hourly retry. Not that it matters much either way: this setup's Qwen provider is defined by hand in `opencode.json`, not looked up from this catalog at all.
- Claude's own cross-session memory about this project lives at
  `~/.claude/projects/<encoded-cwd>/memory/` — the encoded-path segment
  is specific to the machine and user account the session runs under,
  so it will differ from machine to machine (this note previously
  pointed at a stale path from a different computer entirely — don't
  assume a memory path recorded here still resolves on whatever machine
  you're reading this from; check `MEMORY.md` in that directory).
