# Slack Draft Notifications

## Problem

When the AI drafts a reply to an email, the draft silently appears in Gmail. Users have no way to quickly review and send AI drafts without opening their inbox. We want to push draft notifications to the user's connected messaging channel (Slack, Teams, Telegram) so they can review, edit, and send directly from there.

## Solution

After the rule engine creates a Gmail draft, post a notification to the user's messaging channel with the draft content and Send/Edit/Dismiss buttons. The Gmail draft is always created first (safety net). The Slack message is a shortcut to act on it.

## Scope

Feature 1 only: Slack notifications for AI-drafted replies. Built generically so it extends to other action types and messaging providers later.

---

## Design

### Flow

```
Rule fires DRAFT_EMAIL
  → create Gmail draft (existing behavior, unchanged)
  → if user has action notifications enabled for DRAFT_EMAIL:
      → post to messaging channel with draft content + Send/Edit/Dismiss buttons
      → store PendingDraftNotification record (maps Slack message to draft)
  → user taps Send → sends the Gmail draft, updates Slack message to "Sent"
  → user taps Edit → opens Slack modal with draft body, submit sends edited version
  → user taps Dismiss → deletes Gmail draft, updates Slack message to "Dismissed"
```

### Database Changes

**1. New field on MessagingChannel: `notifyActions`**

A `String[]` (text array) storing which action types to notify on. Default: `[]` (no notifications).

```prisma
model MessagingChannel {
  // ... existing fields ...
  notifyActions                String[]                   @default([])
  pendingDraftNotifications    PendingDraftNotification[]
}
```

Users enable draft notifications by adding `"DRAFT_EMAIL"` to this array. Later we can add `"ARCHIVE"`, `"LABEL"`, etc. without schema changes.

**2. New enum and table: `PendingDraftNotification`**

Maps a messaging channel message to a Gmail draft so we can act on button clicks.

```prisma
enum DraftNotificationStatus {
  PENDING
  SENT
  DISMISSED
}

model PendingDraftNotification {
  id               String                    @id @default(cuid())
  createdAt        DateTime                  @default(now())
  updatedAt        DateTime                  @updatedAt

  providerMessageId String                   @unique  // Slack message ts
  draftId           String                            // Gmail/Outlook draft ID
  threadId          String                            // Email thread ID
  messageId         String                            // Original email message ID
  subject           String                            // For display
  recipient         String                            // To address
  status            DraftNotificationStatus  @default(PENDING)

  emailAccountId    String
  emailAccount      EmailAccount @relation(fields: [emailAccountId], references: [id])

  executedRuleId    String?
  executedRule      ExecutedRule? @relation(fields: [executedRuleId], references: [id])

  messagingChannelId String
  messagingChannel   MessagingChannel @relation(fields: [messagingChannelId], references: [id])

  @@index([emailAccountId])
  @@index([messagingChannelId])
}
```

Reverse relation fields also needed on `EmailAccount` and `ExecutedRule`:
- `EmailAccount`: `pendingDraftNotifications PendingDraftNotification[]`
- `ExecutedRule`: `pendingDraftNotifications PendingDraftNotification[]`

Note: `draftContent` is not stored — we fetch the current draft from the email provider at edit time. This avoids staleness if the user edits the draft in Gmail between notification and action.

### Notification Hook in Rule Execution

In `apps/web/utils/ai/choose-rule/execute.ts`, after the existing `updateExecutedActionWithDraftId` call:

```typescript
if (action.type === ActionType.DRAFT_EMAIL && actionResult?.draftId) {
  await updateExecutedActionWithDraftId({ ... });

  // New: notify on messaging channel if enabled
  await notifyDraftOnChannel({
    executedRule,
    message,
    draftId: actionResult.draftId,
    draftContent: action.content,  // ExecutedAction.content (template text)
    draftSubject: action.subject,  // ExecutedAction.subject
    recipient: action.to,          // ExecutedAction.to
    emailAccountId,
    logger,
  });
}
```

`notifyDraftOnChannel` (new file: `apps/web/utils/messaging/notify-draft.ts`):
1. Fetches MessagingChannel for the emailAccountId where `notifyActions` contains `"DRAFT_EMAIL"`
2. If none found, return early (no-op)
3. Builds Block Kit message (see below)
4. Posts to channel via a new `postDraftNotificationToSlack` function that returns the message `ts`
5. Creates `PendingDraftNotification` record with the returned message timestamp

### Slack Message Sending — Returning `ts`

The existing `postMessageWithJoin` returns `void`. For draft notifications, we need the message timestamp (`ts`) to store in `PendingDraftNotification` and to later update the message.

Approach: modify `postMessageWithJoin` to return `{ ts: string; channel: string } | undefined`. This is a non-breaking change — existing callers ignore the return value. The `ts` comes from `client.chat.postMessage()` response.

### Slack Block Kit Message

```
┌─────────────────────────────────────────────┐
│ *Draft reply ready*                          │
│                                              │
│ *To:* sender@example.com                     │
│ *Subject:* Re: Meeting next week             │
│                                              │
│ > Hi John,                                   │
│ >                                            │
│ > Tuesday at 2pm works for me. I'll send     │
│ > a calendar invite.                         │
│ >                                            │
│ > Best,                                      │
│ > ...                                        │
│                                              │
│ [Send]  [Edit]  [Dismiss]                    │
│                                              │
│ _Inbox Zero draft notification_              │
└─────────────────────────────────────────────┘
```

New file: `apps/web/utils/messaging/providers/slack/messages/draft-notification.ts`

