# opencode system prompt: override + view

This repo overrides the system prompt opencode sends to a model, using
opencode's own config — no plugin required for the override itself.

Setup instructions live in [SETUP.md](SETUP.md) — that file is written
to be handed directly to an agent (paste it as a task, or point a coding
agent at this repo) and executed step by step, since the intended
machine to run this on is a network-restricted box you'd rather not do
this by hand on repeatedly. This file (README.md) is the human-readable
explanation of what it does and why.

## What's here

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
- `CLAUDE.md` — working notes for whoever (human or agent) edits this
  repo further.

## How the override works

opencode's per-agent `prompt` config field fully replaces the built-in
provider prompt (e.g. `default.txt`) — verified by testing directly
against a real opencode install, not assumed from docs. Environment
info (`<env>` block: working directory, git repo check, platform, date)
and any `instructions` files you configure are generated fresh by
opencode itself and still get appended after your custom prompt,
untouched — you don't have to reconstruct that yourself.

## Why system-prompt.txt looks the way it does

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

Only `build` and `plan` agents should get this prompt (see
`opencode.json.example`) — the other built-in agents (`compaction`,
`summary`, `title`, `explore`, `general`) do narrow internal jobs and
don't benefit from a "talk to an expert engineer" identity.

## Status / open items

- Never tested against the actual Ollama/vLLM + Qwen setup — only
  validated against opencode's own hosted free models on a separate dev
  machine. Run the viewer plugin once against the real setup before
  trusting that it also falls back to `default.txt`.
- The target restricted machine runs opencode as an offline single-exe
  build with git-bash available, but has no internet access at all —
  the repo gets downloaded as a zip on a separate sandboxed machine
  that does have internet, then transferred over and extracted locally.
  SETUP.md assumes the extracted copy is already sitting on disk and
  works entirely offline from there.
