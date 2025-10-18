# Google Pub/Sub Quick Reference

Quick commands and snippets for setting up and managing Google Pub/Sub for Gmail notifications.

## Initial Setup Commands

```bash
# 1. Create Pub/Sub topic
gcloud pubsub topics create gmail-notifications

# 2. Grant Gmail permission to publish
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher

# 3. Generate verification token
openssl rand -hex 32

# 4. Create push subscription (production)
gcloud pubsub subscriptions create gmail-push-subscription \
  --topic=gmail-notifications \
  --push-endpoint=https://inbox-zero-web-blush.vercel.app/api/google/webhook?token=9807904389eda54fd91567c97d1a06b9 \
  --ack-deadline=600

# 5. Create push subscription (development with ngrok)
gcloud pubsub subscriptions create gmail-push-subscription-dev \
  --topic=gmail-notifications \
  --push-endpoint=https://YOUR_NGROK_URL.ngrok-free.app/api/google/webhook?token=YOUR_TOKEN \
  --ack-deadline=600
```

## Environment Variables

```bash
# Required in .env
GOOGLE_PUBSUB_TOPIC_NAME=projects/YOUR_PROJECT_ID/topics/gmail-notifications
GOOGLE_PUBSUB_VERIFICATION_TOKEN=your_random_token_here

# Gmail OAuth (also required)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## API Endpoints

### Setup watch for authenticated user
```bash
GET /api/google/watch
Authorization: Bearer <user_token>
```

### Setup watch for all users (admin)
```bash
GET /api/google/watch/all
Authorization: Bearer <admin_token>
```

### Unwatch for authenticated user
```bash
GET /api/watch/unwatch
Authorization: Bearer <user_token>
```

### Webhook endpoint (called by Pub/Sub)
```
POST /api/google/webhook?token=<verification_token>
```

## Testing Commands

```bash
# Test Pub/Sub message
gcloud pubsub topics publish gmail-notifications \
  --message='{"emailAddress":"test@example.com","historyId":12345}'

# Start ngrok for local development
ngrok http 3000

# Test webhook locally with curl
curl -X POST "http://localhost:3000/api/google/webhook?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "data": "eyJlbWFpbEFkZHJlc3MiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaGlzdG9yeUlkIjoxMjM0NX0="
    }
  }'
```

## Monitoring Commands

```bash
# List all topics
gcloud pubsub topics list

# List all subscriptions
gcloud pubsub subscriptions list

# View subscription details
gcloud pubsub subscriptions describe gmail-push-subscription

# View subscription metrics
gcloud pubsub subscriptions describe gmail-push-subscription --format=json

# View recent messages (pull subscription only)
gcloud pubsub subscriptions pull gmail-push-subscription --limit=5
```

## Management Commands

```bash
# Update subscription endpoint
gcloud pubsub subscriptions update gmail-push-subscription \
  --push-endpoint=https://NEW_DOMAIN/api/google/webhook?token=NEW_TOKEN

# Delete subscription
gcloud pubsub subscriptions delete gmail-push-subscription

# Delete topic
gcloud pubsub topics delete gmail-notifications

# Update acknowledgment deadline
gcloud pubsub subscriptions update gmail-push-subscription \
  --ack-deadline=600
```

## Database Queries

```sql
-- Check user's watch status
SELECT 
  email,
  "watchEmailsExpirationDate",
  "lastSyncedHistoryId"
FROM "EmailAccount"
WHERE email = 'user@example.com';

-- Find users with expiring watches (next 24 hours)
SELECT 
  email,
  "watchEmailsExpirationDate"
FROM "EmailAccount"
WHERE "watchEmailsExpirationDate" < NOW() + INTERVAL '24 hours'
  AND "watchEmailsExpirationDate" IS NOT NULL;

-- Check recent executed rules
SELECT 
  er.id,
  er."createdAt",
  er.status,
  er.automated,
  er.reason,
  r.name as rule_name,
  er."threadId",
  er."messageId"
FROM "ExecutedRule" er
LEFT JOIN "Rule" r ON er."ruleId" = r.id
WHERE er."emailAccountId" = 'account_id'
ORDER BY er."createdAt" DESC
LIMIT 20;

