---
name: inbox-zero-api
description: Use the Inbox Zero API CLI to inspect the live API schema, list and manage automation rules, and read inbox analytics through the public API. Use this when a task involves Inbox Zero rules, stats, or API-driven automation and can be solved through the CLI instead of browser interaction.
homepage: https://www.getinboxzero.com/api-reference/cli
metadata: { "openclaw": { "skillKey": "inboxZeroApi", "requires": { "bins": ["inbox-zero-api"], "env": ["INBOX_ZERO_API_KEY"] }, "primaryEnv": "INBOX_ZERO_API_KEY", "install": [ { "id": "node", "kind": "node", "package": "@inbox-zero/api", "bins": ["inbox-zero-api"], "label": "Install Inbox Zero API CLI (npm)" } ] } }
---

# Inbox Zero API CLI

Use this skill when the task is to inspect or change Inbox Zero state through the public API.

## Workflow

1. Prefer `--json` so the output is stable and machine-readable.
2. Keep credentials in `INBOX_ZERO_API_KEY` or OpenClaw skill config. Avoid passing API keys as CLI flags unless there is no alternative.
3. Before creating or replacing a rule body, fetch the live schema with `inbox-zero-api openapi --json`.
4. For create and update flows, write JSON into a workspace file or pipe it on stdin.
5. Treat `rules update` as a full replacement. Read the current rule first if you only intend to change part of it.

## Quick Start

```bash
inbox-zero-api rules list --json
inbox-zero-api stats by-period --period week --json
inbox-zero-api openapi --json
```

If the CLI is not installed yet, install it with the OpenClaw installer or run `npm install -g @inbox-zero/api`.

## OpenClaw Config

Set the API key in `~/.openclaw/openclaw.json` under `skills.entries.inboxZeroApi.apiKey`, or export `INBOX_ZERO_API_KEY` in the host environment.

Use `INBOX_ZERO_BASE_URL` or `inbox-zero-api config set base-url <url>` only for self-hosted or nonstandard deployments.

## Reference

For exact command patterns and a safe mutation flow, read `references/cli-reference.md`.
