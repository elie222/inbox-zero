# E2E Flow Tests

End-to-end tests that verify complete email processing flows with real accounts, webhooks, and AI processing.

## Overview

These flow tests verify multi-step scenarios:

- **Full Reply Cycle**: Gmail → Outlook → Rule Processing → Draft → Send → Reply Received
- **Auto-Labeling**: Email classification and label application
- **Outbound Tracking**: Sent message handling and reply tracking
- **Draft Cleanup**: AI draft deletion when user sends manual reply

## Setup

### 1. Test Accounts

You need two email accounts connected to your test database:

1. **Gmail account** - Connected via OAuth with valid refresh token
2. **Outlook account** - Connected via OAuth with valid refresh token

The test setup automatically verifies premium status and creates default rules if missing.

### 2. Required Secrets (GitHub Actions)

Configure these secrets in your repository:

**E2E-specific secrets:**

| Secret | Description |
|--------|-------------|
| `E2E_GMAIL_EMAIL` | Gmail test account email |
| `E2E_OUTLOOK_EMAIL` | Outlook test account email |
| `E2E_NGROK_AUTH_TOKEN` | ngrok auth token for tunnel |

**Standard app secrets** (same as production - see [environment-variables.md](/docs/hosting/environment-variables.md)):

- `DATABASE_URL`, `AUTH_SECRET`, `INTERNAL_API_KEY`
- `EMAIL_ENCRYPT_SECRET`, `EMAIL_ENCRYPT_SALT`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GOOGLE_PUBSUB_TOPIC_NAME`, `GOOGLE_PUBSUB_VERIFICATION_TOKEN`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_WEBHOOK_CLIENT_STATE`
- AI provider secrets (one of: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, etc.)

Also set the repository variable `E2E_FLOWS_ENABLED=true` to enable the workflow.

### 3. Local Development

For local testing, set the equivalent environment variables and run:

```bash
RUN_E2E_FLOW_TESTS=true pnpm test-e2e:flows
```

## Running Tests

```bash
# Run all flow tests
pnpm test-e2e:flows

# Run specific test file
pnpm test-e2e:flows full-reply-cycle

# Run with verbose logging
E2E_VERBOSE=true pnpm test-e2e:flows
```

## Test Structure

```text
flows/
├── config.ts              # Configuration and environment
├── setup.ts               # Global test setup (account verification, premium check)
├── teardown.ts            # Global test teardown
├── helpers/
│   ├── accounts.ts        # Test account loading
│   ├── polling.ts         # Wait for state changes
│   ├── email.ts           # Send/receive helpers
│   ├── webhook.ts         # Webhook subscription management
│   └── logging.ts         # Debug logging
├── full-reply-cycle.test.ts
├── auto-labeling.test.ts
├── outbound-tracking.test.ts
└── draft-cleanup.test.ts
```

## Test Scenarios

### Full Reply Cycle

1. Gmail sends email to Outlook
2. Outlook receives via webhook
3. Rule matches and creates draft
4. User sends the draft
5. Gmail receives the reply
6. Outbound handling cleans up

### Auto-Labeling

- Emails needing reply → labeled + draft created
- FYI emails → labeled, no draft
- Thank you emails → appropriate handling

### Outbound Tracking

- SENT folder webhook triggers
- Reply tracking updates
- No duplicate rule execution

### Draft Cleanup

- Draft deleted when user sends manual reply
- DraftSendLog properly recorded
- Multiple drafts in thread cleaned up

## Debugging

### Logs

Tests output detailed logs with the run ID:

```text
[E2E-abc123] Step 1: Sending email from Gmail to Outlook
[E2E-abc123] Email sent { messageId: "...", threadId: "..." }
[E2E-abc123] Step 2: Waiting for Outlook to receive email
```

### Verbose Mode

```bash
E2E_VERBOSE=true pnpm test-e2e:flows
```

## Timeouts

| Operation | Timeout |
|-----------|---------|
| Email delivery | 90s |
| Webhook processing | 60s |
| Full test cycle | 300s |
| Polling interval | 3s |

## Local Setup Guide

### Quick Start

```bash
# 1. Run setup with a named config (won't overwrite your existing .env)
npm run setup -- --name e2e

# 2. Run database migrations with the E2E env
cd apps/web
pnpm prisma:migrate:e2e

# 3. Start the dev server with E2E config
pnpm dev:e2e

# 4. OAuth your test accounts at http://localhost:3000
#    - Sign in with your Gmail test account
#    - Sign out and sign in with your Outlook test account

# 5. Add test account emails to apps/web/.env.e2e:
#    E2E_GMAIL_EMAIL="your-test@gmail.com"
#    E2E_OUTLOOK_EMAIL="your-test@outlook.com"

# 6. Run the tests (loads .env.e2e automatically)
pnpm test-e2e:flows
```

## Troubleshooting

### "No account found"

Test accounts aren't in the database. Run `pnpm dev:e2e`, visit http://localhost:3000, and sign in with each account.

### Token expired

OAuth tokens may expire. Run `pnpm dev:e2e` and sign in again at http://localhost:3000.

### Draft not created

Check AI API key is configured. Rules are created automatically by the test setup.
