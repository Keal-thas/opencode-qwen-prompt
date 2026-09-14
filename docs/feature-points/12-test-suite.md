# Automated test suite

Added this session, lives in `tests/`. Covers feature points 1–4 and 6 end-to-end, plus a packaging-integrity check that each committed plugin tarball (`plugins/opencode-hook-plugins-1.0.0.tgz` for feature points 3–4, `deploy/opencode-system-prompt-tools-1.0.0.tgz` for feature point 2) actually matches its current source. Always runs inside the `docker/` sandbox per project convention (see CLAUDE.md); one entry point, `./tests/run-all.sh`.

Full breakdown and run instructions: `tests/README.md` — that's the canonical, test-focused reference; this file is the general project-feature inventory (this whole `docs/feature-points/` set), cross-referencing it rather than duplicating it.
