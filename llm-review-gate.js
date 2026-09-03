import { appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// permission.ask exists in @opencode-ai/plugin's type definitions but is
// never actually dispatched by opencode's runtime (verified against the
// real dev-branch source, not just the docs/types) - so it cannot be used
// to intercept allow/ask/deny decisions. tool.execute.before is the real,
// working interception point: it fires unconditionally before the tool's
// own permission check runs, and throwing inside it blocks the call
// outright (same mechanism the official .env-protection example plugin
// uses). That gives us the layering the user asked for:
//   - config says "allow" -> review still runs first; only a clean
//     "allow" verdict lets it fall through to the real auto-run.
//   - config says "ask"   -> review runs before the human is ever
//     prompted; a "block" verdict short-circuits before that prompt.
//   - config says "deny"  -> review still runs (and gets logged) even
//     though the config's own deny wins either way - we can only ever
//     ADD a block here, never remove one the config would apply later.

// Tool names that get an LLM safety review before they're allowed to run.
// Extend this to gate more tools (e.g. "edit", "webfetch").
const GATED_TOOLS = new Set(["bash"]);

// If the review call itself fails (model server down, network error,
// timeout) this decides what happens: true = let the command through
// (an availability failure isn't a security verdict, and fail-closed
// here would brick every bash call including the ones needed to debug
// why review is down). Flip to false for stricter fail-closed behavior.
const FAIL_OPEN_ON_ERROR = true;

const REVIEW_TIMEOUT_MS = 30_000;

const outDir = join(homedir(), "opencode-hook-output");

async function logReview(entry) {
  const file = join(outDir, "llm-review.jsonl");
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
  try {
    if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
    await appendFile(file, line);
  } catch (e) {
    // logging must never be the reason the gate itself breaks
  }
}

const REVIEW_SYSTEM_PROMPT = `You are a security gate reviewing a single shell command before it is allowed to run on the user's machine. You are NOT the assistant helping the user - you only judge this one command in isolation, with no other context.

Block a command only if it is clearly destructive, irreversible, or likely to cause real harm without the user's informed consent: e.g. deleting or overwriting files/data outside an obvious scratch/temp area, force-pushing or rewriting git history, modifying system or security settings, exfiltrating secrets or credentials, downloading and running untrusted code, or anything clearly malicious.

Do not block ordinary development work: reading files, listing directories, running builds/tests, git commits, installing declared dependencies, editing project files, etc. When in doubt, ALLOW - you are a safety net for genuinely dangerous commands, not a style reviewer.

Do not call any tools. Reply with plain text only, in exactly this format and nothing else:
ALLOW
or
BLOCK: <one short sentence explaining why>`;

export const LlmReviewGate = async ({ client }) => {
  let reviewSessionID;
  const reviewSessionIDs = new Set();

  async function ensureReviewSession() {
    if (reviewSessionID) return reviewSessionID;
    const res = await client.session.create({
      body: { title: "llm-review-gate (internal, safe to delete)" },
      throwOnError: true,
    });
    reviewSessionID = res.data.id;
    reviewSessionIDs.add(reviewSessionID);
    return reviewSessionID;
  }

  async function review(command) {
    const sessionID = await ensureReviewSession();
    const res = await client.session.prompt({
      path: { id: sessionID },
      body: {
        system: REVIEW_SYSTEM_PROMPT,
        parts: [{ type: "text", text: `Command:\n${command}` }],
      },
      throwOnError: true,
    });
    const text = (res.data.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n")
      .trim();
    const firstLine = text.split("\n")[0]?.trim() ?? "";
    if (/^ALLOW/i.test(firstLine)) return { verdict: "allow", raw: text };
    if (/^BLOCK/i.test(firstLine)) {
      const reason = firstLine.replace(/^BLOCK:?\s*/i, "") || "blocked by LLM review";
      return { verdict: "block", reason, raw: text };
    }
    return { verdict: "unclear", raw: text };
  }

  return {
    "tool.execute.before": async (input, output) => {
      if (!GATED_TOOLS.has(input.tool)) return;
      if (reviewSessionIDs.has(input.sessionID)) return; // never review the review session's own calls

      const command = input.tool === "bash" ? output.args?.command : JSON.stringify(output.args);

      let result;
      try {
        result = await Promise.race([
          review(command),
          new Promise((_, reject) => setTimeout(() => reject(new Error("review timed out")), REVIEW_TIMEOUT_MS)),
        ]);
      } catch (e) {
        const decision = FAIL_OPEN_ON_ERROR ? "allow (fail-open)" : "block (fail-closed)";
        await logReview({
          tool: input.tool,
          sessionID: input.sessionID,
          callID: input.callID,
          command,
          error: String(e?.message ?? e),
          decision,
        });
        if (FAIL_OPEN_ON_ERROR) return;
        throw new Error(`llm-review-gate: review unavailable, blocking (fail-closed): ${e?.message ?? e}`);
      }

      await logReview({
        tool: input.tool,
        sessionID: input.sessionID,
        callID: input.callID,
        command,
        verdict: result.verdict,
        raw: result.raw,
      });

      if (result.verdict === "block") {
        throw new Error(`Blocked by LLM review: ${result.reason}`);
      }
      if (result.verdict === "unclear" && !FAIL_OPEN_ON_ERROR) {
        throw new Error(`llm-review-gate: could not parse review verdict, blocking (fail-closed). Raw: ${result.raw.slice(0, 200)}`);
      }
      // "allow", or "unclear" while fail-open: fall through to whatever
      // the config's own allow/ask/deny tier would normally do.
    },
  };
};
