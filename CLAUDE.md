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

- This repo used to be a subfolder of an unrelated Java project
  (`java-remote-debug-with-idea`) before being moved out — if you see
  references to that path in old commit messages, that's why.
- Claude's own cross-session memory about this project (for when a
  session starts elsewhere and this repo comes up) is a short pointer
  at `~/.claude/projects/C--Users-DecVens-Desktop-codes-opencode-qwen-prompt/memory/`
  — kept intentionally thin since the real content lives here now.
