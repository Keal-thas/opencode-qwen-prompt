# hook-logger.ts plugin

Lives in `plugins/`. Logs essentially every opencode hook event (chat, tool execution, permission asks, compaction, etc.) as JSONL under `~/opencode-hook-output/<hook-name>.jsonl` — a general-purpose debugging/observability plugin, independent of the Qwen setup. Written in TypeScript against `@opencode-ai/plugin`'s `Plugin` type (the official SDK) rather than an untyped raw hook object.

**Deployment (changed 2026-09-15, install mechanism changed 2026-09-16, simplified 2026-09-17):** SETUP.md step 5 copies `plugins/hook-logger.ts` as-is into opencode's local-plugin directory (`$CONFIG_DIR/plugins/`), auto-loaded at startup — no package, no registry. Independently installable from `llm-review-gate.ts` now that there's no shared package wrapping them — see `docs/feature-points/02-system-prompt-tools-plugin.md` for the mechanism and its history. Purely opt-in either way (skip it unless specifically wanted).

**Tested:** `tests/unit/hook-logger.test.mjs` — per-hook-name file routing, append-not-overwrite across calls, circular-reference-safe serialization. No packaging-drift test needed anymore — there's no packaging step to drift from.
