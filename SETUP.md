# Setup instructions (for an agent to execute)

You are being asked to configure the local opencode installation on this machine to use a custom system prompt instead of the built-in default. This environment is git-bash on Windows with no public internet access (an internal npm registry is reachable for downloading dependencies, e.g. in steps 6/7 — but not for publishing anything) — the repo was downloaded elsewhere as a zip and transferred here. Do not attempt `git clone` or any network fetch; work entirely from the already-extracted local copy. Follow these steps in order, running the commands yourself. Don't skip the verification step.

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

This machine has no internet, so opencode's hourly background refresh of its models.dev metadata catalog can never succeed here — harmless on its own (non-blocking, fails silently), but writes a failed-fetch log line every hour forever. Not required either way: this setup's Qwen provider is defined by hand in `opencode.json`, not looked up from that catalog.

To silence it with fresher data than the snapshot baked into the offline build at compile time, copy this repo's `deploy/models-dev-snapshot.json` (captured from `opencode models --refresh` on a machine with internet) into place and set both environment variables persistently on this machine (e.g. `~/.bashrc`, or a Windows user/system env var — there's no JSON config key for either). Both are required together: `OPENCODE_MODELS_PATH` alone only affects the first read at startup — the hourly background refresh checks the cache directory's file age instead, not this path, so without `OPENCODE_DISABLE_MODELS_FETCH` too it would still attempt a fetch every 60 minutes:

```bash
cp "$SRC_DIR/deploy/models-dev-snapshot.json" "$CONFIG_DIR/models-dev-snapshot.json"
```

```bash
OPENCODE_MODELS_PATH="$CONFIG_DIR/models-dev-snapshot.json"
OPENCODE_DISABLE_MODELS_FETCH=1
```

## 4. (Optional but recommended) Install the viewer plugin

This lets you actually see what gets sent to the model — matters here since this is the first time this setup runs against the real Qwen model, and you have no other way to check it worked. opencode auto-loads any `.ts`/`.js` file placed in `$CONFIG_DIR/plugins/` at startup — no package, no registry, no `plugin` config entry needed at all (confirmed live, with outbound network cut, in this repo's own docker sandbox — see `docker/docker-notes.md`'s "Plugin dependency pre-warming" section):

```bash
mkdir -p "$CONFIG_DIR/plugins"
cp "$SRC_DIR/plugins/system-prompt-tools.ts" "$CONFIG_DIR/plugins/system-prompt-tools.ts"
```

