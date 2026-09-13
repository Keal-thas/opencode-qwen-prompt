# oracle mcp server

A minimal MCP server exposing one tool, `oracle_query`, that runs an arbitrary SQL statement against a configured Oracle database and returns the result as JSON. Built directly against the official `@modelcontextprotocol/sdk` and `oracledb` (thin mode, no Oracle Instant Client needed - works on a fully offline machine), same pattern as `plugins/` in this repo: hand-rolled against the raw API rather than adopting a heavier framework. Speaks MCP over the SDK's Streamable HTTP transport, as a persistent process opencode connects to (`type: "remote"`) rather than one it spawns and owns (`type: "local"`) - see the next section for why.

## Design, and why it looks the way it does

- **Remote (`type: "remote"` in opencode's config), not local.** Earlier versions of this server spoke MCP over stdio, with opencode spawning `node server.js` as a child process and owning its lifecycle - simple, but it ties this server's uptime to opencode's own process, and every opencode restart tears it down and re-spawns it. It's now a persistent HTTP server, started independently (`npm start` under a process supervisor, or however this machine's other long-running processes are managed - see `deploy/opencode.json.example`/SETUP.md step 5) and reachable at a fixed URL. opencode just connects to that URL like any other HTTP client; nothing about the server's own uptime depends on whether or how often opencode is running. It still runs on the same machine as opencode in this repo's actual deployment - "remote" describes the connection model (an independently-managed endpoint), not a different host.
- **Stateless HTTP, one `Server`/transport pair per request** (`sessionIdGenerator: undefined` on `StreamableHTTPServerTransport`, matching the SDK's own reference stateless-server example) rather than one long-lived pair shared across all callers. There's no session state worth keeping between calls - each `oracle_query` call is already a fresh, independent Oracle connection (see below) - so sharing one MCP `Server`/transport across requests would only add a way for concurrent requests to interfere with each other for no benefit.
- **Full passthrough, by design, not by omission.** `oracle_query` executes whatever SQL string it's given - no read-only enforcement, no keyword filtering, DDL/DML included. Safety is meant to live at two other layers instead: the DB account's own grants (a read-only account is a config choice at connection time, not something this code should second-guess), and the `auditQuery()` hook in `server.js` - currently a no-op that allows everything. A rule-based (regex/keyword denylist) or LLM-based check (mirroring `plugins/llm-review-gate.js`'s `tool.execute.before` gate) can drop in there later without touching the rest of the file.
- **One Oracle connection per request**, opened and closed within a single call - not a shared/pooled connection kept alive for the life of the process. Three things fall out of that: a stray DML statement can never outlive its request, because closing an Oracle session with uncommitted work implicitly rolls it back, so nothing can hold row locks for as long as this server happens to stay running; concurrent tool calls never race on the same session; and a session killed or dropped on the DB side only fails the one request in flight, not every request after it until someone restarts the process. The cost is a fresh connection's setup latency on every call, which is fine for an interactive/low-QPS internal tool and not the right tradeoff for anything latency-sensitive.
- **`autoCommit: true`** on every execute. Given the passthrough design above includes DML, leaving this off would make a successful UPDATE/INSERT report no error and then silently roll back the moment the connection closes right after - which, with one connection per request, is immediately. Turning it on makes a write that's sent actually take effect.

See [`Keal-thas/oracle-mcp-server-nodejs`](https://github.com/Keal-thas/oracle-mcp-server-nodejs) for the earlier, simpler version this one replaces the connection-handling and audit-hook design of - that one uses a single long-lived shared connection and has no extension point for an audit layer.

## Configuration

Copy `.env.example` to `.env` and fill in real values, or set them however the process supervisor that starts this server (see Run below) is configured to pass environment variables. Unlike a `local` MCP server, a `remote` one's `opencode.json` entry carries no `environment` field at all (just a `url`) - opencode never starts this process, so it has no credentials to pass it in the first place. Wherever this server actually gets started is what needs these set.

- `ORACLE_CONNECT_STRING` - an Oracle Easy Connect string (`host:port/service_name`), not a JDBC URL
- `ORACLE_USER`
- `ORACLE_PASSWORD`
- `ORACLE_MCP_PORT` - port to listen on (optional, defaults to `8090`)

## Run

```bash
npm install
npm start
```

Starts a persistent HTTP server listening on `ORACLE_MCP_PORT` (default `8090`), serving MCP over the Streamable HTTP transport at `/mcp` - e.g. `http://localhost:8090/mcp`. Point opencode at it with a `type: "remote"` MCP entry (see `deploy/opencode.json.example` and SETUP.md step 5); opencode connects to this endpoint rather than spawning the process, so it needs to already be running and left running - `npm start` on its own exits the moment its terminal closes, which is fine for a quick manual check but not for real use (see the Design section above for the actual supervisor options).

## Testing against a real Oracle instance

`docker/docker-compose.yml` has an `oracle` service (`gvenzl/oracle-free`, see `docker/docker-notes.md`'s "Oracle test instance" section for the tradeoffs behind this) that `opencode-dev` automatically brings up and waits on - no separate step needed. From the repo root:

```sh
docker compose -f docker/docker-compose.yml run --rm opencode-dev bash
```

`ORACLE_CONNECT_STRING`/`ORACLE_USER`/`ORACLE_PASSWORD` are already set inside that shell, pointing at the sibling `oracle` service - just `cd mcp/oracle && npm install && npm start`, then hit `http://localhost:8090/mcp` from an MCP client (or `curl`) inside that same container. First time on a fresh machine or volume, that `run` command itself takes 1-3 minutes before the shell even opens (Oracle's first-time DB init) - see docker-notes.md.

`oracle.test.mjs` (see below and `tests/README.md`) doesn't need this manual dance - it starts and stops its own `server.js` process itself, on its own port, as part of the test run.

## Status

Verified end-to-end against the sandbox's `oracle` service via a real MCP client round-trip: `SELECT ... FROM dual`, `CREATE TABLE`, `INSERT`, then a fresh request's `SELECT *` confirming the insert actually persisted (proving `autoCommit: true` survives the per-request connection closing), `DROP TABLE`, and a query against a nonexistent table to check the error path (`ORA-00942` surfaced cleanly as `{success: false, error}`, not a crash) - originally over stdio, since re-verified over the current Streamable HTTP transport the same way (see below). Wired into `deploy/opencode.json.example` (an `mcp.oracle` entry, `type: "remote"`, `enabled: false` - see SETUP.md step 5) and covered by an automated test, `oracle.test.mjs` (see `tests/README.md`), which repeats the verification above plus a regression check for the connection-failure bug, driving the server over real HTTP rather than stdio. The `auditQuery()` hook is an intentional no-op until a rule-based or LLM-based check is designed for it.

**2026-09-14: converted from a `local`/stdio MCP server to `type: "remote"`/Streamable HTTP** - opencode now connects to an independently-started, long-lived process instead of spawning and owning it (see the Design section above for why). Verified against the SDK's actually-pinned version (`@modelcontextprotocol/sdk@1.30.0`, per `package-lock.json`) by downloading the real published package and reading its compiled `.d.ts`/`.js` for `StreamableHTTPServerTransport`/`StreamableHTTPClientTransport` rather than assuming the API from general docs, then confirmed end-to-end via `./tests/run-all.sh` in the docker sandbox.
