// The offline target machine has no registry to `npm install` a plugin
// package from - each opencode plugin in this repo (plugins/system-prompt-tools/,
// plugins/hook-logger/, plugins/llm-review-gate/) is committed as its own
// pre-packed npm tarball instead, extracted by hand into opencode's own
// package cache under a bare name@version (see CLAUDE.md). Nothing
// previously checked that a committed tarball's contents still match its
// package's source files, so an edit to a plugin source file without
// re-running `npm pack` would silently ship stale plugin code to that
// machine. This test extracts each real committed tarball and diffs it
// byte-for-byte against the current source.
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

const packages = [
  { dir: join(repoRoot, "plugins", "system-prompt-tools"), tarball: "opencode-system-prompt-tools-1.0.0.tgz" },
  { dir: join(repoRoot, "plugins", "hook-logger"), tarball: "opencode-hook-logger-1.0.0.tgz" },
  { dir: join(repoRoot, "plugins", "llm-review-gate"), tarball: "opencode-llm-review-gate-1.0.0.tgz" },
];

async function extractTarball(tgzPath) {
  const outDir = await mkdtemp(join(tmpdir(), "plugins-tarball-test-"));
  await execFileAsync("tar", ["-xzf", tgzPath, "-C", outDir]);
  return join(outDir, "package");
}

for (const { dir, tarball } of packages) {
  const pkgName = tarball.replace(/-\d+\.\d+\.\d+\.tgz$/, "");
  const relDir = `${dir.slice(repoRoot.length + 1)}/`;

  test(`committed ${tarball} matches the current ${relDir} source (re-run \`npm pack\` in ${relDir} if this fails)`, async (t) => {
    const tarballPath = join(dir, tarball);
    const packageJson = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
    assert.equal(packageJson.name, pkgName, `${relDir}package.json's "name" no longer matches the committed tarball filename ${tarball}`);
    // npm always includes package.json in a pack regardless of "files" -
    // it's not itself listed there, so it's added to the expected set here.
    const expectedFiles = [...packageJson.files, "package.json"].sort();

    const extractedDir = await extractTarball(tarballPath);
    t.after(() => rm(dirname(extractedDir), { recursive: true, force: true }));

    const actualFiles = (await readdir(extractedDir)).sort();
    assert.deepEqual(
      actualFiles,
      expectedFiles,
      `tarball's file list no longer matches ${relDir}package.json's "files" (plus package.json) - re-run \`npm pack\` in ${relDir}`,
    );

    for (const file of expectedFiles) {
      const [source, packed] = await Promise.all([
        readFile(join(dir, file), "utf-8"),
        readFile(join(extractedDir, file), "utf-8"),
      ]);
      assert.equal(packed, source, `${file} in the tarball differs from ${relDir}${file} - re-run \`npm pack\` in ${relDir}`);
    }
  });
}
