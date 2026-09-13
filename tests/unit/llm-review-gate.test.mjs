// llm-review-gate.js takes its opencode `client` as a constructor argument,
// so it can be exercised with a fake client here - no real opencode session,
// no model server, no network. outDir is still homedir()-derived at import
// time, so HOME is redirected first like the other plugin tests.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fakeHome = await mkdtemp(join(tmpdir(), "llm-review-gate-test-"));
process.env.HOME = fakeHome;

const { LlmReviewGate } = await import("../../plugins/llm-review-gate.js");
const logFile = join(fakeHome, "opencode-hook-output", "llm-review.jsonl");

after(() => rm(fakeHome, { recursive: true, force: true }));

function textResponse(text) {
  return { data: { parts: [{ type: "text", text }] } };
}

// Each test gets its own fake client/gate instance so review-session state
// (reviewSessionID, reviewSessionIDs) never leaks between tests.
function makeGate(promptImpl) {
  let sessionCounter = 0;
  const client = {
    session: {
      create: async () => ({ data: { id: `review-session-${++sessionCounter}` } }),
      prompt: promptImpl,
    },
  };
  return LlmReviewGate({ client });
}

async function lastLogEntry() {
  const lines = (await readFile(logFile, "utf-8")).trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

test("allows a bash command when the review verdict is ALLOW", async () => {
  const hooks = await makeGate(async () => textResponse("ALLOW"));
  await assert.doesNotReject(() =>
    hooks["tool.execute.before"]({ tool: "bash", sessionID: "user-session", callID: "c1" }, { args: { command: "ls -la" } }),
  );
  assert.equal((await lastLogEntry()).verdict, "allow");
});

test("blocks a bash command when the review verdict is BLOCK, surfacing the stated reason", async () => {
  const hooks = await makeGate(async () => textResponse("BLOCK: deletes the whole home directory"));
  await assert.rejects(
    () => hooks["tool.execute.before"]({ tool: "bash", sessionID: "s", callID: "c1" }, { args: { command: "rm -rf ~" } }),
    /deletes the whole home directory/,
  );
  assert.equal((await lastLogEntry()).verdict, "block");
});

test("never sends non-gated tools (e.g. edit) to review", async () => {
  let called = false;
  const hooks = await makeGate(async () => {
    called = true;
    return textResponse("BLOCK: should never run");
  });
  await hooks["tool.execute.before"]({ tool: "edit", sessionID: "s", callID: "c1" }, { args: { filePath: "x" } });
  assert.equal(called, false);
});

test("never reviews the internal review session's own tool calls (no self-recursion)", async () => {
  let calls = 0;
  const hooks = await makeGate(async () => {
    calls++;
    return textResponse("ALLOW");
  });

  // First gated call lazily creates the internal review session.
  await hooks["tool.execute.before"]({ tool: "bash", sessionID: "user-session", callID: "c1" }, { args: { command: "ls" } });
  assert.equal(calls, 1);

  // A later call whose sessionID *is* that internal review session must be
  // skipped outright, even though the tool is gated.
  await hooks["tool.execute.before"]({ tool: "bash", sessionID: "review-session-1", callID: "c2" }, { args: { command: "rm -rf /" } });
  assert.equal(calls, 1, "the review session's own bash calls must never be gated");
});

test("fails open (allows) when the review call throws, per FAIL_OPEN_ON_ERROR default", async () => {
  const hooks = await makeGate(async () => {
    throw new Error("model server down");
  });
  await assert.doesNotReject(() =>
    hooks["tool.execute.before"]({ tool: "bash", sessionID: "s", callID: "c1" }, { args: { command: "ls" } }),
  );
  const entry = await lastLogEntry();
  assert.match(entry.decision, /fail-open/);
  assert.match(entry.error, /model server down/);
});

test("allows when the verdict text can't be parsed as ALLOW/BLOCK (fail-open default)", async () => {
  const hooks = await makeGate(async () => textResponse("uh, maybe? not sure"));
  await assert.doesNotReject(() =>
    hooks["tool.execute.before"]({ tool: "bash", sessionID: "s", callID: "c1" }, { args: { command: "ls" } }),
  );
  assert.equal((await lastLogEntry()).verdict, "unclear");
});