The only network opencode ever needs for a plugin-touching config is a one-time install of its own `@opencode-ai/plugin` support package into `$CONFIG_DIR/node_modules` the first time it ever processes one — after that (or if this machine's opencode install already did this once for any reason), it's instant, local file or not. If `opencode debug config` doesn't show a `plugin_origins` entry resolving cleanly for this file, report exactly what you saw instead of guessing a fix.

## 5. (Optional) Install the hook-logger / llm-review-gate plugins

Two more opencode plugins live in this repo, in `plugins/` — general-purpose tooling, unrelated to the Qwen prompt override itself, so skip this step entirely unless you specifically want one or both. Same mechanism as step 4, and since each is a standalone file you can install either one independently:

- `hook-logger.ts` — logs essentially every opencode hook event (chat, tool execution, permission asks, compaction, etc.) as JSONL under `~/opencode-hook-output/`, for debugging/observability.
- `llm-review-gate.ts` — gates `bash` tool calls behind an LLM safety review: before a command runs, it's sent to a hidden internal opencode session for an ALLOW/BLOCK verdict, layered on top of (not replacing) opencode's own permission config. Fails open on review errors/timeouts by default. This changes real runtime behavior (an extra hidden model call before every `bash` call) — make sure that's actually wanted before installing it.

```bash
cp "$SRC_DIR/plugins/hook-logger.ts" "$CONFIG_DIR/plugins/hook-logger.ts"          # observability
cp "$SRC_DIR/plugins/llm-review-gate.ts" "$CONFIG_DIR/plugins/llm-review-gate.ts"  # bash safety review
```

## 6. (Optional) Add the Oracle MCP server

`mcp/oracle/` needs its npm dependencies (`@modelcontextprotocol/sdk`, `oracledb`) installed — this machine has no public internet, but does have a working internal npm registry, so a plain `npm install` below should resolve them from there (this repo doesn't vendor them, unlike the plugins in steps 4/5, which needed no dependencies at all). If `npm install` fails here, that's a real blocker worth reporting rather than working around by guessing at a substitute package or an unofficial mirror.

The Oracle MCP server is wired as `type: "remote"` in `opencode.json` (see `mcp/oracle/README.md`'s Design section for why): opencode connects to it as an already-running HTTP endpoint rather than spawning and owning it. The server process has to be started independently, before opencode ever tries to use it — a persistent terminal/session running `npm start`, a process supervisor, or a container, whichever fits this machine. opencode itself never starts, stops, or restarts it.

Copy the server directory in:

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

## 7. (Optional) Add the Loki MCP server

Same shape as step 6: `mcp/loki/` needs `@modelcontextprotocol/sdk` installed via `npm install` against the internal registry (one dependency instead of Oracle's two — no driver like `oracledb`, see `mcp/loki/README.md`'s Design section for why).

Wired as `type: "remote"` in `opencode.json`, same reasoning as step 6 — opencode connects to an already-running HTTP endpoint. Copy the directory in:

```bash
mkdir -p "$CONFIG_DIR/mcp"
cp -r "$SRC_DIR/mcp/loki" "$CONFIG_DIR/mcp/loki"
```

Start the server with `LOKI_BASE_URL` pointing at the real internal Loki instance (see `mcp/loki/README.md`'s Configuration section — `LOKI_USERNAME`/`LOKI_PASSWORD`/`LOKI_ORG_ID` too, only if that Loki instance actually requires them; unlike Oracle's credentials, all of these are optional), and `LOKI_MCP_PORT` if the default port (`8091`) isn't free:

```bash
cd "$CONFIG_DIR/mcp/loki" && npm install && npm start
```

Leave that running, then add this to `opencode.json`'s top level (merge, don't replace) — `deploy/opencode.json.example` already carries this same block with a placeholder port, `enabled: false`:

```json
"mcp": {
  "loki": {
    "type": "remote",
    "url": "http://localhost:8091/mcp",
    "enabled": true
  }
}
```

One thing needs a real value that this repo or an executing agent should never guess — ask the human running this: the real `LOKI_BASE_URL` for whatever internal Loki instance this is meant to reach.

`loki_query_range` is a full passthrough (any LogQL, no restriction — see `mcp/loki/README.md`) by deliberate design; unrelated to this deployment step.

## 8. Verify

Run a trivial request against your actual local model:

```bash
opencode run --model <your-provider>/<your-qwen-model> "say hi in one word"
```

If you installed the plugin in step 4, check what actually got sent:

```bash
cat ~/.local/share/opencode/last-system-prompt.txt
```

Confirm: the output should start with the content of `system-prompt.txt` (not the original hand-holding `default.txt` identity paragraph), and should still have an `<env>` block further down with the real working directory/platform/date. If it still looks like the original verbose default, the `agent.prompt` config wasn't picked up — check for a JSON syntax error in `opencode.json` first.

If you installed either plugin (steps 4/5) and `opencode run` errors out instead, check `opencode debug config` output for a `plugin_origins` entry resolving correctly (each should show as a `file://` spec pointing at `$CONFIG_DIR/plugins/...`) before assuming the whole setup is broken.

## 9. Cleanup (optional)

`$SRC_DIR` (the extracted zip) and the original zip file can be deleted once `$CONFIG_DIR/system-prompt.txt`, `$CONFIG_DIR/plugins/` (whichever of steps 4/5 were installed), `$CONFIG_DIR/mcp/oracle/` (if installed), and `$CONFIG_DIR/mcp/loki/` (if installed) are in place — those are the only files that matter going forward. Ask the human running this before deleting anything, don't assume.

## Report back

State plainly: did `opencode.json` already exist (merged or created fresh)? Did step 8's verification confirm the custom prompt is actually being sent? If not, what did the actual output look like instead? Which plugin files did you end up installing (step 4, step 5, both, neither), and did each resolve cleanly in `opencode debug config`'s `plugin_origins`? Did steps 6/7's `npm install` actually succeed against the internal registry, or was there a real blocker there?
