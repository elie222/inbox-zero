## Task: Fix IMAP thread fetching for Amazon WorkMail

**Goal**: Make `GET /api/threads` work for IMAP email accounts.

**Status**: In Progress

### Problem

The threads API (`apps/web/app/api/threads/route.ts`) returns 500 when called with an IMAP email account connected to Amazon WorkMail (`imap.mail.eu-west-1.awsapps.com`).

### Root Cause (Diagnosed)

Amazon WorkMail's IMAP server has two quirks:

1. **Rejects comma-separated UID lists in FETCH**: `FETCH 21451,21450,21449 (UID FLAGS ENVELOPE)` returns `BAD: Invalid messageset`. Most IMAP servers accept this, WorkMail doesn't.

2. **Times out on `source: true`**: Fetching the full RFC822 source of large messages hangs or fails.

### What Works (Verified Manually)

```javascript
// Sequence range fetch - WORKS
for await (const msg of client.fetch('3105:*', { uid: true, envelope: true, flags: true })) { ... }

// Single message fetchOne - WORKS
const msg = await client.fetchOne('*', { uid: true, envelope: true, flags: true });

// SEARCH all - WORKS (returns 3109 UIDs)
const uids = await client.search({ all: true }, { uid: true });
```

### What Fails

```javascript
// Comma-separated UIDs - FAILS
for await (const msg of client.fetch('21451,21450,21449', { ... })) { ... }
// Error: "Command failed" - BAD: Invalid messageset

// source: true on any fetch - FAILS/HANGS
client.fetch('*', { source: true, ... })
```

### Code Already Updated

1. **`apps/web/utils/imap/message.ts`**: 
   - Added `fetchRecentMessages(client, mailbox, maxResults)` using sequence ranges
   - Changed `fetchMessagesByUids()` to fetch one-at-a-time  
   - Removed `source: true` from listing fetches
   - Added `downloadMessageBody()` for single message body download

2. **`apps/web/utils/email/imap.ts`** (ImapProvider):
   - `getInboxMessages()` now uses `fetchRecentMessages()`
   - `getThreads()` now uses `fetchRecentMessages()`
   - `getMessagesWithPagination()` uses sequence ranges for simple listing

### What Needs Verification

Run the app and verify:
1. Sign in with email/password (email: `info@connecta.app`, password: `TestImap2026!`)
2. The threads API returns messages: `GET /api/threads` with header `X-Email-Account-ID: cmnp6fvb00005omed5wbo15sp`
3. The inbox page renders messages from the IMAP mailbox

### Test Credentials

- IMAP: `imap.mail.eu-west-1.awsapps.com:993` (TLS)
- SMTP: `smtp.mail.eu-west-1.awsapps.com:465` (TLS)  
- Username: `info@connecta.app`
- Password: `06&!J8V@4E*o`

### Files

- `apps/web/utils/imap/message.ts` - Core fetch logic (primary file to fix)
- `apps/web/utils/email/imap.ts` - ImapProvider that uses the message utils
- `apps/web/utils/imap/client.ts` - Connection factory
- `apps/web/app/api/threads/route.ts` - Threads API endpoint

### Environment

- DB: PostgreSQL on localhost:5432 (database: `inboxzero`)
- Redis: localhost:6379
- .env at `apps/web/.env` (already configured)
- Prisma migrations already applied
