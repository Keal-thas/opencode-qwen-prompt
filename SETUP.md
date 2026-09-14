# Setup instructions (for an agent to execute)

You are being asked to configure the local opencode installation on this machine to use a custom system prompt instead of the built-in default. This environment is git-bash on Windows with NO internet access — the repo was downloaded elsewhere as a zip and transferred here. Do not attempt `git clone` or any network fetch; work entirely from the already-extracted local copy. Follow these steps in order, running the commands yourself. Don't skip the verification step.

## 0. Find the opencode config directory and the extracted source

Run:

```bash
opencode debug paths
```

Use the `config` line from the output for all paths below (normally `~/.config/opencode` — substitute it everywhere `$CONFIG_DIR` appears if this machine differs). Set it as a variable for the rest of this session:

```bash
CONFIG_DIR="$(opencode debug paths | awk '/^config/ {print $2}')"
echo "$CONFIG_DIR"
```

Now find where the extracted zip landed. It was downloaded from GitHub as `opencode-qwen-prompt-master.zip` and extracted somewhere on this machine (Desktop, Downloads, wherever it was transferred to) — the extracted folder is named `opencode-qwen-prompt-master` (GitHub's zip export appends the branch name) unless renamed. Locate it, e.g.:

```bash
find ~/Desktop ~/Downloads -maxdepth 2 -iname "opencode-qwen-prompt*" -type d 2>/dev/null
```

Set it as a variable — substitute the real path you found:

```bash
SRC_DIR="/path/to/opencode-qwen-prompt-master"
ls "$SRC_DIR"   # sanity check: should show README.md, deploy/, etc.
```

## 1. Copy the files in

```bash
cp "$SRC_DIR/deploy/system-prompt.txt" "$CONFIG_DIR/system-prompt.txt"
```

## 2. Wire it into opencode.json

Check whether `$CONFIG_DIR/opencode.json` already exists.

- **If it does NOT exist yet**: copy the example as a starting point, then edit it to add your actual provider/model config (vLLM) on top — this repo doesn't know your exact provider setup, beyond the model server exposing an OpenAI-compatible API, which opencode supports as a provider type natively.

  ```bash
  cp "$SRC_DIR/deploy/opencode.json.example" "$CONFIG_DIR/opencode.json"
  ```

- **If it already exists** (most likely — your vLLM provider is probably already configured there): read it, then add this exact key to the top-level JSON object, merging with whatever is already there. Do not remove or alter any existing keys (provider config, permissions, etc.) — only add/merge the `agent` key:

  ```json
  "agent": {
    "build": {
      "prompt": "{file:./system-prompt.txt}"
    },
    "plan": {
      "prompt": "{file:./system-prompt.txt}"
    },
    "general": {
      "prompt": "{file:./system-prompt.txt}"
    }
  }
  ```

  If an `"agent"` key already exists with other agents configured, merge `build`/`plan`/`general` into it rather than replacing the whole key. Produce valid JSON and verify it parses (e.g. `python -c "import json,sys; json.load(open(sys.argv[1]))" "$CONFIG_DIR/opencode.json"` or equivalent) before moving on.

## 3. (Optional) Point the models.dev catalog at a local file

This machine has no internet, so opencode's hourly background refresh of its models.dev metadata catalog can never succeed here — harmless on its own (non-blocking, fails silently), but writes a failed-fetch log line every hour forever. Not required either way: this setup's Qwen provider is defined by hand in `opencode.json`, not looked up from that catalog. Two ways to handle it, both via environment variables set persistently on this machine (e.g. `~/.bashrc`, or a Windows user/system env var) — there's no JSON config key for either:

- **Just silence it** (simplest, relies on the snapshot already baked into the offline build at compile time):

  ```bash
  OPENCODE_DISABLE_MODELS_FETCH=1
  ```

- **Or point it at an actual local copy** (this repo ships one at `deploy/models-dev-snapshot.json`, captured from `opencode models --refresh` on a machine with internet). Copy it into place and set both variables — `OPENCODE_MODELS_PATH` alone isn't enough, the background refresh loop checks the cache directory's file age, not this path, so it would still attempt a fetch every 60 minutes without `OPENCODE_DISABLE_MODELS_FETCH` too:

  ```bash
  cp "$SRC_DIR/deploy/models-dev-snapshot.json" "$CONFIG_DIR/models-dev-snapshot.json"
  ```

  ```bash
  OPENCODE_MODELS_PATH="$CONFIG_DIR/models-dev-snapshot.json"
  OPENCODE_DISABLE_MODELS_FETCH=1
  ```

## 4. (Optional but recommended) Install the viewer plugin

This lets you actually see what gets sent to the model — matters here since this is the first time this setup runs against the real Qwen model, and you have no other way to check it worked. Ships as a pre-packed npm tarball (`deploy/opencode-system-prompt-tools-1.0.0.tgz`), not a raw `.ts` file — installed locally via a `file:` npm spec since this machine has no registry to fetch it from otherwise. Verified to install and load with no network round-trip at all in this repo's own docker sandbox (network deliberately cut during the test) — see `docker/docker-notes.md`'s "Plugin dependency pre-warming" section — so this should work the same way here.

```bash
mkdir -p "$CONFIG_DIR/plugins"
cp "$SRC_DIR/deploy/opencode-system-prompt-tools-1.0.0.tgz" "$CONFIG_DIR/plugins/opencode-system-prompt-tools-1.0.0.tgz"
```

Add to `opencode.json`'s top level (merge, don't replace, same rule as
step 2):

