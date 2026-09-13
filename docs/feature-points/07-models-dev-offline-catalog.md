# models.dev offline catalog handling

`deploy/models-dev-snapshot.json` (a snapshot from `opencode models --refresh`) plus the `OPENCODE_MODELS_PATH` / `OPENCODE_DISABLE_MODELS_FETCH` env vars, so the fully-offline target machine doesn't spend forever retrying a doomed network fetch. Cosmetic-only either way — this setup's actual Qwen provider is hand-defined in `opencode.json`, not looked up from this catalog.

**Tested:** `tests/unit/config-consistency.test.mjs` checks the snapshot file itself parses as valid JSON. The env-var behavior isn't tested — it's opencode's own internal background-refresh logic, not this repo's code.
