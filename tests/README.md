# Automated tests

Covers this workspace's feature points with tests that don't require the real vLLM + Qwen model server (none of it is reachable from here anyway - see CLAUDE.md). What's covered, per top-level feature:

- **Qwen prompt override** (`deploy/opencode.json.example` + `deploy/system-prompt.txt`) - `unit/config-consistency.test.mjs` checks the example config is valid JSON wiring `build`/`plan`/`general` to the prompt file, that the prompt file actually differs from the untouched upstream default, and that SETUP.md's inline documentation of the same JSON doesn't drift from the real example file. `integration/docker-prompt-override.test.sh` automates the manual check previously described (but not scripted) in `docker/docker-notes.md`: spins up a throwaway container from the real dev image, wires the override the way SETUP.md instructs, and asserts `opencode debug config` actually resolves `agent.*.prompt` to `system-prompt.txt`'s exact content.
- **`system-prompt-tools.js` plugin** (dumps the assembled prompt for manual inspection) - `unit/system-prompt-tools.test.mjs` calls its hook directly with fake `experimental.chat.system.transform` input and checks the dump file's header and content, including that each run overwrites rather than appends.
- **`hook-logger.ts` plugin** (logs every opencode hook event to JSONL) - `unit/hook-logger.test.mjs` calls several of its hooks directly and checks each hook name gets its own append-only `.jsonl` file, and that circular references in hook payloads are serialized instead of throwing.
- **`llm-review-gate.ts` plugin** (LLM safety review gating `bash` calls) - `unit/llm-review-gate.test.mjs` drives it with a fake opencode `client` (no real session, no model): ALLOW/BLOCK verdicts, non-gated tools skipped, the internal review session never reviewing its own calls, and fail-open behavior on a review error or an unparseable verdict.
- **`module-analysis/analyze-modules.sh`** (batch per-module analysis driver) - `integration/analyze-modules.test.sh` runs the real script against a stub `opencode` binary (`integration/fixtures/stub-bin/`) instead of the real CLI, covering the happy path, a failed module leaving no output but a captured log, and the resumability/skip logic for an already-analyzed module.
- **Shell scripts generally** (`docker/docker-entrypoint.sh`, `docs/fetch-opencode-docs.sh`, `module-analysis/analyze-modules.sh`) - `unit/shell-syntax.test.mjs` runs `bash -n` over all of them as a cheap regression net.
- **`mcp/oracle/` (oracle MCP server)** - `mcp/oracle/oracle.test.mjs` (not under `tests/unit`, so its `node_modules` resolve correctly - see the file's own header comment) drives the real server over the MCP protocol via `@modelcontextprotocol/sdk`'s `Client`: tool listing, a plain `SELECT`, a `CREATE TABLE`/`INSERT`/`SELECT`/`DROP TABLE` round-trip that checks a write actually survives the per-request connection closing (`autoCommit`), a query against a nonexistent table, and a regression test for a connection-failure bug found while first verifying this server by hand. Needs a real Oracle instance - the docker sandbox's `oracle` service (see `docker/docker-notes.md`), which `opencode-dev`'s `depends_on` always brings up first, so this test can assume it's already there.

Not covered: `docs/fetch-opencode-docs.sh`'s actual GitHub fetch (would hit the network on every test run for no real benefit - it's a docs mirror refresh, not app logic), and anything that requires the real vLLM + Qwen server, which isn't reachable from this machine at all.

## Running the tests

**Development and testing for this repo always happen inside the `docker/` sandbox, never against the host's own node/opencode install** - see CLAUDE.md. The one entry point:

```bash
./tests/run-all.sh
```

This builds the dev image if needed, then runs everything in two stages:

1. `docker compose -f docker/docker-compose.yml run --rm opencode-dev bash tests/run-in-container.sh` - the unit tests (`node --test tests/unit`) and the `analyze-modules.sh` integration test, all executed *inside* the dev container.
2. `tests/integration/docker-prompt-override.test.sh` - the one script that's an exception to "everything runs in the container": it's the thing invoking `docker run` in the first place, so it necessarily runs on the host (same as every `docker compose ...` command already documented in `docker/docker-notes.md`). It touches no host node/opencode install and none of the sandbox's persistent named volumes - it starts its own disposable container with a throwaway `HOME`, so a real dev session's saved provider config is never at risk. Everything it actually asserts on (the real `opencode debug config` resolution) still runs inside that container, not on the host.

To run just the container-side suite (e.g. while iterating, without the slower Docker-launching test):

```bash
docker compose -f docker/docker-compose.yml run --rm opencode-dev bash tests/run-in-container.sh
```