```json
"plugin": [
  "file:/<absolute path to>/plugins/opencode-system-prompt-tools-1.0.0.tgz"
]
```

Use the real absolute path on this machine (Windows path with forward slashes, e.g. `file:/C:/Users/<name>/.config/opencode/plugins/opencode-system-prompt-tools-1.0.0.tgz`) — don't guess it, derive it from `$CONFIG_DIR`. This single-colon `file:<path>` form (no `//` authority) is what worked against a real opencode install in this repo's Linux docker sandbox; if this machine's Windows/git-bash opencode build rejects it, try the `file://` URI form instead and note in your report which one actually worked.

## 5. (Optional) Install the hook-logger / llm-review-gate plugins package

Two more opencode plugins live in this repo, in the `plugins/` npm package — general-purpose tooling, unrelated to the Qwen prompt override itself, so skip this step entirely unless you specifically want one or both:

- `hook-logger.ts` — logs essentially every opencode hook event (chat, tool execution, permission asks, compaction, etc.) as JSONL under `~/opencode-hook-output/`, for debugging/observability.
- `llm-review-gate.ts` — gates `bash` tool calls behind an LLM safety review: before a command runs, it's sent to a hidden internal opencode session for an ALLOW/BLOCK verdict, layered on top of (not replacing) opencode's own permission config. Fails open on review errors/timeouts by default. This changes real runtime behavior (an extra hidden model call before every `bash` call) — make sure that's actually wanted before installing it.

Same offline install mechanism as step 4, a separate tarball:

```bash
mkdir -p "$CONFIG_DIR/plugins"
cp "$SRC_DIR/plugins/opencode-hook-plugins-1.0.0.tgz" "$CONFIG_DIR/plugins/opencode-hook-plugins-1.0.0.tgz"
```

```json
"plugin": [
  "file:/<absolute path to>/plugins/opencode-hook-plugins-1.0.0.tgz"
]
```

Merge this into the same `plugin` array as step 4's entry (if installed) rather than replacing it — `opencode.json`'s `plugin` field accepts multiple entries. This one tarball loads both `HookLogger` and `LlmReviewGate` together; there's no way to install just one from it.

## 6. (Optional, not fully supported yet) Add the Oracle MCP server

**Stop and tell the human running this that this step is incomplete before attempting it**: `mcp/oracle/` needs its npm dependencies (`@modelcontextprotocol/sdk`, `oracledb`) present, and this machine has no internet to `npm install` them. Nothing here vendors those dependencies for offline use the way `plugins/opencode-hook-plugins-1.0.0.tgz` does for the plugins — see `mcp/TODO.md`. Don't work around this by guessing at a substitute package or an unofficial mirror; ask the human instead. Unchanged by the `remote`-vs-`local` MCP config below — `server.js` still has to run on this machine with those dependencies present either way; `local`→`remote` only changes who starts the process, not whether the dependencies need to be here.

