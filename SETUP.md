# Setup instructions (for an agent to execute)

You are being asked to configure the local opencode installation on
this machine to use a custom system prompt instead of the built-in
default. This environment is git-bash on Windows, and it does NOT have
internet access — the contents of this repo were downloaded elsewhere
as a zip and transferred here. Do not attempt `git clone` or any
network fetch; work entirely from the already-extracted local copy.
Follow these steps in order, running the commands yourself. Don't skip
the verification step.

## 0. Find the opencode config directory and the extracted source

Run:

```bash
opencode debug paths
```

Use the `config` line from the output for all paths below (normally
`~/.config/opencode` — if this machine differs, substitute it
everywhere `$CONFIG_DIR` appears). Set it as a variable for the rest of
this session:

```bash
CONFIG_DIR="$(opencode debug paths | awk '/^config/ {print $2}')"
echo "$CONFIG_DIR"
```

Now find where the extracted zip landed. It was downloaded from GitHub
as `opencode-qwen-prompt-master.zip` and extracted somewhere on this
machine (Desktop, Downloads, wherever it was transferred to) — the
extracted folder is named `opencode-qwen-prompt-master` (GitHub's zip
export appends the branch name) unless it was renamed. Locate it, e.g.:

```bash
find ~/Desktop ~/Downloads -maxdepth 2 -iname "opencode-qwen-prompt*" -type d 2>/dev/null
```

Set it as a variable — substitute the real path you found:

```bash
SRC_DIR="/path/to/opencode-qwen-prompt-master"
ls "$SRC_DIR"   # sanity check: should show README.md, system-prompt.txt, etc.
```

## 1. Copy the files in

```bash
cp "$SRC_DIR/system-prompt.txt" "$CONFIG_DIR/system-prompt.txt"
```

## 2. Wire it into opencode.json

Check whether `$CONFIG_DIR/opencode.json` already exists.

- **If it does NOT exist yet**: copy the example as a starting point,
  then edit it to add your actual provider/model config (Ollama/vLLM)
  on top — this repo doesn't know your provider setup.

  ```bash
  cp "$SRC_DIR/opencode.json.example" "$CONFIG_DIR/opencode.json"
  ```

- **If it already exists** (most likely — your Ollama/vLLM provider is
  probably already configured there): read it, then add this exact key
  to the top-level JSON object, merging with whatever is already there.
  Do not remove or alter any existing keys (provider config,
  permissions, etc.) — only add/merge the `agent` key:

  ```json
  "agent": {
    "build": {
      "prompt": "{file:./system-prompt.txt}"
    },
    "plan": {
      "prompt": "{file:./system-prompt.txt}"
    }
  }
  ```

  If an `"agent"` key already exists with other agents configured,
  merge `build`/`plan` into it rather than replacing the whole key. Use
  the Edit/Write capability you have to produce valid JSON — verify it
  parses (e.g. `python -c "import json,sys; json.load(open(sys.argv[1]))" "$CONFIG_DIR/opencode.json"` or equivalent) before moving on.

## 3. (Optional but recommended) Install the viewer plugin

This lets you actually see what gets sent to the model, which matters
here because this is the first time this setup runs against the real
Qwen model — you have no other way to check it worked.

```bash
mkdir -p "$CONFIG_DIR/plugins"
cp "$SRC_DIR/system-prompt-tools.js" "$CONFIG_DIR/plugins/system-prompt-tools.js"
```

Add to `opencode.json`'s top level (merge, don't replace, same rule as
step 2):

```json
"plugin": [
  "file:///<absolute path to>/plugins/system-prompt-tools.js"
]
```

Use the real absolute path on this machine (Windows path with
forward slashes and `file:///` prefix, e.g.
`file:///C:/Users/<name>/.config/opencode/plugins/system-prompt-tools.js`) —
don't guess it, derive it from `$CONFIG_DIR`.

## 4. Verify

Run a trivial request against your actual local model:

```bash
opencode run --model <your-provider>/<your-qwen-model> "say hi in one word"
```

If you installed the plugin in step 3, check what actually got sent:

```bash
cat ~/.local/share/opencode/last-system-prompt.txt
```

Confirm: the output should start with the content of `system-prompt.txt`
(not the original hand-holding `default.txt` identity paragraph), and
should still have an `<env>` block further down with the real working
directory/platform/date. If it still looks like the original verbose
default, the `agent.prompt` config wasn't picked up — check for a JSON
syntax error in `opencode.json` first.

## 5. Cleanup (optional)

`$SRC_DIR` (the extracted zip) and the original zip file itself can be
deleted if you don't want them left on disk — they're not needed once
`$CONFIG_DIR/system-prompt.txt` and (if installed)
`$CONFIG_DIR/plugins/system-prompt-tools.js` are in place, those two
are the only files that actually matter going forward. Ask the human
running this before deleting anything they might want to keep around
instead of assuming.

## Report back

State plainly: did `opencode.json` already exist (was it merged or
created fresh)? Did verification in step 4 confirm the custom prompt is
actually being sent? If not, what did the actual output look like
instead?
