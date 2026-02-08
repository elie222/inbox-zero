# Slack Integration Setup

## 1. Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**
2. Name it (e.g. "Inbox Zero") and select a workspace

## 2. Configure OAuth & Permissions

Under **OAuth & Permissions**:

**Redirect URLs** — add:

```
https://<your-domain>/api/slack/callback
```

For local development, use ngrok and set `WEBHOOK_URL` to your ngrok domain (see step 4).

**Bot Token Scopes** — add these scopes:

| Scope | Purpose |
|-------|---------|
| `channels:read` | List public channels for delivery target picker |
| `groups:read` | List private channels |
| `chat:write` | Send meeting briefs and AI responses |
| `app_mentions:read` | Respond to @mentions in channels |
| `im:read` | Receive direct messages |
| `im:write` | Send DM responses |
| `im:history` | Read DM conversation history |

## 3. Enable Event Subscriptions

Under **Event Subscriptions**:

1. Toggle **Enable Events** to ON
2. Set **Request URL** to:
   ```
   https://<your-domain>/api/slack/events
   ```
3. Under **Subscribe to bot events**, add:
   - `message.im` — direct messages to the bot
   - `app_mention` — @mentions in channels

Slack will send a verification challenge to the URL; the app handles this automatically.

## 4. Set Environment Variables

From **Basic Information** and **OAuth & Permissions** pages, set these in your `.env`:

```bash
SLACK_CLIENT_ID=       # OAuth & Permissions > Client ID
SLACK_CLIENT_SECRET=   # OAuth & Permissions > Client Secret
SLACK_SIGNING_SECRET=  # Basic Information > Signing Secret
```

All three are optional. If not set, the Slack connect button is hidden and the events endpoint returns 503.

For local development with ngrok, also set:

```bash
WEBHOOK_URL=https://your-domain.ngrok-free.app
```

This is used for the OAuth callback and events webhook URLs. `NEXT_PUBLIC_BASE_URL` stays as `http://localhost:3000` so other auth flows aren't affected.

## 5. Run the Database Migration

The `MessagingChannel` model and `meetingBriefsSendEmail` column are created by the migration at:

```
prisma/migrations/20260208000000_add_messaging_channels/
```

Apply with:

```bash
pnpm prisma migrate deploy
```

## 6. Connect from the UI

1. Navigate to **Settings** > **Email Account** tab
2. Click **Connect Slack** under Connected Apps
3. Authorize the app in the Slack OAuth flow
4. Go to **Meeting Briefs** and select a Slack channel for delivery
5. Toggle meeting briefs on

Users can also DM the bot or @mention it in channels to chat with the AI assistant.
