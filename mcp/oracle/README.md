# oracle mcp server

A minimal MCP server exposing one tool, `oracle_query`, that runs an arbitrary SQL statement against a configured Oracle database and returns the result as JSON. Built directly against the official `@modelcontextprotocol/sdk` and `oracledb` (thin mode, no Oracle Instant Client needed - works on a fully offline machine), same pattern as `plugins/` in this repo: hand-rolled against the raw API rather than adopting a heavier framework.

## Design, and why it looks the way it does

- **Full passthrough, by design, not by omission.** `oracle_query` executes whatever SQL string it's given - no read-only enforcement, no keyword filtering, DDL/DML included. Safety is meant to live at two other layers instead: the DB account's own grants (a read-only account is a config choice at connection time, not something this code should second-guess), and the `auditQuery()` hook in `server.js` - currently a no-op that allows everything. A rule-based (regex/keyword denylist) or LLM-based check (mirroring `plugins/llm-review-gate.ts`'s `tool.execute.before` gate) can drop in there later without touching the rest of the file.
- **One connection per request**, opened and closed within a single call - not a shared/pooled connection kept alive for the life of the process. Three things fall out of that: a stray DML statement can never outlive its request, because closing an Oracle session with uncommitted work implicitly rolls it back, so nothing can hold row locks for as long as this server happens to stay running; concurrent tool calls never race on the same session; and a session killed or dropped on the DB side only fails the one request in flight, not every request after it until someone restarts the process. The cost is a fresh connection's setup latency on every call, which is fine for an interactive/low-QPS internal tool and not the right tradeoff for anything latency-sensitive.
- **`autoCommit: true`** on every execute. Given the passthrough design above includes DML, leaving this off would make a successful UPDATE/INSERT report no error and then silently roll back the moment the connection closes right after - which, with one connection per request, is immediately. Turning it on makes a write that's sent actually take effect.

See [`Keal-thas/oracle-mcp-server-nodejs`](https://github.com/Keal-thas/oracle-mcp-server-nodejs) for the earlier, simpler version this one replaces the connection-handling and audit-hook design of - that one uses a single long-lived shared connection and has no extension point for an audit layer.

## Configuration

Copy `.env.example` to `.env` and fill in real values, or (once wired into `opencode.json`'s `mcp` block as a `local` server) pass them via that entry's `environment` field instead - prefer that over the `.env` file once this is actually deployed, so credentials live in `opencode.json` (which itself should stay out of git on the machine it's deployed to) rather than a second file.

- `ORACLE_CONNECT_STRING` - an Oracle Easy Connect string (`host:port/service_name`), not a JDBC URL
- `ORACLE_USER`
- `ORACLE_PASSWORD`

## Run

```bash
npm install
npm start
```

Listens on stdio for MCP protocol messages.

## Testing against a real Oracle instance

`docker/docker-compose.yml` has an `oracle` service (`gvenzl/oracle-free`, see `docker/docker-notes.md`'s "Oracle test instance" section for the tradeoffs behind this) that `opencode-dev` automatically brings up and waits on - no separate step needed. From the repo root:

```sh
docker compose -f docker/docker-compose.yml run --rm opencode-dev bash
```

`ORACLE_CONNECT_STRING`/`ORACLE_USER`/`ORACLE_PASSWORD` are already set inside that shell, pointing at the sibling `oracle` service - just `cd mcp/oracle && npm install && npm start`. First time on a fresh machine or volume, that `run` command itself takes 1-3 minutes before the shell even opens (Oracle's first-time DB init) - see docker-notes.md.

## Status

Verified end-to-end against the sandbox's `oracle` service via a real MCP client round-trip: `SELECT ... FROM dual`, `CREATE TABLE`, `INSERT`, then a fresh request's `SELECT *` confirming the insert actually persisted (proving `autoCommit: true` survives the per-request connection closing), `DROP TABLE`, and a query against a nonexistent table to check the error path (`ORA-00942` surfaced cleanly as `{success: false, error}`, not a crash). Wired into `deploy/opencode.json.example` (an `mcp.oracle` entry, `enabled: false` with placeholder credentials - see SETUP.md step 5) and covered by an automated test, `oracle.test.mjs` (see `tests/README.md`), which repeats the manual verification above plus a regression check for the connection-failure bug - written without running Docker, so not yet confirmed passing; run `./tests/run-all.sh` to check. The `auditQuery()` hook is an intentional no-op until a rule-based or LLM-based check is designed for it.
