import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const dataDir = join(homedir(), ".local", "share", "opencode");
const dumpFile = join(dataDir, "last-system-prompt.txt");

export const SystemPromptTools = async () => {
  return {
    "experimental.chat.system.transform": async (input, output) => {
      const header = `model: ${input.model?.providerID}/${input.model?.id}\nsessionID: ${input.sessionID}\nblocks: ${output.system.length}\ntimestamp: ${new Date().toISOString()}\n\n`;
      const joined = output.system.join("\n\n----- [next block] -----\n\n");
      try {
        if (!existsSync(dataDir)) await mkdir(dataDir, { recursive: true });
        await writeFile(dumpFile, header + "===== SYSTEM PROMPT AS SENT TO MODEL =====\n\n" + joined, "utf-8");
      } catch (e) {
        // silently fail, never block a chat request over logging
      }
    },
  };
};
