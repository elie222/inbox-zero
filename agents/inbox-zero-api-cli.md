---
name: inbox-zero-api-cli
description: Use the Inbox Zero API CLI to inspect the live API schema, list and manage automation rules, and read inbox analytics through the public API. Use this when a task involves Inbox Zero rules, stats, or API-driven automation and can be solved through the CLI instead of browser interaction.
---

# Inbox Zero API CLI

Use `inbox-zero-api` with `--json` for stable output. Require `INBOX_ZERO_API_KEY` for authenticated commands.

1. Prefer `--json` so the output is stable and machine-readable.
2. For authenticated commands (`rules`, `stats`, etc.), keep credentials in `INBOX_ZERO_API_KEY` or OpenClaw skill config. Avoid passing API keys as CLI flags unless there is no alternative.
3. Before creating or replacing a rule body, fetch the live schema with `inbox-zero-api openapi --json` (no API key required).
4. For create and update flows, write JSON into a workspace file or pipe it on stdin.
5. Treat `rules update` as a full replacement. Read the current rule first if you only intend to change part of it.

Install: `npm install -g @inbox-zero/api`. See the **inbox-zero-api** skill (`skills/inbox-zero-api/references/cli-reference.md`) for the full mutation flow.
