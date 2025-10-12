# E2E Tests

End-to-end integration tests for Inbox Zero AI that test against real email provider APIs.

## Structure

```
e2e/
├── labeling/                      # Email labeling/category operations
│   ├── microsoft-labeling.test.ts # Outlook category CRUD, apply/remove, lifecycle
│   └── google-labeling.test.ts    # Gmail label CRUD, apply/remove, lifecycle
├── gmail-operations.test.ts       # Gmail webhooks, history processing
├── outlook-operations.test.ts     # Outlook webhooks, threads, search, senders
└── README.md                      # This file
```

## Running E2E Tests

E2E tests are skipped by default. To run them:

```bash
# Run all E2E tests
pnpm test-e2e

# Run specific test suite
pnpm test-e2e microsoft-labeling
pnpm test-e2e google-labeling
pnpm test-e2e gmail-operations
pnpm test-e2e outlook-operations

# Run specific test within a suite
pnpm test-e2e microsoft-labeling -t "should apply and remove label"
```

## Setup

### Microsoft/Outlook Tests

Set these environment variables:

```bash
export TEST_OUTLOOK_EMAIL=your@outlook.com
export TEST_OUTLOOK_MESSAGE_ID=AQMkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoARgAAA...
export TEST_CONVERSATION_ID=AQQkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoAEABuo...
```

### Google/Gmail Tests

Set these environment variables:

```bash
export TEST_GMAIL_EMAIL=your@gmail.com
export TEST_GMAIL_MESSAGE_ID=18d1c2f3e4b5a678
export TEST_GMAIL_THREAD_ID=18d1c2f3e4b5a678
```

## Test Approach

All E2E tests follow a **clean slate approach**:

1. **Setup**: Create test data (labels, etc.)
2. **Action**: Perform the operation being tested
3. **Verify**: Check that the state is correct
4. **Cleanup**: Remove test data and restore original state

This ensures:
- Tests are idempotent and can be run multiple times
- Tests don't pollute the test account
- State verification at each step catches issues early

## Getting Test IDs

### For Outlook

1. Run the app and trigger a webhook
2. Check the logs for message IDs and conversation IDs
3. Or use the Outlook API explorer: <https://developer.microsoft.com/en-us/graph/graph-explorer>

### For Gmail

1. Use the Gmail API explorer: <https://developers.google.com/gmail/api/reference/rest>
2. Or check your app logs when processing emails

## Notes

- These tests use real API calls and count against your quota
- Tests may take 30+ seconds due to API rate limits
- Make sure your test account has proper permissions
- **Microsoft Graph**: All API requests use immutable IDs (`Prefer: IdType="ImmutableId"` header) to ensure message IDs remain stable across operations

