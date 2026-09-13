# llm-review-gate.js plugin

Lives in `plugins/`. Gates `bash` tool calls behind an LLM safety review: before a command runs, it's sent to a hidden internal opencode session for an ALLOW/BLOCK verdict, layered on top of (not replacing) opencode's own permission config. Fails open on review errors/timeouts by default (`FAIL_OPEN_ON_ERROR`, configurable). Never reviews its own internal review session's own calls (no recursion).

**Tested:** `tests/unit/llm-review-gate.test.mjs` — ALLOW/BLOCK paths, non-gated tools skipped entirely, self-recursion guard, fail-open on review error or an unparseable verdict. Driven with a fake opencode `client`, so no real session or model server is needed.
