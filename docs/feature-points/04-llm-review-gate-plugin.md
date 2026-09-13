# llm-review-gate.ts plugin

Lives in `plugins/`. Gates `bash` tool calls behind an LLM safety review: before a command runs, it's sent to a hidden internal opencode session for an ALLOW/BLOCK verdict, layered on top of (not replacing) opencode's own permission config. Fails open on review errors/timeouts by default (`FAIL_OPEN_ON_ERROR`, configurable). Never reviews its own internal review session's own calls (no recursion). Written in TypeScript against `@opencode-ai/plugin`'s `Plugin` type (the official SDK) rather than an untyped raw hook object.

**Tested:** `tests/unit/llm-review-gate.test.mjs` — ALLOW/BLOCK paths, non-gated tools skipped entirely, self-recursion guard, fail-open on review error or an unparseable verdict. Driven with a fake opencode `client`, so no real session or model server is needed. Its shipped packaging (the committed `plugins/opencode-hook-plugins-1.0.0.tgz` this source gets packed into) is separately covered by `tests/unit/plugins-tarball.test.mjs`.