Unlike step 4's plugin, the Oracle MCP server is wired as `type: "remote"` in `opencode.json` (see `mcp/oracle/README.md`'s Design section for why): opencode connects to it as an already-running HTTP endpoint rather than spawning and owning it. The server process has to be started independently, before opencode ever tries to use it — a persistent terminal/session running `npm start`, a process supervisor, or a container, whichever fits this machine. opencode itself never starts, stops, or restarts it.

If the npm dependencies have somehow already been made available (e.g. a `node_modules` was vendored and transferred alongside the rest of `$SRC_DIR`), copy the whole directory in:

```bash
mkdir -p "$CONFIG_DIR/mcp"
cp -r "$SRC_DIR/mcp/oracle" "$CONFIG_DIR/mcp/oracle"
```

Start the server with the real Oracle credentials as environment variables (`ORACLE_CONNECT_STRING`, `ORACLE_USER`, `ORACLE_PASSWORD` — see `mcp/oracle/README.md`'s Configuration section), and `ORACLE_MCP_PORT` too if the default port (`8090`) isn't free:

```bash
cd "$CONFIG_DIR/mcp/oracle" && npm install && npm start
```

Leave that running (in its own terminal, or under whatever supervisor was chosen above), then add this to `opencode.json`'s top level (merge, don't replace, same rule as step 2) — `deploy/opencode.json.example` already carries this same block with a placeholder port, `enabled: false`:

```json
"mcp": {
  "oracle": {
    "type": "remote",
    "url": "http://localhost:8090/mcp",
    "enabled": true
  }
}
```

Two things need real values that this repo or an executing agent should never guess — ask the human running this: the real `ORACLE_CONNECT_STRING`/`ORACLE_USER`/`ORACLE_PASSWORD` for whatever internal Oracle instance this is meant to reach, and the port, only if `ORACLE_MCP_PORT` had to be overridden because `8090` was taken.

`oracle_query` is a full passthrough (no read-only enforcement — see `mcp/oracle/README.md`) by deliberate design, not an oversight; unrelated to this deployment step.

## 7. Verify

Run a trivial request against your actual local model:

```bash
opencode run --model <your-provider>/<your-qwen-model> "say hi in one word"
```

If you installed the plugin in step 4, check what actually got sent:

```bash
cat ~/.local/share/opencode/last-system-prompt.txt
```

Confirm: the output should start with the content of `system-prompt.txt` (not the original hand-holding `default.txt` identity paragraph), and should still have an `<env>` block further down with the real working directory/platform/date. If it still looks like the original verbose default, the `agent.prompt` config wasn't picked up — check for a JSON syntax error in `opencode.json` first.

If you installed either plugin as a `file:` tarball spec (steps 4/5) and `opencode run` errors out instead, that's more likely a bad `plugin` entry (wrong absolute path, or this machine needing the `file://` URI form instead of `file:<path>`) than a problem with the prompt override itself — check `opencode debug config` output for a `plugin_origins` entry resolving correctly before assuming the whole setup is broken.

## 8. Cleanup (optional)

`$SRC_DIR` (the extracted zip) and the original zip file can be deleted once `$CONFIG_DIR/system-prompt.txt`, `$CONFIG_DIR/plugins/opencode-system-prompt-tools-1.0.0.tgz` (if installed), `$CONFIG_DIR/plugins/opencode-hook-plugins-1.0.0.tgz` (if installed), and `$CONFIG_DIR/mcp/oracle/` (if installed) are in place — those are the only files that matter going forward. Ask the human running this before deleting anything, don't assume.

## Report back

State plainly: did `opencode.json` already exist (merged or created fresh)? Did step 7's verification confirm the custom prompt is actually being sent? If not, what did the actual output look like instead? Which `plugin` entries did you end up installing (step 4, step 5, both, neither), and did the single-colon `file:<path>` spec work as-is or did this machine need the `file://` URI form?
