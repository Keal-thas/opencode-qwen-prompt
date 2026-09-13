import oracledb from "oracledb";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const ORACLE_CONNECT_STRING = process.env.ORACLE_CONNECT_STRING;
const ORACLE_USER = process.env.ORACLE_USER;
const ORACLE_PASSWORD = process.env.ORACLE_PASSWORD;

if (!ORACLE_CONNECT_STRING || !ORACLE_USER || !ORACLE_PASSWORD) {
  console.error("Missing Oracle connection details. Set ORACLE_CONNECT_STRING, ORACLE_USER, ORACLE_PASSWORD.");
  process.exit(1);
}

// Extension point for the audit layer this tool intentionally ships without:
// a rule-based (regex/keyword denylist) or LLM-based check (mirroring
// plugins/llm-review-gate.js's tool.execute.before gate) can plug in here
// later without touching executeQuery(). Until then this is a no-op that
// allows everything - oracle_query is a full passthrough by design, not an
// oversight. See mcp/oracle/README.md for why.
async function auditQuery(sql) {
  return { allow: true };
}

// One connection per request - opened and closed within a single call, not
// pooled or shared across requests. Deliberate, not the simple-but-wrong
// default:
// - a stray DML statement never outlives the request: closing an Oracle
//   session with uncommitted work implicitly rolls it back, so nothing can
//   hold row locks for the lifetime of this long-running server process
// - concurrent tool calls never race on the same session
// - a session killed or dropped on the DB side only fails the one request
//   in flight, never every request after it until the process is restarted
// Tradeoff: connection-setup latency on every call - fine for an
// interactive/low-QPS internal tool, not for anything latency-sensitive.
async function executeQuery(sql) {
  const verdict = await auditQuery(sql);
  if (!verdict.allow) {
    return { success: false, error: `Blocked by audit hook: ${verdict.reason ?? "no reason given"}` };
  }

  let connection;
  try {
    connection = await oracledb.getConnection({
      connectString: ORACLE_CONNECT_STRING,
      user: ORACLE_USER,
      password: ORACLE_PASSWORD,
    });

    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      // Passthrough includes DML. Without this, a successful UPDATE/INSERT
      // would report no error but silently roll back the moment the
      // connection closes right after - since every request gets its own
      // connection, that's immediately. Committing makes writes that are
      // sent actually take effect, matching "whatever request comes in,
      // just run it."
      autoCommit: true,
    });

    if (result.rows) {
      return {
        success: true,
        rows: result.rows,
        rowCount: result.rows.length,
        columns: (result.metaData ?? []).map((col) => col.name),
      };
    }

    // DDL/DML statements have no `rows` - report what changed instead.
    return {
      success: true,
      rowsAffected: result.rowsAffected ?? 0,
      message: "Statement executed, no result set",
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error("Error closing connection:", err);
      }
    }
  }
}

const server = new Server({ name: "oracle-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "oracle_query",
      description:
        "Execute an ad-hoc SQL statement against the configured Oracle database. Full passthrough - no read-only restriction, no keyword filtering.",
      inputSchema: {
        type: "object",
        properties: {
          sql: { type: "string", description: "The SQL statement to execute" },
        },
        required: ["sql"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "oracle_query") {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
  if (!args?.sql) {
    return { content: [{ type: "text", text: "Missing required argument: sql" }], isError: true };
  }

  const result = await executeQuery(args.sql);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Oracle MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
