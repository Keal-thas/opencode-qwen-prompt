# What this project is

`opencode-toolkit` is a general opencode tooling workspace, not a single-purpose repo: a system-prompt override for a specific Qwen3.6-35B-A3B/vLLM deployment on a network-isolated Windows machine, several standalone custom opencode hook plugins, a practical script for using opencode to generate an architecture map of a large codebase, and MCP servers (`mcp-servers/oracle/`, `mcp-servers/loki/`, `mcp-servers/java-lsp/`, `mcp-servers/spring-lsp/`) for LAN-internal ops tooling and Java/Spring code intelligence, with more planned (see `mcp-servers/TODO.md`). The prompt override is only one part of the project; the other pieces are first-class scope, not unrelated extras.

This file is deliberately thin: `README.md` (what/why, repo layout) and `CLAUDE.md` (how to work on it, hard-won lessons, preferences) are the authoritative, actively-maintained sources — read those fresh rather than trusting this note for anything beyond the orientation above.
