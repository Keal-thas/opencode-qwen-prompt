# What this project is

`opencode-qwen-prompt` is a general opencode tooling workspace, not a single-purpose repo: a system-prompt override for a specific Qwen3.6-35B-A3B/vLLM deployment on a network-isolated Windows machine (the piece that gives the repo its name and was built first), two standalone custom opencode hook plugins, a practical script for using opencode to generate an architecture map of a large codebase, and an MCP server (`mcp/oracle/`) for LAN-internal ops tooling, with more planned (see `mcp/TODO.md`). The prompt override isn't the whole scope — the other pieces are real parts of the project, not unrelated hitchhikers that happen to share a git history.

This file is deliberately thin: `README.md` (what/why, repo layout) and `CLAUDE.md` (how to work on it, hard-won lessons, preferences) are the authoritative, actively-maintained sources — read those fresh rather than trusting this note for anything beyond the orientation above.
