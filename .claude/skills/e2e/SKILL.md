---
name: e2e
description: Run and debug E2E flow tests. Use when triggering E2E tests, checking test status, debugging failures with Axiom logs, or setting up local E2E testing. E2E tests run from the inbox-zero-e2e repo and test real email workflows.
---

# E2E Flow Tests

Run real email workflows using Gmail and Outlook test accounts. Tests the full flow: sending emails, webhook processing, and rule execution.

## Arguments

```
/e2e [action] [options]
```

Actions:
- `run` - Trigger E2E tests (default)
- `status` - Check recent test runs
- `logs` - Query Axiom logs for debugging
- `sync` - Sync workflow files from main repo
- `local` - Instructions for local setup

## Quick Reference

### Trigger Tests

```bash
# Run all E2E tests
gh workflow run e2e-flows.yml --repo inbox-zero/inbox-zero-e2e --ref main

# Run specific test file
gh workflow run e2e-flows.yml --repo inbox-zero/inbox-zero-e2e --ref main -f test_file=full-reply-cycle
```

### Check Status

```bash
# Recent runs
gh run list --repo inbox-zero/inbox-zero-e2e --workflow=e2e-flows.yml --limit 5

# Watch a specific run
gh run watch <run-id> --repo inbox-zero/inbox-zero-e2e

# View logs
gh run view <run-id> --repo inbox-zero/inbox-zero-e2e --log
```

### Sync Workflow Files

Before running tests with new changes:

1. Merge changes to `main` on `elie222/inbox-zero`
2. Sync to E2E repo:
   ```bash
   gh workflow run sync-upstream.yml --repo inbox-zero/inbox-zero-e2e
   ```
3. Wait for sync, then trigger E2E tests

## Workflow

### Step 1: Determine Action

Based on user request:
- **Run tests**: Use `gh workflow run` command
- **Check status**: Use `gh run list` or `gh run view`
- **Debug failure**: Query Axiom logs
- **Sync changes**: Run sync workflow first

### Step 2: Run Tests (if requested)

```bash
# Trigger the workflow
gh workflow run e2e-flows.yml --repo inbox-zero/inbox-zero-e2e --ref main

# Get the run ID
gh run list --repo inbox-zero/inbox-zero-e2e --workflow=e2e-flows.yml --limit 1 --json databaseId -q '.[0].databaseId'
```

### Step 3: Monitor Progress

```bash
# Watch the run
gh run watch <run-id> --repo inbox-zero/inbox-zero-e2e
```

### Step 4: Debug Failures with Axiom

Use the Axiom MCP to query the **`e2e`** dataset. Load Axiom tools first:

```
ToolSearch: +axiom query
```

#### Common Queries

**Recent webhook processing:**
```apl
['e2e']
| where _time > ago(30m)
| where message contains "webhook" or message contains "Processing"
| project _time, level, message, ['fields.email'], ['fields.subject']
| order by _time desc
| limit 50
```

**ExecutedRule status updates:**
```apl
['e2e']
| where _time > ago(30m)
| where message contains "Updating ExecutedRule status"
| project _time, ['fields.status'], ['fields.executedRuleId'], ['fields.subject']
| order by _time desc
```

**Skipped messages (label issues):**
```apl
['e2e']
| where _time > ago(30m)
| where message contains "Skipping message"
| project _time, message, ['fields.labelIds'], ['fields.subject']
| order by _time desc
```

**Query by email account:**
```apl
['e2e']
| where _time > ago(30m)
| where ['fields.email'] contains "outlook" or ['fields.userEmail'] contains "outlook"
| project _time, level, message
| order by _time desc
```

**Errors only:**
```apl
['e2e']
| where _time > ago(30m)
| where level == "error"
| project _time, message, ['fields.error'], ['fields.stack']
| order by _time desc
```

### Step 5: Download Artifacts (on failure)

```bash
gh run download <run-id> --repo inbox-zero/inbox-zero-e2e
```

Includes `server.log` with detailed output.

## Local Development

Run E2E tests locally with:

```bash
./scripts/run-e2e-local.sh
```

**Prerequisites:**
- Run `pnpm install` first
- Config at `~/.config/inbox-zero/.env.e2e`

**Debug logs:**
- Tunnel: `/tmp/ngrok-e2e.log`
- App: `/tmp/nextjs-e2e.log`

See `apps/web/__tests__/e2e/flows/README.md` for full setup.

## Critical: Never Bypass Production Flows

E2E tests must test the REAL production flow. If something appears "flaky", fix the root cause:

- Gmail webhooks timeout? Configure Pub/Sub push URL in Google Cloud Console
- Outlook webhooks fail? Set `WEBHOOK_URL` to your ngrok domain
- Tests are slow? That's the real speed - don't hide it

**Never:**
- Directly call internal functions to skip webhook delivery
- Add "fallback" triggers when webhooks don't arrive
- Bypass flows because they're "flaky"

A failing E2E test due to webhook misconfiguration is CORRECT behavior.

## Repository Structure

- **Main repo**: `elie222/inbox-zero` (or `inbox-zero/inbox-zero`)
- **E2E repo**: `inbox-zero/inbox-zero-e2e`

The E2E repo has:
- `E2E_FLOWS_ENABLED=true` repository variable
- All required secrets for test accounts
- Auto-sync workflow from main repo
