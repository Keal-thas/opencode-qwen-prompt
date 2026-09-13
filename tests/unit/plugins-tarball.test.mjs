// plugins/opencode-hook-plugins-1.0.0.tgz is committed as a pre-packed
// npm tarball (see CLAUDE.md) because the offline target machine has no
// registry to `npm install` the plugins package from - it's transferred
// across as a file and installed via a `file:` spec. Nothing previously
// checked that the committed tarball's contents still match plugins/'s
// source files, so an edit to hook-logger.ts/llm-review-gate.ts/index.ts
// without re-running `npm pack` would silently ship stale plugin code to
// that machine. This test extracts the real committed tarball and diffs
// it byte-for-byte against the current source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pluginsDir = join(repoRoot, "plugins");
const tarballPath = join(pluginsDir, "opencode-hook-plugins-1.0.0.tgz");

async function extractTarball(tgzPath) {
  const outDir = await mkdtemp(join(tmpdir(), "plugins-tarball-test-"));
  await execFileAsync("tar", ["-xzf", tgzPath, "-C", outDir]);
  return join(outDir, "package");
}

test("committed plugins tarball matches the current plugins/ source (re-run `npm pack` in plugins/ if this fails)", async (t) => {
  const packageJson = JSON.parse(await readFile(join(pluginsDir, "package.json"), "utf-8"));
  // npm always includes package.json in a pack regardless of "files" -
  // it's not itself listed there, so it's added to the expected set here.
  const expectedFiles = [...packageJson.files, "package.json"].sort();

  const extractedDir = await extractTarball(tarballPath);
  t.after(() => rm(dirname(extractedDir), { recursive: true, force: true }));

  const actualFiles = (await readdir(extractedDir)).sort();
  assert.deepEqual(
    actualFiles,
    expectedFiles,
    "tarball's file list no longer matches plugins/package.json's \"files\" (plus package.json) - re-run `npm pack` in plugins/",
  );

  for (const file of expectedFiles) {
    const [source, packed] = await Promise.all([
      readFile(join(pluginsDir, file), "utf-8"),
      readFile(join(extractedDir, file), "utf-8"),
    ]);
    assert.equal(packed, source, `${file} in the tarball differs from plugins/${file} - re-run \`npm pack\` in plugins/`);
  }
});
