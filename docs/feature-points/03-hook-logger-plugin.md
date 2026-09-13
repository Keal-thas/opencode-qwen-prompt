# hook-logger.ts plugin

Lives in `plugins/`. Logs essentially every opencode hook event (chat, tool execution, permission asks, compaction, etc.) as JSONL under `~/opencode-hook-output/<hook-name>.jsonl` — a general-purpose debugging/observability plugin, independent of the Qwen setup. Written in TypeScript against `@opencode-ai/plugin`'s `Plugin` type (the official SDK) rather than an untyped raw hook object.

**Tested:** `tests/unit/hook-logger.test.mjs` — per-hook-name file routing, append-not-overwrite across calls, circular-reference-safe serialization.
