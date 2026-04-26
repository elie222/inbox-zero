---
name: inbox-zero-api-cli
description: Inspect or update Inbox Zero rules and analytics through the public API CLI. Use when tasks involve rules, stats, or API-driven automation.
---

# Inbox Zero API CLI

Use `inbox-zero-api` with `--json` for stable output. Require `INBOX_ZERO_API_KEY` for authenticated commands.

1. Discover schema: `inbox-zero-api openapi --json`
2. Read before replace: `inbox-zero-api rules get <id> --json`
3. Apply full body: `inbox-zero-api rules update <id> --file rule.json --json`

Install: `npm install -g @inbox-zero/api`. See the **inbox-zero-api** skill (`skills/inbox-zero-api/references/cli-reference.md`) for the full mutation flow.
