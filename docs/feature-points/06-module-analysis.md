# module-analysis toolkit

Standalone, lives in `module-analysis/`. `analyze-modules.sh` runs one `opencode run --agent plan` call per module subdirectory of a large codebase, producing an architecture-map doc per module. Concurrency-limited, resumable (skips modules with a non-empty output file already), edit/write denied by permission so the analyzing agent can't touch the code it's analyzing.

**Tested:** `tests/integration/analyze-modules.test.sh`, run against a stub `opencode` binary (`tests/integration/fixtures/stub-bin/`) — no real CLI or model needed. Covers the happy path, a failed module leaving no output but a captured log, and the resumability/skip logic for an already-analyzed module.