-- Check executed actions for a rule
SELECT 
  ea.type,
  ea.label,
  ea."labelId",
  ea.status,
  ea.error
FROM "ExecutedAction" ea
WHERE ea."executedRuleId" = 'executed_rule_id';

-- Find accounts without watch setup
SELECT 
  email,
  "watchEmailsExpirationDate"
FROM "EmailAccount"
WHERE "watchEmailsExpirationDate" IS NULL;
```

## Common Rule Examples

### Label all newsletters
```typescript
{
  name: "Label Newsletters",
  instructions: "Label all newsletters and promotional emails",
  actions: [{
    type: "LABEL",
    label: "Newsletters"
  }]
}
```

### Label and archive receipts
```typescript
{
  name: "Archive Receipts",
  instructions: "Label and archive all receipts and invoices",
  actions: [
    { type: "LABEL", label: "Receipts" },
    { type: "ARCHIVE" }
  ]
}
```

### Label urgent emails
```typescript
{
  name: "Label Urgent",
  instructions: "Label emails that mention urgent, ASAP, or critical",
  actions: [{
    type: "LABEL",
    label: "Urgent"
  }]
}
```

### Label by sender domain
```typescript
{
  name: "Label Work Emails",
  instructions: "Label all emails from @company.com domain",
  staticMatch: {
    from: "*@company.com"
  },
  actions: [{
    type: "LABEL",
    label: "Work"
  }]
}
```

## Troubleshooting Checklist

### No notifications received
- [ ] Verify watch is active: Check `watchEmailsExpirationDate` in database
- [ ] Check Pub/Sub subscription is active in Google Cloud Console
- [ ] Verify webhook endpoint is publicly accessible
- [ ] Check verification token matches
- [ ] Ensure user is premium and has AI access
- [ ] Verify Gmail has publish permissions on topic

### Rules not executing
- [ ] Check user has automation rules enabled
- [ ] Verify rules are enabled in database (`enabled = true`)
- [ ] Check `ExecutedRule` table for error messages
- [ ] Verify user has AI access
- [ ] Check application logs for errors

### Labels not applying
- [ ] Verify label name or labelId is correct
- [ ] Check Gmail API quotas not exceeded
- [ ] Ensure action includes label type: `{ type: "LABEL", label: "Name" }`
- [ ] Check `ExecutedAction` table for status and errors
- [ ] Verify user has necessary Gmail scopes

### Watch keeps expiring
- [ ] Set up cron job to renew watches (run `/api/google/watch/all` daily)
- [ ] Check user subscription status (premium required)
- [ ] Verify no errors during watch renewal

## Log Commands

```bash
# View webhook logs
tail -f logs/webhook.log | grep "Processing webhook"

# View rule execution logs
tail -f logs/app.log | grep "Running rules"

# View action execution logs
tail -f logs/app.log | grep "Executing action"

# Enable debug mode
export ENABLE_DEBUG_LOGS=true
export LOG_ZOD_ERRORS=true
```

## Useful Links

- [Google Cloud Console - Pub/Sub](https://console.cloud.google.com/cloudpubsub)
- [Gmail API Quotas](https://console.cloud.google.com/apis/api/gmail.googleapis.com/quotas)
- [ngrok Dashboard](https://dashboard.ngrok.com/)
- [Pub/Sub Documentation](https://cloud.google.com/pubsub/docs)

## File Locations

Key files in the codebase:

```
apps/web/
├── app/api/google/
│   ├── webhook/
│   │   ├── route.ts                    # Webhook entry point
│   │   ├── process-history.ts          # History processing
│   │   └── process-history-item.ts     # Individual message processing
│   └── watch/
│       ├── route.ts                    # Watch setup endpoint
│       └── controller.ts               # Watch management logic
├── utils/
│   ├── gmail/
│   │   ├── watch.ts                    # Watch/unwatch functions
│   │   └── history.ts                  # Gmail history API
│   └── ai/
│       ├── actions.ts                  # Action implementations (label, archive, etc.)
│       └── choose-rule/
│           └── run-rules.ts            # Rule execution engine
└── env.ts                              # Environment variable validation
```

