# Automated test suite

Added this session, lives in `tests/`. Covers feature points 1–4 and 6 end-to-end, plus (added later) a packaging-integrity check that the committed `plugins/opencode-hook-plugins-1.0.0.tgz` (feature points 3 and 4's shipped form) actually matches its current source. Always runs inside the `docker/` sandbox per project convention (see CLAUDE.md); one entry point, `./tests/run-all.sh`.

Full breakdown and run instructions: `tests/README.md` — that's the canonical, test-focused reference; this file is the general project-feature inventory (this whole `docs/feature-points/` set), cross-referencing it rather than duplicating it.
