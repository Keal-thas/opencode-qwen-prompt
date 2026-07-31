# opencode system prompt: override + view

## The override (no plugin needed)

opencode's per-agent `prompt` config field fully replaces the built-in
provider prompt (e.g. `default.txt`) — verified by testing directly against
a real opencode install. Environment info (`<env>` block: working
directory, git repo check, platform, date) and any `instructions` files
you configure are generated fresh by opencode itself and still get
appended after your custom prompt, untouched.

**Setup:**

1. Copy `system-prompt.txt` next to your `opencode.json` (same directory,
   e.g. `%USERPROFILE%\.config\opencode\`) and edit its contents to taste.
2. In `opencode.json`, add:

```json
{
  "agent": {
    "build": {
      "prompt": "{file:./system-prompt.txt}"
    }
  }
}
```

   The path is relative to the config file's own directory. `build` is
   the default agent used by plain `opencode run` / the TUI — add more
   agent names under `"agent"` the same way if you use others (e.g.
   `plan`).
3. Don't add an `"instructions"` array unless you want extra files
   (like a project AGENTS.md) auto-appended — leaving it out keeps things
   minimal.

That's the whole mechanism. No JS, no plugin, nothing to install.

## The viewer (optional plugin, for debugging only)

`system-prompt-tools.js` is a small opencode plugin that dumps the exact,
fully-assembled system prompt — after your override is applied — to
`~/.local/share/opencode/last-system-prompt.txt` on every request. It only
observes; it does not modify anything. Useful for confirming your override
actually took effect, or for seeing what a given model/provider's default
prompt looks like before you decide what to override it with.

**Install:** copy it into your plugins directory and reference it in
`opencode.json`:

```json
{
  "plugin": [
    "file:///C:/Users/<you>/.config/opencode/plugins/system-prompt-tools.js"
  ]
}
```

See `opencode.json.example` for both pieces combined.

`captured-example-prompt.txt` is a real capture from a test run against
opencode's own hosted `north-mini-code-free` model, kept as a reference
example of what the plugin's dump output looks like. It is not your Qwen
setup's prompt — run the plugin once against your actual Ollama/vLLM model
to see that.
