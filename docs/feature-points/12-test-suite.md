# Automated test suite

Lives in `tests/`. Covers feature points 1–4, 6, and 13–15 end-to-end, plus a packaging-integrity check that each committed plugin tarball (`plugins/system-prompt-tools/`, `plugins/hook-logger/`, `plugins/llm-review-gate/`, feature points 2–4) actually matches its current source. Feature points 16–17 (java-lsp/spring-lsp) are not part of this suite yet — see their own feature-point docs. Always runs inside the `docker/` sandbox per project convention (see CLAUDE.md); one entry point, `./tests/run-all.sh`.

Full breakdown and run instructions: `tests/README.md` — that's the canonical, test-focused reference; this file is the general project-feature inventory (this whole `docs/feature-points/` set), cross-referencing it rather than duplicating it.
