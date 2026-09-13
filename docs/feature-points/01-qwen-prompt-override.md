# Qwen system-prompt override

The repo's namesake feature. Replaces opencode's built-in `default.txt` system prompt with a custom one (`deploy/system-prompt.txt`) for the `build`/`plan`/`general` agents, via opencode's native `agent.<name>.prompt: "{file:...}"` config field — no plugin needed for the override itself. `deploy/opencode.json.example` is the config template; `SETUP.md` walks an agent through installing it on the actual offline Windows/vLLM target machine.

**Tested:**
- `tests/unit/config-consistency.test.mjs` — example config is valid JSON, the custom prompt differs from the untouched upstream default, SETUP.md's inline JSON snippet matches the example file (no drift).
- `tests/integration/docker-prompt-override.test.sh` — a real opencode install, in a throwaway container, actually resolves `agent.*.prompt` to the custom file's exact content via `opencode debug config`.
