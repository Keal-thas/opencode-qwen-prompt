import { appendFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const outDir = join(homedir(), "opencode-hook-output");

function safeStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, val) => {
    if (typeof val === "object" && val !== null) {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    if (typeof val === "bigint") return val.toString();
    return val;
  });
}

async function logEvent(name, payload) {
  const file = join(outDir, `${name}.jsonl`);
  const line = safeStringify({ ts: new Date().toISOString(), ...payload }) + "\n";
  try {
    if (!existsSync(outDir)) await mkdir(outDir, { recursive: true });
    await appendFile(file, line);
  } catch (e) {
    // silently fail, never block opencode over logging
  }
}

export const HookLogger = async () => {
  return {
    event: async ({ event }) => logEvent("event", { event }),
    config: async (input) => logEvent("config", { input }),
    "chat.message": async (input, output) => logEvent("chat.message", { input, output }),
    "chat.params": async (input, output) => logEvent("chat.params", { input, output }),
    "chat.headers": async (input, output) => logEvent("chat.headers", { input, output }),
    "permission.ask": async (input, output) => logEvent("permission.ask", { input, output }),
    "command.execute.before": async (input, output) => logEvent("command.execute.before", { input, output }),
    "tool.execute.before": async (input, output) => logEvent("tool.execute.before", { input, output }),
    "tool.execute.after": async (input, output) => logEvent("tool.execute.after", { input, output }),
    "shell.env": async (input, output) => logEvent("shell.env", { input, output }),
    "experimental.chat.messages.transform": async (input, output) =>
      logEvent("experimental.chat.messages.transform", { input, output }),
    "experimental.chat.system.transform": async (input, output) =>
      logEvent("experimental.chat.system.transform", { input, output }),
    "experimental.provider.small_model": async (input, output) =>
      logEvent("experimental.provider.small_model", { input, output }),
    "experimental.session.compacting": async (input, output) =>
      logEvent("experimental.session.compacting", { input, output }),
    "experimental.compaction.autocontinue": async (input, output) =>
      logEvent("experimental.compaction.autocontinue", { input, output }),
    "experimental.text.complete": async (input, output) =>
      logEvent("experimental.text.complete", { input, output }),
    "tool.definition": async (input, output) => logEvent("tool.definition", { input, output }),
  };
};
