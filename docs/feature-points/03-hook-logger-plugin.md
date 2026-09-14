# hook-logger.ts plugin

Lives in `plugins/`. Logs essentially every opencode hook event (chat, tool execution, permission asks, compaction, etc.) as JSONL under `~/opencode-hook-output/<hook-name>.jsonl` — a general-purpose debugging/observability plugin, independent of the Qwen setup. Written in TypeScript against `@opencode-ai/plugin`'s `Plugin` type (the official SDK) rather than an untyped raw hook object.

**Deployment (changed 2026-09-15):** the committed `plugins/opencode-hook-plugins-1.0.0.tgz` was packed and drift-tested from the start, but until now nothing actually installed it anywhere — SETUP.md's own deployment walkthrough never referenced it. SETUP.md step 5 now installs it on the target machine via a `file:` npm spec, purely opt-in (skip it unless specifically wanted) — see `docs/feature-points/02-system-prompt-tools-plugin.md` for the mechanism.

**Tested:** `tests/unit/hook-logger.test.mjs` — per-hook-name file routing, append-not-overwrite across calls, circular-reference-safe serialization. Its shipped packaging (the committed `plugins/opencode-hook-plugins-1.0.0.tgz` this source gets packed into) is separately covered by `tests/unit/plugins-tarball.test.mjs`.
