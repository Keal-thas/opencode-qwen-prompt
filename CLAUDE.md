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

## Where things live

- This repo used to be a subfolder of an unrelated Java project
  (`java-remote-debug-with-idea`) before being moved out — if you see
  references to that path in old commit messages, that's why.
- Claude's own cross-session memory about this project (for when a
  session starts elsewhere and this repo comes up) is a short pointer
  at `~/.claude/projects/C--Users-DecVens-Desktop-codes-opencode-qwen-prompt/memory/`
  — kept intentionally thin since the real content lives here now.
