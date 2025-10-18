# Google Pub/Sub Troubleshooting Guide

Common issues and solutions for Google Pub/Sub email notifications and automatic labeling.

## Table of Contents

- [Setup Issues](#setup-issues)
- [Notification Issues](#notification-issues)
- [Rule Execution Issues](#rule-execution-issues)
- [Labeling Issues](#labeling-issues)
- [Performance Issues](#performance-issues)
- [Debugging Tips](#debugging-tips)

## Setup Issues

### Issue: Topic creation fails

**Symptom:**
```
ERROR: (gcloud.pubsub.topics.create) User not authorized to perform this action.
```

**Solution:**
1. Ensure you have the necessary permissions:
   ```bash
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member="user:YOUR_EMAIL" \
     --role="roles/pubsub.admin"
   ```
2. Verify billing is enabled for your Google Cloud project
3. Check that Pub/Sub API is enabled in Google Cloud Console

### Issue: Cannot grant Gmail publish permissions

**Symptom:**
```
ERROR: Policy modification failed
```

**Solution:**
1. Verify you're using the correct service account:
   ```
   gmail-api-push@system.gserviceaccount.com
   ```
2. Ensure the topic exists before granting permissions
3. Check you have `pubsub.admin` role on the project

### Issue: Subscription creation fails with "Invalid push endpoint"

**Symptom:**
```
ERROR: Invalid push endpoint URL
```

**Solution:**
1. Ensure URL is HTTPS (not HTTP)
2. URL must be publicly accessible
3. Include the token parameter: `?token=YOUR_TOKEN`
4. For ngrok, use the full URL: `https://abc123.ngrok-free.app/api/google/webhook?token=TOKEN`

## Notification Issues

### Issue: Not receiving any webhook notifications

**Checklist:**
- [ ] Is the watch active? Check database:
  ```sql
  SELECT email, "watchEmailsExpirationDate" 
  FROM "EmailAccount" 
  WHERE email = 'user@example.com';
  ```
- [ ] Has the watch expired? Expiration is 7 days from setup
- [ ] Is the subscription active in Google Cloud Console?
- [ ] Is the endpoint publicly accessible?
  ```bash
  curl -X POST "https://YOUR_DOMAIN/api/google/webhook?token=TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"message":{"data":"eyJ0ZXN0IjoidGVzdCJ9"}}'
  ```
- [ ] Check verification token matches between .env and subscription
- [ ] Is user premium? Non-premium users are auto-unwatched

**Solution:**
1. Re-establish watch:
   ```bash
   curl -X GET "https://YOUR_DOMAIN/api/google/watch" \
     -H "Authorization: Bearer USER_TOKEN"
   ```

2. Check Pub/Sub subscription status:
   ```bash
   gcloud pubsub subscriptions describe gmail-push-subscription
   ```

3. View webhook logs:
   ```bash
   # In your application logs
   grep "Processing webhook" logs/*.log
   ```

### Issue: Webhook returns 403 Forbidden

**Symptom:**
All webhook calls fail with 403 status

**Solution:**
1. Verify `GOOGLE_PUBSUB_VERIFICATION_TOKEN` in .env matches subscription URL
2. Check subscription URL includes token parameter:
   ```
   https://domain.com/api/google/webhook?token=MUST_MATCH_ENV
   ```
3. Update subscription if token changed:
   ```bash
   gcloud pubsub subscriptions update gmail-push-subscription \
     --push-endpoint=https://YOUR_DOMAIN/api/google/webhook?token=NEW_TOKEN
   ```

### Issue: Webhook returns 200 but nothing happens

**Symptom:**
Webhook receives notifications but emails aren't processed

**Possible Causes & Solutions:**

1. **User not premium:**
   ```sql
   SELECT u.email, p."stripeSubscriptionStatus", p."lemonSqueezyRenewsAt"
   FROM "User" u
   LEFT JOIN "Premium" p ON u.id = p."userId"
   WHERE u.email = 'user@example.com';
   ```
   Solution: Ensure user has active premium subscription

2. **No automation rules:**
   ```sql
   SELECT COUNT(*) FROM "Rule" 
   WHERE "emailAccountId" = 'account_id' 
   AND enabled = true;
   ```
   Solution: Create at least one enabled rule

3. **Cold email blocker disabled:**
   ```sql
   SELECT "coldEmailBlocker" FROM "EmailAccount" 
   WHERE email = 'user@example.com';
   ```
   Solution: Enable cold email blocker or create rules

4. **History ID out of sync:**
   - Gmail may skip very old history
   - Solution: System automatically limits lookback to avoid this

## Rule Execution Issues

### Issue: Rules not running on new emails

**Debug Steps:**

1. Check rule is enabled:
   ```sql
   SELECT id, name, enabled FROM "Rule" 
   WHERE "emailAccountId" = 'account_id';
   ```

2. Check for executed rule record:
   ```sql
   SELECT * FROM "ExecutedRule" 
   WHERE "emailAccountId" = 'account_id' 
   AND "messageId" = 'message_id';
   ```

3. Check execution status:
   ```sql
   SELECT status, reason FROM "ExecutedRule" 
   WHERE "messageId" = 'message_id';
   ```

**Common Issues:**

- **Status: SKIPPED** - No rule matched the email
  - Review rule instructions
  - Check if static filters are too restrictive
  - Verify AI has access

- **No ExecutedRule record** - Email was filtered out
  - Check if sender is in ignored list
  - Verify email is not from assistant
  - Check if email is in inbox or sent folder

### Issue: Rule matches wrong emails

**Symptom:**
Rule executes on emails it shouldn't

**Solutions:**

1. **Add more specific instructions:**
   ```typescript
   // Too broad
   instructions: "Label newsletters"
   
   // More specific
   instructions: "Label promotional emails from companies, but not personal newsletters from individuals"
   ```

2. **Use static filters:**
   ```typescript
   {
     name: "Label Work Emails",
     instructions: "Label emails from colleagues",
     staticMatch: {
       from: "*@company.com"
     }
   }
   ```

3. **Use category filters:**
   ```typescript
   {
     name: "Archive Newsletters Only",
     instructions: "Archive promotional newsletters",
     categoryFilters: [
       { categoryId: "newsletter_category_id" }
     ]
   }
   ```

### Issue: AI not choosing correct action arguments

**Symptom:**
Rule executes but with wrong label name or other incorrect args

**Solution:**

1. Be explicit in action configuration:
   ```typescript
   // Relies on AI to choose
   actions: [{ type: "LABEL" }]
   
   // Explicit (better)
   actions: [{ 
     type: "LABEL", 
     label: "Newsletters"  // or labelId: "Label_123"
   }]
   ```

2. Use labelId instead of label name for consistency:
   ```typescript
   actions: [{ 
     type: "LABEL", 
     labelId: "Label_1234567890"  // Gmail label ID
   }]
   ```

## Labeling Issues

### Issue: Labels not appearing in Gmail

**Debug Steps:**

1. Check if action was executed:
   ```sql
   SELECT ea.type, ea.label, ea.status, ea.error
   FROM "ExecutedAction" ea
   JOIN "ExecutedRule" er ON ea."executedRuleId" = er.id
   WHERE er."messageId" = 'message_id';
   ```

2. Check action status:
   - **APPLIED** - Success, label should be in Gmail
   - **APPLYING** - In progress
   - **FAILED** - Check error field for details

3. Verify in Gmail directly:
   - Search for message by ID
   - Check if label appears on the message
   - Refresh Gmail if needed

**Common Issues:**

1. **Label doesn't exist:**
   - System should auto-create labels
   - Check Gmail API permissions include label management
   - Verify scopes in OAuth consent screen

2. **Rate limit exceeded:**
   ```
   Error: Quota exceeded for quota metric 'Write requests per day'
   ```
   - Gmail API has daily quotas
   - Check usage in Google Cloud Console
   - Implement exponential backoff (already done in code)

3. **Message already has label:**
   - Gmail API returns success even if label already exists
   - This is expected behavior

### Issue: Wrong label applied

**Symptom:**
Email labeled with unexpected label

**Solutions:**

1. Check rule configuration:
   ```sql
   SELECT a.type, a.label, a."labelId"
   FROM "Action" a
   WHERE a."ruleId" = 'rule_id';
   ```

2. Verify label name/ID in action:
   ```typescript
   // Update action to use correct label
   {
     type: "LABEL",
     labelId: "CORRECT_LABEL_ID"
   }
   ```

3. Check for multiple rules matching:
   ```sql
   SELECT r.name, er.status, er.reason
   FROM "ExecutedRule" er
   JOIN "Rule" r ON er."ruleId" = r.id
   WHERE er."messageId" = 'message_id';
   ```

### Issue: Label created but not applied

**Symptom:**
New label appears in Gmail but not on the message

**Solution:**
This is a race condition. The system:
1. Creates label successfully
2. Gets the new label ID
3. Fails to apply it to the message

Check the error in ExecutedAction:
```sql
SELECT error FROM "ExecutedAction" 
WHERE "executedRuleId" = 'executed_rule_id';
```

Usually resolved by retrying the action.

## Performance Issues

### Issue: Slow webhook response times

**Symptom:**
Pub/Sub shows high delivery latency

**Possible Causes:**

1. **Processing too much history:**
   - System limits to 500 history items
   - Check `lastSyncedHistoryId` is being updated
   ```sql
   SELECT email, "lastSyncedHistoryId", "watchEmailsExpirationDate"
   FROM "EmailAccount";
   ```

2. **Slow AI responses:**
   - AI calls can take 2-5 seconds
   - Consider using faster models for rule matching
   - Check `DEFAULT_LLM_MODEL` and `ECONOMY_LLM_MODEL` settings

3. **Database queries:**
   - Ensure indexes exist on frequently queried fields
   - Check for slow queries in database logs

4. **Multiple rules:**
   - Each rule requires AI evaluation
   - Limit to 10-20 active rules per user
   - Use static filters to skip AI when possible

**Solutions:**

1. Optimize rule matching:
   - Use static filters (from, subject patterns)
   - Use category filters
   - Group similar rules

2. Reduce history lookback:
   - Current limit: `historyId - 500`
   - System already implements this

3. Use faster AI models:
   ```env
   DEFAULT_LLM_MODEL=gpt-3.5-turbo  # Faster
   # vs
   DEFAULT_LLM_MODEL=gpt-4  # Slower but more accurate
   ```

### Issue: Duplicate processing

**Symptom:**
Same email processed multiple times

**This should not happen** because of:
1. Redis locking prevents concurrent processing
2. Database unique constraint on ExecutedRule
3. Check for existing rule before processing

If it does happen:
```sql
SELECT * FROM "ExecutedRule" 
WHERE "messageId" = 'message_id'
ORDER BY "createdAt";
```

Check if Redis is working:
```bash
# In your Redis client
redis-cli
> KEYS processing:*
```

## Debugging Tips

### Enable Debug Logging

```bash
# Add to .env
ENABLE_DEBUG_LOGS=true
LOG_ZOD_ERRORS=true
```

### View Application Logs

```bash
# Filter for specific user
grep "user@example.com" logs/*.log

# Filter for webhook processing
grep "Processing webhook" logs/*.log

# Filter for rule execution
grep "Running rules" logs/*.log

# Filter for errors
grep -i error logs/*.log | grep -v "404"
```

### Test Webhook Locally

```bash
# Start ngrok
ngrok http 3000

# Update subscription with ngrok URL
gcloud pubsub subscriptions update gmail-push-subscription-dev \
  --push-endpoint=https://YOUR_NGROK.ngrok-free.app/api/google/webhook?token=TOKEN

# Send test email to trigger webhook
```

### Inspect Pub/Sub Messages

```bash
# Create a pull subscription for testing
gcloud pubsub subscriptions create test-pull-subscription \
  --topic=gmail-notifications

# Pull messages to see what's being sent
gcloud pubsub subscriptions pull test-pull-subscription \
  --limit=5 \
  --auto-ack
```

### Database Queries for Debugging

```sql
-- Find recent webhook activity
SELECT 
  ea."emailAccountId",
  er."createdAt",
  er.status,
  er."messageId"
FROM "ExecutedRule" er
JOIN "EmailAccount" ea ON er."emailAccountId" = ea.id
WHERE er."createdAt" > NOW() - INTERVAL '1 hour'
ORDER BY er."createdAt" DESC;

-- Check action execution success rate
SELECT 
  type,
  status,
  COUNT(*) as count
FROM "ExecutedAction"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
GROUP BY type, status;

-- Find failing actions
SELECT 
  ea.type,
  ea.status,
  ea.error,
  er."messageId",
  ea."createdAt"
FROM "ExecutedAction" ea
JOIN "ExecutedRule" er ON ea."executedRuleId" = er.id
WHERE ea.status = 'FAILED'
ORDER BY ea."createdAt" DESC
LIMIT 20;

-- Check watch expiration
SELECT 
  email,
  "watchEmailsExpirationDate",
  CASE 
    WHEN "watchEmailsExpirationDate" < NOW() THEN 'EXPIRED'
    WHEN "watchEmailsExpirationDate" < NOW() + INTERVAL '24 hours' THEN 'EXPIRING_SOON'
    ELSE 'ACTIVE'
  END as status
FROM "EmailAccount"
WHERE "watchEmailsExpirationDate" IS NOT NULL;
```

### Test Rule Matching

Use the test endpoint to verify rules:

```bash
curl -X POST "https://YOUR_DOMAIN/api/ai/rules/test" \
  -H "Authorization: Bearer USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messageId": "message_id_from_gmail",
    "threadId": "thread_id_from_gmail"
  }'
```

### Monitor Gmail API Quotas

1. Go to [Google Cloud Console - Gmail API Quotas](https://console.cloud.google.com/apis/api/gmail.googleapis.com/quotas)
2. Check current usage vs limits
3. Request quota increase if needed

### Common Log Patterns

```bash
# Successful processing
"Processing webhook" → "Getting message" → "Running rules" → "Executing action"

# Skipped (no match)
"Processing webhook" → "Getting message" → "Running rules" → "No matching rule"

# Blocked cold email
"Processing webhook" → "Getting message" → "Running cold email blocker" → "Skipping. Cold email detected"

# Already processed
"Processing webhook" → "Getting message" → "Skipping. Rule already exists"

# Premium check fail
"Processing webhook" → "Account not premium" → unwatch
```

## Getting Help

If you've tried the above solutions and still have issues:

1. **Check the documentation:**
   - [Setup Guide](./google-pubsub-setup-guide.md)
   - [Architecture](./google-pubsub-architecture.md)
   - [Quick Reference](./google-pubsub-quick-reference.md)

2. **Gather diagnostic information:**
   - Application logs (last 100 lines)
   - Database queries (ExecutedRule, ExecutedAction)
   - Pub/Sub subscription status
   - Environment variables (without secrets)

3. **Create a GitHub issue** with:
   - Clear description of the problem
   - Steps to reproduce
   - Relevant logs and errors
   - What you've already tried

4. **Check existing issues** on GitHub - your problem may already be solved

## Prevention Tips

1. **Set up monitoring:**
   - Alert on watch expirations
   - Monitor webhook response times
   - Track rule execution success rates

2. **Regular maintenance:**
   - Run watch renewal cron daily
   - Review failed actions weekly
   - Clean up old executed rules monthly

3. **Test before deploying:**
   - Test new rules with test mode
   - Verify webhooks after any infrastructure changes
   - Monitor after deploying new rule logic

4. **Keep things simple:**
   - Start with simple rules
   - Use static filters when possible
   - Don't create too many overlapping rules

5. **Monitor quotas:**
   - Gmail API has daily limits
   - Pub/Sub has message size limits
   - Watch for rate limit errors

