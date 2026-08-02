# Working notes for this repo

See README.md for what the project does and its current status/open
items. This file is about *how* to work on it.

## Hard-won lessons from building this

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
  directly from the CLI — it silently falls back to `build`). Still
  went and confirmed the `general` agent's missing prompt against
  actual upstream source (below) once it looked like a real gap worth
  acting on, rather than trusting the debug output alone.

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
  machine) is what all of the above was verified against.

- This repo used to be a subfolder of an unrelated Java project
  (`java-remote-debug-with-idea`) before being moved out — if you see
  references to that path in old commit messages, that's why.
- Claude's own cross-session memory about this project (for when a
  session starts elsewhere and this repo comes up) is a short pointer
  at `~/.claude/projects/C--Users-DecVens-Desktop-codes-opencode-qwen-prompt/memory/`
  — kept intentionally thin since the real content lives here now.
