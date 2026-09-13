# system-prompt-tools.js plugin

Lives in `deploy/`. Hooks `experimental.chat.system.transform` to dump the fully-assembled system prompt actually sent to the model (all blocks, including opencode's own `<env>` block) to `~/.local/share/opencode/last-system-prompt.txt` on every request — the only way to confirm the override is really taking effect against the real model, since there's no other visibility into what gets sent.

**Tested:** `tests/unit/system-prompt-tools.test.mjs` — dump content/header format (model/session/block-count), and that each request overwrites rather than appends (the dump always reflects the latest request).
