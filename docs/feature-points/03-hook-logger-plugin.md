# hook-logger.ts plugin

Lives in `plugins/`. Logs essentially every opencode hook event (chat, tool execution, permission asks, compaction, etc.) as JSONL under `~/opencode-hook-output/<hook-name>.jsonl` — a general-purpose debugging/observability plugin, independent of the prompt override. Written in TypeScript against `@opencode-ai/plugin`'s `Plugin` type (the official SDK) rather than an untyped raw hook object.

**Deployment (changed 2026-09-15, install mechanism changed 2026-09-16, briefly de-packaged then re-packaged 2026-09-17):** own npm package at `plugins/hook-logger/` (`package.json` + the committed `opencode-hook-logger-1.0.0.tgz`), installed on the target machine by extracting the tarball into opencode's own package cache and referencing it as a bare `opencode-hook-logger@1.0.0` (SETUP.md step 5), purely opt-in (skip it unless specifically wanted) and independently of `llm-review-gate/` — see `docs/feature-points/02-system-prompt-tools-plugin.md` for the mechanism and its history.

**Tested:** `tests/unit/hook-logger.test.mjs` — per-hook-name file routing, append-not-overwrite across calls, circular-reference-safe serialization. Its shipped packaging (the committed `opencode-hook-logger-1.0.0.tgz`) is separately covered by `tests/unit/plugins-tarball.test.mjs`.
