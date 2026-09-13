// Requires a live Oracle instance reachable via the env vars checked below -
// the docker/ sandbox's `oracle` compose service (see docker/docker-notes.md's
// "Oracle test instance" section), which opencode-dev's depends_on always
// brings up automatically. Not something this test can mock: it exercises
// the real oracledb round-trip, including the per-request-connection /
// autoCommit design decisions server.js makes. Lives here (not under
// tests/) so Node's module resolution finds this package's own
// node_modules - run via `node --test mcp/oracle/oracle.test.mjs` after
// `npm install` in this directory (see tests/run-in-container.sh).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));

for (const key of ["ORACLE_CONNECT_STRING", "ORACLE_USER", "ORACLE_PASSWORD"]) {
  if (!process.env[key]) {
    throw new Error(
      `${key} not set - this test needs a live Oracle instance (the docker/ sandbox's ` +
        "oracle service, see docker-notes.md), not a bare `node --test` on the host",
    );
  }
}

let client;

before(async () => {
  const transport = new StdioClientTransport({
    command: "node",
    args: [join(here, "server.js")],
    // StdioClientTransport does NOT inherit this process's environment by
    // default (see docker-notes.md) - without this, server.js exits
    // immediately for "missing connection details" even though this test
    // process itself has them.
    env: process.env,
  });
  client = new Client({ name: "oracle-mcp-test", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
});

after(async () => {
  await client?.close();
});

async function callOracleQuery(sql) {
  const result = await client.callTool({ name: "oracle_query", arguments: { sql } });
  return JSON.parse(result.content[0].text);
}

test("lists exactly the oracle_query tool", async () => {
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, "oracle_query");
});

test("runs a plain SELECT against dual", async () => {
  const result = await callOracleQuery("SELECT 1 AS one, 'hello' AS greeting FROM dual");
  assert.equal(result.success, true);
  assert.deepEqual(result.rows, [{ ONE: 1, GREETING: "hello" }]);
});

test("a write survives the per-request connection closing (autoCommit)", async () => {
  const table = `smoke_test_${Date.now()}`;
  try {
    await callOracleQuery(`CREATE TABLE ${table} (id NUMBER, name VARCHAR2(50))`);
    const insertResult = await callOracleQuery(`INSERT INTO ${table} (id, name) VALUES (1, 'alice')`);
    assert.equal(insertResult.success, true);
    assert.equal(insertResult.rowsAffected, 1);

    // A fresh tool call gets its own fresh Oracle connection (see
    // server.js's design notes) - if the INSERT above hadn't actually
    // committed before that connection closed, this SELECT (on a
    // different connection) would come back empty.
    const selectResult = await callOracleQuery(`SELECT * FROM ${table}`);
    assert.equal(selectResult.success, true);
    assert.deepEqual(selectResult.rows, [{ ID: 1, NAME: "alice" }]);
  } finally {
    await callOracleQuery(`DROP TABLE ${table}`);
  }
});

test("a query against a nonexistent table returns a clean error, not a crash", async () => {
  const result = await callOracleQuery("SELECT * FROM this_table_does_not_exist_12345");
  assert.equal(result.success, false);
  assert.match(result.error, /ORA-00942/);
});

test("a connection failure returns a clean error, not an MCP protocol crash", async () => {
  // Regression test for the bug found while first verifying this server
  // (see git history / mcp/oracle/README.md): oracledb.getConnection()
  // must be inside executeQuery()'s try block, or a connection failure
  // surfaces as a raw McpError instead of a normal {success: false} tool
  // result.
  const badTransport = new StdioClientTransport({
    command: "node",
    args: [join(here, "server.js")],
    env: { ...process.env, ORACLE_PASSWORD: "definitely-wrong-password" },
  });
  const badClient = new Client({ name: "oracle-mcp-test-bad-creds", version: "1.0.0" }, { capabilities: {} });
  await badClient.connect(badTransport);
  try {
    const result = await badClient.callTool({ name: "oracle_query", arguments: { sql: "SELECT 1 FROM dual" } });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.success, false);
    assert.ok(parsed.error, "expected a clean error message, not a crash");
  } finally {
    await badClient.close();
  }
});
