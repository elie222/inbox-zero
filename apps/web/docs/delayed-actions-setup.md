# Delayed Actions Setup Guide

## Overview

The delayed actions feature allows rules to schedule actions to be executed after a specified delay. This is particularly useful for:

- **Newsletter Management**: "Archive newsletters after 1 week"
- **Marketing Emails**: "Archive promotional emails after 3 days"
- **Receipt Processing**: "Label receipts as 'Filed' after 1 day"

## Database Migration

After making the schema changes, run the following commands:

```bash
cd apps/web
npx prisma migrate dev --name add-delayed-actions
npx prisma generate
```

## Scheduler Setup

### 1. API Endpoint

The scheduler runs via the API endpoint: `/api/scheduler/delayed-actions`

- **POST**: Processes all delayed actions that are ready for execution
- **GET**: Returns statistics about scheduled actions

### 2. Cron Job Setup

You need to set up a cron job to call the scheduler API periodically. The frequency depends on your needs:

- **Every 5 minutes**: For near real-time processing
- **Every hour**: For less critical delays
- **Every day**: For longer delays only

#### Using cron:

```bash
# Edit crontab
crontab -e

# Add one of these lines:

# Every 5 minutes
*/5 * * * * curl -X POST -H "X-Internal-API-Key: YOUR_API_KEY" http://localhost:3000/api/scheduler/delayed-actions

# Every hour
0 * * * * curl -X POST -H "X-Internal-API-Key: YOUR_API_KEY" http://localhost:3000/api/scheduler/delayed-actions

# Every day at 9 AM
0 9 * * * curl -X POST -H "X-Internal-API-Key: YOUR_API_KEY" http://localhost:3000/api/scheduler/delayed-actions
```

#### Using GitHub Actions (for hosted environments):

```yaml
name: Process Delayed Actions
on:
  schedule:
    - cron: "*/5 * * * *" # Every 5 minutes
  workflow_dispatch:

jobs:
  process-delayed-actions:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger delayed actions processing
        run: |
          curl -X POST \
            -H "X-Internal-API-Key: ${{ secrets.INTERNAL_API_KEY }}" \
            ${{ secrets.APP_URL }}/api/scheduler/delayed-actions
```

#### Using Vercel Cron (if using Vercel):

Create `vercel.json` in your project root:

```json
{
  "crons": [
    {
      "path": "/api/scheduler/delayed-actions",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### 3. Environment Variables

Make sure you have the `INTERNAL_API_KEY` environment variable set:

```bash
# In your .env file
INTERNAL_API_KEY=your-secure-random-key-here
```

## Usage Examples

### Creating Rules with Delayed Actions

When creating or updating rules through the UI or API, you can now specify delays:

```typescript
// Example: Archive newsletter after 1 week
const action = {
  type: "ARCHIVE",
  delayMs: 7 * 24 * 60 * 60 * 1000, // 1 week in milliseconds
};

// Example: Archive marketing email after 3 days
const action = {
  type: "ARCHIVE",
  delayMs: 3 * 24 * 60 * 60 * 1000, // 3 days in milliseconds
};

// Example: Label receipt after 1 day
const action = {
  type: "LABEL",
  label: "Filed",
  delayMs: 24 * 60 * 60 * 1000, // 1 day in milliseconds
};
```

### Using Delay Utilities

The system provides utility functions for common delays:

```typescript
import { delayUtils } from "@/utils/scheduler/delayed-actions";

// Convenient delay calculations
const delays = {
  oneHour: delayUtils.hours(1), // 3,600,000 ms
  threeDays: delayUtils.days(3), // 259,200,000 ms
  oneWeek: delayUtils.weeks(1), // 604,800,000 ms
  oneMonth: delayUtils.months(1), // 2,592,000,000 ms (approx)
};
```

## Monitoring

### Check Scheduler Status

```bash
# Get statistics
curl -H "X-Internal-API-Key: YOUR_API_KEY" http://localhost:3000/api/scheduler/delayed-actions

# Response:
{
  "success": true,
  "stats": {
    "SCHEDULED": 45,
    "EXECUTING": 2,
    "EXECUTED": 128,
    "FAILED": 3
  }
}
```

### Database Queries

```sql
-- Check scheduled actions
SELECT * FROM "ExecutedAction"
WHERE status = 'SCHEDULED'
ORDER BY "scheduledAt" ASC;

-- Check failed actions
SELECT * FROM "ExecutedAction"
WHERE status = 'FAILED'
ORDER BY "updatedAt" DESC;
```

## Error Handling

- **Failed Actions**: Marked as `FAILED` status but don't affect other actions in the rule
- **Missing Messages**: Actions that reference deleted emails are marked as `FAILED`
- **API Errors**: Gmail API errors are logged and the action is marked as `FAILED`
- **Retry Logic**: Failed actions are not automatically retried (this could be added as a feature)

## Performance Considerations

- The scheduler processes actions in batches ordered by `scheduledAt`
- Database indexes on `status` and `scheduledAt` ensure efficient queries
- Actions are processed sequentially to avoid Gmail API rate limits
- Consider adjusting cron frequency based on your volume of delayed actions

## Security

- The scheduler API requires the `INTERNAL_API_KEY` header
- Only authenticated internal calls can trigger action processing
- User permissions are checked when executing actions (via Gmail API tokens)

## Future Enhancements

Potential improvements that could be added:

1. **Retry Logic**: Automatically retry failed actions with exponential backoff
2. **Action Cancellation**: UI to cancel scheduled actions before execution
3. **Bulk Operations**: Process multiple actions in parallel (with rate limiting)
4. **Monitoring Dashboard**: UI to view scheduled and failed actions
5. **Dynamic Delays**: Calculate delays based on email content or sender patterns
