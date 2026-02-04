# Fastmail Integration Design

## Overview

Add Fastmail as a third email provider alongside Gmail and Outlook, using Fastmail's native JMAP API.

## Goals

- Personal use first, but production-ready for public release
- Core features only in v1 (read, organize, send)
- OAuth primary authentication, API tokens as fallback

## Authentication Strategy

### OAuth 2.0 (Primary)

- Register Inbox Zero as an OAuth application with Fastmail
- Follows existing pattern: `/api/fastmail/linking/auth-url` and `/api/fastmail/linking/callback`
- Stores tokens in the existing `Account` model with `provider: "fastmail"`
- Token refresh handled automatically like Gmail/Outlook

### API Tokens (Fallback)

- Fastmail allows creating API tokens at `Settings → Privacy & Security → API tokens`
- Users paste their token into a form (no OAuth dance)
- Token stored in `Account.access_token` with no refresh needed (tokens don't expire unless revoked)
- Simpler for self-hosted users who don't want to register an OAuth app

## JMAP API Integration

### What is JMAP?

- JSON-based API that Fastmail created as a modern replacement for IMAP
- Single HTTP endpoint with batched method calls
- Built-in support for push notifications via EventSource

### JMAP Session Discovery

- Authenticate → GET `https://api.fastmail.com/.well-known/jmap`
- Returns session object with API endpoint URLs and account capabilities

### Mapping JMAP to EmailProvider Interface

| EmailProvider Method | JMAP Method |
|---------------------|-------------|
| `getThreads()` | `Email/query` + `Thread/get` |
| `getThread()` | `Thread/get` + `Email/get` |
| `getMessage()` | `Email/get` |
| `getLabels()` | `Mailbox/get` (JMAP calls them mailboxes) |
| `labelMessage()` | `Email/set` (update mailboxIds) |
| `archiveThread()` | `Email/set` (move to Archive mailbox) |
| `markRead()` | `Email/set` (update keywords) |
| `sendEmail()` | `EmailSubmission/set` |

### Key Differences from Gmail/Outlook

- JMAP uses "mailboxes" (like folders) rather than labels
- An email can be in multiple mailboxes (similar to Gmail labels)
- Standard mailboxes: Inbox, Archive, Drafts, Sent, Trash, Junk

## File Structure

### New Files

```
apps/web/utils/fastmail/
├── client.ts           # JMAP session management, auth, token refresh
├── scopes.ts           # JMAP capabilities (urn:ietf:params:jmap:mail, etc.)
├── message.ts          # Email/get, Email/query operations
├── thread.ts           # Thread/get operations
├── mailbox.ts          # Mailbox/get, Mailbox/set (labels equivalent)
├── mail.ts             # EmailSubmission/set (sending)
├── types.ts            # JMAP response types

apps/web/utils/email/
├── fastmail.ts         # FastmailProvider class implementing EmailProvider

apps/web/app/api/fastmail/
├── linking/
│   ├── auth-url/route.ts
│   ├── callback/route.ts
│   └── token/route.ts   # Manual API token entry
```

### Updates to Existing Files

| File | Change |
|------|--------|
| `utils/email/provider-types.ts` | Add `isFastmailProvider()` |
| `utils/email/provider.ts` | Add Fastmail case to factory |
| `utils/auth.ts` | Add Fastmail OAuth config |
| `env.ts` | Add `FASTMAIL_CLIENT_ID`, `FASTMAIL_CLIENT_SECRET` |
| `.env.example` | Document new env vars |

No database schema changes needed - the existing `Account` model handles everything.

## Core Features (v1 Scope)

### Included

| Feature | Implementation |
|---------|----------------|
| Read threads/messages | `Email/query`, `Thread/get`, `Email/get` |
| List mailboxes | `Mailbox/get` - returns Inbox, Archive, Sent, etc. |
| Move to mailbox | `Email/set` with updated `mailboxIds` |
| Archive | Move to Archive mailbox |
| Trash | Move to Trash mailbox |
| Mark read/unread | `Email/set` with `$seen` keyword |
| Mark spam | Move to Junk mailbox |
| Send email | `Email/set` + `EmailSubmission/set` |
| Reply/Forward | Same as send, with `In-Reply-To` header |

### Deferred

| Feature | Reason |
|---------|--------|
| Webhooks/Push | JMAP EventSource requires persistent connection; add when needed |
| Drafts | Nice-to-have, not core workflow |
| Attachments | `Blob/get` - add based on user demand |
| Filters/Rules | Fastmail has its own rules system via Sieve |
| Contacts | Separate JMAP capability, not essential |

## UI Changes

### Connect Account Flow

Add third option to onboarding/settings:

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Google    │  │  Microsoft  │  │  Fastmail   │
│   Gmail     │  │   Outlook   │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
```

### Fastmail Connection Paths

1. **OAuth button** - "Connect with Fastmail" → standard OAuth flow
2. **API token option** - Link below: "Or use an API token" → opens modal with:
   - Instructions to create token in Fastmail settings
   - Text input for pasting token
   - Submit button

### Files to Update

| File | Change |
|------|--------|
| `apps/web/app/(app)/onboarding/OnboardingForm.tsx` | Add Fastmail option |
| `apps/web/app/(app)/settings/AccountsSection.tsx` | Add Fastmail to linked accounts |
| `apps/web/components/ConnectProvider.tsx` (or similar) | Fastmail OAuth + token modal |

No changes needed to email list views, thread views, or AI features (all provider-agnostic).

## Error Handling

JMAP returns structured errors in a consistent format:

```typescript
type JMAPError = {
  type: string;        // "unauthorized", "serverFail", "limit", etc.
  description?: string;
};
```

Create `apps/web/utils/fastmail/retry.ts` following the Gmail/Outlook pattern:
- Handle `401` → trigger token refresh
- Handle `429` → rate limiting, exponential backoff
- Handle `serverFail` → retry with backoff

## Testing Strategy

| Type | Approach |
|------|----------|
| Unit tests | Mock JMAP responses, test `FastmailProvider` methods |
| Integration tests | Use personal Fastmail account with API token |
| AI tests | Existing AI test suite should work once provider is wired up |

### Test Files

```
apps/web/utils/fastmail/client.test.ts
apps/web/utils/email/fastmail.test.ts
```

### Manual QA Checklist

- [ ] OAuth flow connects successfully
- [ ] API token flow connects successfully
- [ ] Threads load in inbox
- [ ] Open thread shows messages
- [ ] Archive moves to Archive mailbox
- [ ] Mark read/unread works
- [ ] Send email works