Follows the existing pattern from `meeting-briefing.ts` and `document-filing.ts`. Uses `@slack/types` Block/KnownBlock types.

Blocks:
- Header: "Draft reply ready"
- Section: To + Subject (markdown)
- Section: Draft body as block quote (truncated to ~1500 chars if long)
- Actions: three buttons with `action_id`s: `draft_send`, `draft_edit`, `draft_dismiss`. Each button's `value` is the `providerMessageId` (Slack ts) for lookup.
- Context: footer text

### Slack Interaction Handler

New API route: `apps/web/app/api/slack/interactions/route.ts`

This route doesn't exist yet. It handles `block_actions` and `view_submission` payloads from Slack. Slack sends interaction payloads as URL-encoded bodies (not JSON) — the body contains a `payload` field with JSON inside. Parse with `request.text()` → `URLSearchParams` → `JSON.parse(params.get("payload"))`.

**Slack enforces a 3-second timeout on interaction responses.** The route must return 200 immediately. For `draft_send` and `draft_dismiss`, defer the actual work using `after()` (Next.js deferred execution). For `draft_edit`, the `views.open` call must happen synchronously because it requires the ephemeral `trigger_id`.

```
POST /api/slack/interactions
  → verify Slack signing secret (reuse existing verify-signature.ts)
  → parse URL-encoded payload
  → return 200 immediately
  → after():
      route by action_id:
        draft_send    → sendDraft()
        draft_edit    → openEditModal() (sync, needs trigger_id)
        draft_dismiss → dismissDraft()
      route view_submission by callback_id:
        draft_edit_modal → sendEditedDraft()
```

**Operational note:** The Slack app must have its Interactivity Request URL configured to point to this endpoint (separate from the Events Request URL). This is a one-time setup in the Slack app dashboard.

**Authorization:** Look up `PendingDraftNotification` by `providerMessageId`. Get the `emailAccountId`. Get the `MessagingChannel` and verify `providerUserId` matches the Slack user who clicked. This ensures only the account owner can act on their drafts.

**Action handlers use `EmailProvider` abstraction** (not raw Gmail/Outlook API calls). Obtain an `EmailProvider` instance for the `emailAccountId`:

1. **`draft_send`**: Look up PendingDraftNotification → get EmailProvider → call `provider.sendDraft(draftId)` → update notification status to `SENT` → update Slack message (replace buttons with "Sent" context block via `chat.update`).

2. **`draft_edit`**: Look up PendingDraftNotification → call `views.open` with a modal containing a `plain_text_input` pre-filled with draft body (fetched from provider at this point, not stored). Modal's `private_metadata` = providerMessageId. `callback_id` = `draft_edit_modal`. This must run synchronously (not in `after()`) because `trigger_id` expires.

3. **`draft_dismiss`**: Look up PendingDraftNotification → get EmailProvider → call `provider.deleteDraft(draftId)` → update notification status to `DISMISSED` → update Slack message to "Dismissed".

4. **`draft_edit_modal` (view_submission)**: Get edited body from modal state → get EmailProvider → call `provider.updateDraft(draftId, { messageHtml: newBody })` → call `provider.sendDraft(draftId)` → update notification status to `SENT` → update Slack message to "Sent (edited)".

### Settings UI

Add notification preferences to the existing messaging channel settings page. This is where `sendMeetingBriefs` and `sendDocumentFilings` toggles already live.

New toggle: "Notify me when AI drafts a reply" — maps to adding/removing `"DRAFT_EMAIL"` from `notifyActions[]`.

This sits alongside the existing toggles in the same settings section. No new page needed.

### Provider Abstraction

The notification logic uses the existing `EmailProvider` abstraction. `sendDraft`, `updateDraft`, and `deleteDraft` already exist on both Gmail and Outlook providers.

For messaging, only Slack gets interactive buttons (Block Kit). Teams and Telegram get a plain-text notification with a link to the draft in the inbox (no inline send/edit). This matches how meeting briefs already work — Slack gets rich formatting, others get plain text.

---

## Files to Create/Modify

### New files:
- `apps/web/utils/messaging/notify-draft.ts` — notification hook called from execute.ts
- `apps/web/utils/messaging/providers/slack/messages/draft-notification.ts` — Block Kit builder
- `apps/web/app/api/slack/interactions/route.ts` — Slack interaction handler
- `apps/web/prisma/migrations/YYYYMMDD_draft_notifications/migration.sql` — schema migration

### Modified files:
- `apps/web/prisma/schema.prisma` — add `notifyActions` field, `DraftNotificationStatus` enum, `PendingDraftNotification` model, reverse relations on EmailAccount/ExecutedRule/MessagingChannel
- `apps/web/utils/ai/choose-rule/execute.ts` — add notification hook after draft creation
- `apps/web/utils/messaging/providers/slack/send.ts` — modify `postMessageWithJoin` to return `{ ts, channel }`
- Settings UI component for messaging channel — add notification toggle

---

## Not In Scope

- Notifications for non-draft actions (archive, label, etc.) — future work, but `notifyActions[]` supports it
- Bulk archive suggestion in check-ins — separate feature
- Check-in @mention hint — separate PR
- Teams/Telegram interactive buttons — they get plain-text notifications only
- Per-rule notification overrides — future work, DB supports it via the array approach

## Testing

- Unit tests for Block Kit builder (snapshot the blocks output)
- Unit test for `notifyDraftOnChannel` — verify it no-ops when no channel configured, posts when enabled
- Integration test for interaction handler — mock Slack signature, verify draft_send/edit/dismiss flows
- Manual QA: create a rule with DRAFT_EMAIL, verify Slack notification appears, test all three buttons
