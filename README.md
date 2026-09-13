# opencode tooling workspace

A workspace for building things on top of `opencode` (the CLI coding
agent): a system-prompt override for a specific Qwen deployment, a
couple of custom opencode plugins, a practical script for using
opencode to analyze a large codebase, and MCP servers for LAN-internal
ops tooling. The prompt override was the first piece and gives the repo
its name, but it's one component, not the whole scope — see "Repo
layout" below for what else lives here and why.

The prompt override's setup instructions live in
[SETUP.md](SETUP.md) — that file is written to be handed directly to
an agent (paste it as a task, or point a coding agent at this repo)
and executed step by step, since the intended machine to run this on
is a network-restricted box you'd rather not do this by hand on
repeatedly. This file (README.md) is the human-readable explanation of
what it does and why.
[SETUP-walkthrough.zh.md](SETUP-walkthrough.zh.md) is a Chinese,
human-facing walkthrough of the same SETUP.md steps — for whoever is
watching over (or manually doing) the deployment on that machine, not
meant to be executed literally (hence not named `SETUP.zh.md` — it's
not a translation of the executable script, it's a different kind of
document).

## Repo layout

- `deploy/` — the Qwen prompt-override payload, the piece that
  actually ships to the target machine (see below).
- `docker/` — a local Docker sandbox for exercising this workspace's
  prompt/plugins against a real `opencode` install without touching
  your own machine's opencode config; see `docker/docker-notes.md`.
- `plugins/` — a standalone npm package of custom opencode hook
  plugins (`hook-logger.ts` + `llm-review-gate.ts`) — part of the
  "writing tools for opencode" side of this workspace, not the Qwen
  override. Written in TypeScript against `@opencode-ai/plugin`'s
  `Plugin` type (the official SDK), not hand-rolled against the raw
  hook API anymore.
- `module-analysis/` — a practical script for using opencode to
  generate an architecture map of a large codebase. Its own thing, not
  tied to the Qwen setup; see `module-analysis/README.md`. The
  concurrency/driver design here is known to be rougher than the rest
  of this workspace and likely to get revisited.
- `docs/` — misc research notes plus a local mirror of opencode's own
  docs (`docs/opencode-docs-reference/`), and
  [`docs/feature-points.md`](docs/feature-points.md) (+
  `docs/feature-points/`) — a feature-by-feature inventory of this
  workspace, cross-referencing what `tests/` covers for each.
- `CLAUDE.md` — working notes for whoever (human or agent) edits this
  repo further.
- `TODO.md` — concrete, actionable follow-up work still to be done.
- `memory/` — git-tracked project memory (who's behind this, what it
  is at a glance), kept separate from CLAUDE.md's technical focus.
- `tests/` — automated tests covering this workspace's feature points
  (the prompt override, both plugins, `analyze-modules.sh`); see
  `tests/README.md`. Always run inside the `docker/` sandbox, never
  against the host's own node/opencode install — `./tests/run-all.sh`
  is the one entry point.
- `mcp/` — MCP servers for LAN-internal ops tooling (Oracle so far;
  see `mcp/TODO.md` for what's next). One subdirectory per server,
  each a standalone npm package in the same hand-rolled-against-the-
  raw-SDK style as `plugins/`.

## Qwen prompt override

opencode overrides the system prompt it sends to a model using its own
config — no plugin required for the override itself.

### What's in `deploy/`

- `system-prompt.txt` — the actual replacement prompt content, edit to
  taste.
- `opencode.json.example` — the config that wires `system-prompt.txt` in.
- `system-prompt-tools.js` — optional plugin, dumps the fully-assembled
  system prompt to a local file on every request. Diagnostic only, not
  required for the override to work.
- `captured-example-prompt.txt` — a real capture from a test run
  against opencode's own hosted `north-mini-code-free` model, kept as a
  reference for what the plugin's dump output looks like. Not your Qwen
  setup's actual prompt.
- `models-dev-snapshot.json` — a local copy of opencode's models.dev
  metadata catalog (from `opencode models --refresh` on a machine with
  internet), for the fully-offline restricted machine to point
  `OPENCODE_MODELS_PATH` at instead of ever trying to fetch it live.
  See SETUP.md step 3. Optional — the offline build already has a
  build-time snapshot baked in as a fallback either way.

### How the override works

opencode's per-agent `prompt` config field fully replaces the built-in
provider prompt (e.g. `default.txt`) — verified by testing directly
against a real opencode install, not assumed from docs. Environment
info (`<env>` block: working directory, git repo check, platform, date)
and any `instructions` files you configure are generated fresh by
opencode itself and still get appended after your custom prompt,
untouched — you don't have to reconstruct that yourself.

### Why system-prompt.txt looks the way it does

Written for a professional user, so the hand-holding tone and few-shot
examples in opencode's default `default.txt` are stripped out (things
like "here's how to answer 2+2"). But not everything that was cut stayed
cut — after diffing against upstream `default.txt`, three rules got put
back because they're safety/quality guardrails, not hand-holding:

- Never invent or guess a URL
- Explain a command before running it if it's non-trivial or changes
  system state
- Don't take actions beyond what was actually asked, even if it seems
  helpful

A fourth line was put back for a different reason — not safety, but
because dropping it silently disabled a whole mechanism: `default.txt`
tells the model to delegate broad file search to the Task tool "in
order to reduce context usage." The rewritten tone section had
flattened that into plain "prefer grep/glob," which is direct-search
advice, not a delegate-to-subagent instruction — so the model had no
prompt-level reason to ever spawn a subagent. Put back (reworded) as:
delegate broad/open-ended exploration to the Task tool.

`build`, `plan`, and `general` agents should get this prompt (see
`deploy/opencode.json.example`). `compaction`, `summary`, and `title` each
ship their own narrow, task-specific native prompt (context
summarization, PR-style session summary, title generation
respectively) loaded from their own file in opencode's source
(`packages/opencode/src/agent/prompt/*.txt` in
[anomalyco/opencode](https://github.com/anomalyco/opencode), `dev`
branch) — nothing to do with coding style, overriding those would
actively hurt them. `explore` also has its own native prompt file
(read-only "file search specialist" role) that's already well-suited
to its job. `general`, however, has **no prompt field set at all** in
that same source (`packages/opencode/src/agent/agent.ts`) — same as
`build`/`plan` — confirmed against the actual upstream source, not
just `opencode debug agent <name>` output on this machine. Like
`build`/`plan` it has full bash/edit/write access and does real
multi-step engineering work per its description, so left unconfigured
it silently falls back to the full hand-holding `default.txt` — and,
before the Task-tool line above was restored, would never even get
invoked by the model in the first place. It gets the same override as
`build`/`plan`.

### Status / open items

- Never tested against the actual vLLM + Qwen setup — only validated
  against opencode's own hosted free models on a separate dev machine.
  Run the viewer plugin once against the real setup before
  trusting that it also falls back to `default.txt`.
- The target restricted machine runs opencode as an offline single-exe
  build with git-bash available, but has no internet access at all —
  the repo gets downloaded as a zip on a separate sandboxed machine
  that does have internet, then transferred over and extracted locally.
  SETUP.md assumes the extracted copy is already sitting on disk and
  works entirely offline from there.

See [TODO.md](TODO.md) for concrete planned/needed follow-up work.
