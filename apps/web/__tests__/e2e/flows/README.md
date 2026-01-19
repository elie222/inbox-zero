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

### Using the Local Script (with ngrok)

For running tests with webhook support, use the convenience script.

#### Prerequisites

- **ngrok**: Install with `brew install ngrok`
- **ngrok account**: Get an auth token from [ngrok dashboard](https://dashboard.ngrok.com)
- **Static domain** (recommended): Configure a free static domain in ngrok for consistent webhook URLs

#### Config File Setup

Create `~/.config/inbox-zero/.env.e2e` with your E2E configuration:

```bash
mkdir -p ~/.config/inbox-zero
# Add your config to ~/.config/inbox-zero/.env.e2e
```

**Required variables:**

| Variable | Description |
|----------|-------------|
| `E2E_NGROK_AUTH_TOKEN` | ngrok authentication token |
| `E2E_GMAIL_EMAIL` | Test Gmail account email |
| `E2E_OUTLOOK_EMAIL` | Test Outlook account email |

**Optional variables:**

| Variable | Description |
|----------|-------------|
| `E2E_NGROK_DOMAIN` | Static ngrok domain (e.g., `my-e2e.ngrok-free.app`) |
| `E2E_PORT` | Port to run Next.js on (default: 3000) |
| `WEBHOOK_URL` | Public URL for Microsoft webhooks (e.g., `https://your-domain.ngrok-free.app`) |

**Webhook URL configuration:**

Microsoft webhooks require a publicly accessible URL. Set `WEBHOOK_URL` to your ngrok domain:

```bash
# Keep NEXT_PUBLIC_BASE_URL as localhost for easy browser access
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Set WEBHOOK_URL for Microsoft webhook registration
WEBHOOK_URL=https://your-domain.ngrok-free.app
```

The app uses `WEBHOOK_URL` (with fallback to `NEXT_PUBLIC_BASE_URL`) for webhook registration. Google/Gmail uses Pub/Sub which is configured in Google Cloud Console.

**Standard app secrets** (same as production):

- `DATABASE_URL`, `AUTH_SECRET`, `INTERNAL_API_KEY`
- `EMAIL_ENCRYPT_SECRET`, `EMAIL_ENCRYPT_SALT`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Google OAuth + PubSub credentials
- Microsoft OAuth credentials
- AI provider API key (OpenAI, Anthropic, etc.)

#### Running with the Script

```bash
# Run all flow tests
./scripts/run-e2e-local.sh

# Run specific test file
./scripts/run-e2e-local.sh draft-cleanup
./scripts/run-e2e-local.sh full-reply-cycle

# Run on a custom port (useful if port 3000 is in use)
E2E_PORT=3007 ./scripts/run-e2e-local.sh
```

#### What the Script Does

1. Loads environment from `~/.config/inbox-zero/.env.e2e`
2. Starts ngrok tunnel (uses static domain if `E2E_NGROK_DOMAIN` is set)
3. **Exports `WEBHOOK_URL`** to the ngrok URL (for Microsoft webhook registration)
4. Creates symlinks in `apps/web/` so Next.js and vitest pick up the env vars
5. Starts the Next.js dev server
6. Runs E2E flow tests
7. Cleans up processes on exit (Ctrl+C or completion)

## Troubleshooting

### "No account found"

Test accounts aren't in the database. Run `pnpm dev:e2e`, visit http://localhost:3000, and sign in with each account.

### Token expired

OAuth tokens may expire. Run `pnpm dev:e2e` and sign in again at http://localhost:3000.

### Draft not created

Check AI API key is configured. Rules are created automatically by the test setup.

### ngrok tunnel fails to start

- Check `/tmp/ngrok-e2e.log` for errors
- Verify your auth token is correct
- Make sure the port isn't already in use
- **Session limit error (ERR_NGROK_108)**: Free ngrok accounts only allow 1 simultaneous session. Kill existing ngrok processes:
  ```bash
  pkill -9 ngrok
  ```

### App fails health check

- Check `/tmp/nextjs-e2e.log` for errors
- Ensure all required env vars are set

### Webhooks not received

- Without a static domain, webhook URLs change each run
- Use `E2E_NGROK_DOMAIN` for consistent webhook registration

### Microsoft webhook subscription fails

**"NotificationUrl references a local address"**

Microsoft requires a publicly accessible URL. Set `WEBHOOK_URL` to your ngrok domain:

```bash
WEBHOOK_URL=https://your-domain.ngrok-free.app
```

**"Subscription validation request failed. HTTP status code is 'NotFound'"**

Microsoft can reach your ngrok URL but the webhook endpoint returned 404. This usually means:
- The ngrok tunnel disconnected (check if another session took over)
- The Next.js app crashed (check `/tmp/nextjs-e2e.log`)
- There's a stale `.next/dev/lock` file. Remove it and restart:
  ```bash
  rm -rf apps/web/.next/dev/lock
  pkill -f "next dev"
  ```

### Next.js dev server lock error

If you see "Unable to acquire lock", another instance may be running:

```bash
rm -rf apps/web/.next/dev/lock
pkill -f "next dev"
```
