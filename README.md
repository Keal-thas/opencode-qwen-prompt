# opencode tooling workspace

A workspace for building on top of `opencode` (the CLI coding agent): a system-prompt override for a specific Qwen deployment, custom opencode plugins, a script for using opencode to analyze a large codebase, and MCP servers for LAN-internal ops tooling. The prompt override was the first piece and gives the repo its name, but it's one component — see "Repo layout" below for the rest.

[SETUP.md](SETUP.md) has the prompt override's setup instructions, written to be handed directly to an agent and executed step by step (the target machine is network-restricted, not something to do by hand repeatedly). This README is the human-readable explanation of what it does and why. [SETUP-walkthrough.zh.md](SETUP-walkthrough.zh.md) is a separate Chinese walkthrough of the same steps, for a human watching the deployment — not meant to be executed literally (hence not named `SETUP.zh.md`).

## Repo layout

| Dir | What |
|---|---|
| `deploy/` | The Qwen prompt-override payload — the piece that actually ships to the target machine |
| `docker/` | Local Docker sandbox for exercising this workspace's prompt/plugins against a real opencode install, without touching your own machine's config; see `docker/docker-notes.md` |
| `plugins/` | Standalone npm package of custom opencode hook plugins — part of the "writing tools for opencode" side of this workspace, not the Qwen override |
| `module-analysis/` | A script for using opencode to generate an architecture map of a large codebase — its own thing, not tied to the Qwen setup; see `module-analysis/README.md` |
| `mcp/` | MCP servers for LAN-internal ops tooling (Oracle and Loki so far; see `mcp/TODO.md`) |
| `docs/` | Research notes, a local mirror of opencode's own docs, and a feature-by-feature inventory of this workspace ([docs/feature-points.md](docs/feature-points.md)) |
| `tests/` | Automated tests covering this workspace's feature points; `./tests/run-all.sh` is the entry point — see `tests/README.md` |
| `memory/` | Git-tracked project memory |
| `CLAUDE.md` | Working notes for whoever edits this repo further |
| `TODO.md` | Concrete follow-up work still to be done |

## Qwen prompt override

opencode overrides the system prompt it sends to a model using its own config — no plugin required for the override itself.

### What's in `deploy/`

- `system-prompt.txt` — the replacement prompt content, edit to taste.
- `opencode.json.example` — the config that wires `system-prompt.txt` in.
- `system-prompt-tools.ts` — optional plugin that dumps the fully-assembled system prompt to a local file on every request. Diagnostic only, not required. Ships as its own npm package (`package.json` + the committed `opencode-system-prompt-tools-1.0.0.tgz`), installed via a `file:` npm spec — not a raw copied file, see `docs/feature-points/02-system-prompt-tools-plugin.md`.
- `captured-example-prompt.txt` — a real capture from a test run against opencode's own hosted `north-mini-code-free` model, kept as a reference for the plugin's dump output. Not your Qwen setup's actual prompt.
- `models-dev-snapshot.json` — a local copy of opencode's models.dev metadata catalog, for the offline restricted machine to point `OPENCODE_MODELS_PATH` at instead of ever fetching it live. See SETUP.md step 3. Optional — the offline build already has a build-time snapshot baked in as a fallback.

### How the override works

opencode's per-agent `prompt` config field fully replaces the built-in provider prompt (e.g. `default.txt`) — verified by testing directly against a real opencode install. Environment info (the `<env>` block: working directory, git repo check, platform, date) and any configured `instructions` files are generated fresh by opencode itself and still get appended after your custom prompt, untouched.

### Why system-prompt.txt looks the way it does

Written for a professional user, so the hand-holding tone and few-shot examples in opencode's default `default.txt` are stripped out. But not everything cut stayed cut — after diffing against upstream `default.txt`, four things got put back:

- Never invent or guess a URL
- Explain a non-trivial or state-changing command before running it
- Don't take actions beyond what was actually asked
- Delegate broad/open-ended exploration to the Task tool

The first three are safety/quality guardrails, not hand-holding. The fourth is different: `default.txt` tells the model to delegate broad file search to the Task tool "to reduce context usage" — the rewritten tone section had flattened that into plain "prefer grep/glob," which gave the model no prompt-level reason to ever spawn a subagent. Restored, reworded.

`build`, `plan`, and `general` agents get this prompt (see `deploy/opencode.json.example`). `compaction`, `summary`, `title`, and `explore` each ship their own narrow, task-specific native prompt — nothing to do with coding style, overriding those would actively hurt them. `general`, however, has **no prompt field set at all** in opencode's source, same as `build`/`plan` — confirmed against upstream source, not just local `opencode debug agent` output. Left unconfigured it would silently fall back to the full hand-holding `default.txt` (and, before the Task-tool line was restored, would never even get invoked by the model). It gets the same override as `build`/`plan`.

### Status / open items

- **Never tested against the actual vLLM + Qwen setup** — only validated against opencode's own hosted free models on a separate dev machine. Run the diagnostic plugin once against the real setup before trusting this.
- The target machine runs opencode as an offline single-exe build with git-bash, but has no internet — the repo is downloaded as a zip on a separate machine with internet, then transferred over. SETUP.md assumes the extracted copy is already on disk and works entirely offline from there.

See [TODO.md](TODO.md) for concrete planned/needed follow-up work.
