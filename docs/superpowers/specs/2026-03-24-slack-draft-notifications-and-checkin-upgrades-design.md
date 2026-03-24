# Slack Draft Notifications & Check-in Upgrades

## Problem

When AI rules draft replies, users must open the Inbox Zero web app to review and send them. Users want to review and send drafts directly from Slack (or other messaging channels). Additionally, the daily check-in feature could be more actionable: users want to quickly archive low-priority emails without leaving their messaging app.

## Features

### Feature 1: Draft Notifications in Messaging Channel

When a rule fires `DRAFT_EMAIL` and the user has draft notifications enabled, skip creating a Gmail/Outlook draft. Instead, post the draft content to the user's messaging channel (Slack/Teams/Telegram) with Send and Edit buttons.

**Behavior change:** `DRAFT_EMAIL` becomes a "suggest draft" when this toggle is on. No draft is created in the email provider until the user approves.

**Toggle:** New `sendDraftNotifications` boolean on `MessagingChannel`, alongside the existing `sendMeetingBriefs` and `sendDocumentFilings` toggles.

**Slack message (Block Kit):**

```
Header: "Draft reply"
Section: "*From:* sender@example.com  *Subject:* Re: Meeting tomorrow"
Divider
Section: <draft body text>
Actions: [Send] [Edit] [Dismiss]
Context: "AI-drafted by Inbox Zero - Rule: <rule name>"
```

- **Send** sends the email via the email provider API (Gmail/Outlook), updates the `ExecutedAction` with the sent message ID, and replaces the Slack message buttons with a "Sent" confirmation.
- **Edit** opens a Slack modal with the draft body pre-filled. On submit, sends the edited version.
- **Dismiss** marks the draft as rejected, removes the buttons, and updates the message to show "Dismissed."

**Data flow:**

1. Rule matches email, action is `DRAFT_EMAIL`.
2. The `draft()` action function in `actions.ts` checks if the email account's messaging channel has `sendDraftNotifications` enabled. The messaging channel data is fetched once per rule execution in `run-rules.ts` (where the email account context is already loaded) and passed through to `executeAct()` → `runActionFunction()` as an optional `messagingChannel` parameter. This avoids a DB round-trip for users who have no messaging channel or have the toggle off.
3. If enabled: skip calling `client.draftEmail()`. Instead, store the pending draft in a new `PendingChannelDraft` table and post a Block Kit message to the messaging channel.
4. If disabled: existing behavior (create Gmail/Outlook draft).
5. When user clicks Send/Edit/Dismiss in Slack, a new interaction handler processes the action, looks up the `PendingChannelDraft` by ID (encoded in the button value), and executes accordingly.

**New DB table: `PendingChannelDraft`**

```
id                  String    @id @default(cuid())
createdAt           DateTime  @default(now())
updatedAt           DateTime  @updatedAt
emailAccountId      String
executedRuleId      String
executedActionId    String
messageId           String    // original email messageId
threadId            String    // original email threadId

// Draft content
to                  String?
cc                  String?
bcc                  String?
subject             String?
content             String    @db.Text

// Messaging channel reference
messagingChannelId  String
providerMessageId   String?   // Slack message ts / Teams message ID
status              PendingChannelDraftStatus @default(PENDING)
                    // PENDING | SENT | EDITED_AND_SENT | DISMISSED
```

**Interaction handler:** New API route at `app/api/slack/interactions/route.ts` that:
- Verifies Slack signing secret (using `SLACK_SIGNING_SECRET` env var, same as existing slash commands)
- Parses `block_actions` payloads for `draft_send`, `draft_edit`, `draft_dismiss` action IDs
- Parses `view_submission` payloads for the edit modal
- Looks up `PendingChannelDraft` by its ID, which is encoded in each button's `value` field (more reliable than reverse-looking-up by message timestamp)
- **Authorization:** Verifies that `payload.user.id` matches the `MessagingChannel.providerUserId` linked to the `PendingChannelDraft`. This prevents other users in a shared channel from sending emails on someone else's behalf.
- Executes the appropriate action (send email, update message)
- **Error handling:** If the email send fails (expired OAuth token, rate limit, etc.), update the Slack message to show an error state with a "Retry" button and keep the `PendingChannelDraft` status as `PENDING`.

**Infrastructure prerequisite:** The Slack app manifest must have its "Interactivity & Shortcuts" Request URL set to `https://<app-domain>/api/slack/interactions`. This is a one-time app-level configuration change. Existing users do not need to re-authorize (no new OAuth scopes needed for button interactions).

**Provider-agnostic design:** The `PendingChannelDraft` table is provider-agnostic. The Block Kit message building and interaction handling are Slack-specific (in `utils/messaging/providers/slack/`). Teams and Telegram support can be added later using the same table — only the message format and interaction handler differ per provider.

**Where the toggle lives in the UI:** On the Settings page, in the Slack/messaging section alongside the existing meeting briefs and document filing toggles. Not in the rule dialog.

### Feature 2: Check-in @Mention Hint

When a check-in message is posted to a Slack **channel** (not a DM), append a note reminding the user to @mention the bot.

**Implementation:** In `sendAutomationMessageToSlack()` (or the message generation step), when the destination is a channel (not DM sentinel), append:

```
_Reply with @Inbox Zero to chat about your emails._
```

This is a one-line change in the message formatting — no new tables, no new APIs.

**Detection:** `channelId !== SLACK_DM_CHANNEL_SENTINEL` already exists via `isSlackDmChannel()`. Use this to conditionally append the hint.

### Feature 3: Bulk Archive Suggestion in Check-in

Upgrade the daily check-in to identify low-priority emails and suggest archiving them in bulk.

**How it works:**

1. During check-in message generation (`aiGenerateAutomationCheckInMessage`), after fetching inbox messages, classify each as low-priority or actionable.
2. Group low-priority emails by category (newsletters, marketing, notifications, receipts, etc.).
3. Include the grouped list in the check-in message.
4. Add an "Archive all" button (Slack Block Kit action).

**Classification approach:** AI judgment. The LLM already sees the inbox messages during check-in generation. Expand the output schema to return both a message and a list of archivable emails with categories:

```typescript
const checkInSchema = z.object({
  message: z.string(),
  archivable: z.array(z.object({
    messageId: z.string(),
    threadId: z.string(),
    category: z.string(),      // "newsletters", "marketing", "notifications", etc.
    oneLiner: z.string(),      // brief description for display
  })),
});
```

**Slack message format:**

```
Header: "Inbox check-in"
Section: <AI check-in message>
Divider
Section: "*15 low-priority emails to archive:*"
Section: "*Newsletters (5)*"
Context: "TechCrunch - AI funding roundup"
Context: "Morning Brew - Markets update"
Context: "..."
Section: "*Notifications (7)*"
Context: "GitHub - PR merged: fix auth bug"
Context: "Vercel - Deploy succeeded"
Context: "..."
Section: "*Marketing (3)*"
Context: "Figma - What's new in Figma"
Context: "..."
Actions: [Archive all 15] [Skip]
Context: "_Reply with @Inbox Zero to discuss_"
```

- **Archive all** triggers bulk archive via the interaction handler: iterates through the messageId/threadId list and calls `client.archiveThread()` for each. Updates the Slack message to confirm.
- **Skip** removes the buttons.

**Data flow for archive action:**

When the user clicks "Archive all," the interaction handler needs to know which emails to archive. Options:
- **Store in DB:** Create a `PendingBulkArchive` table with the list of thread IDs. The button's `value` contains the record ID.
- **Encode in button value:** Slack button values can hold up to 2000 chars. For most check-ins (15-20 emails), a JSON array of threadIds fits.

**Decision:** Encode only `threadId` values (not full objects) in the button value as a JSON array. Gmail thread IDs are ~16 hex chars; a JSON array of 8 thread IDs is ~180 chars, well within the 2000-char limit. The current check-in fetches up to 8 inbox messages (`MAX_INBOX_MESSAGES_FOR_PROMPT = 8`), so even if all are archivable the limit is safe. If the message count is increased in the future and the encoded value approaches the limit, fall back to storing in a `PendingBulkArchive` table. The interaction handler parses the value, looks up the email account via the messaging channel, and archives each thread.

**Check-in message generation changes:**

The current `sendAutomationMessage()` sends plain text. To support Block Kit, upgrade `sendAutomationMessageToSlack()` to accept optional `blocks` alongside `text`. The plain `text` serves as the notification fallback.

The `getAutomationJobMessage()` function currently returns a string. Change it to return `{ text: string; archivable?: ArchivableEmail[] }`. In `execute.ts`, destructure this return value and pass `archivable` only to the Slack-specific path. The Teams and Telegram paths continue to receive only `text` — they ignore `archivable` since interactive messages are out of scope for those providers.

## Architecture

```
run-rules.ts loads messagingChannel (if connected)
       │
       ▼
Rule fires DRAFT_EMAIL
       │
       ▼
draft() in actions.ts checks messagingChannel.sendDraftNotifications
       │
  ┌────┴────┐
  │ OFF     │ ON
  │         │
  ▼         ▼
draftEmail()  store PendingChannelDraft
(existing)    post Block Kit to channel
              │
              ├── Send → verify user, send email, update status
              ├── Edit → modal → send edited, update status
              ├── Dismiss → update status, update message
              └── Error → show error + Retry button
```

```
Check-in cron fires
       │
       ▼
getAutomationJobMessage() → { text, archivable[] }
       │
       ▼
sendAutomationMessageToSlack()
       │
  ┌────┴────────┐
  │ archivable  │ no archivable
  │ present     │
  ▼             ▼
Block Kit msg   plain text
with Archive    (existing)
button
       │
       ▼
User clicks "Archive all"
       │
       ▼
Interaction handler archives threads
```

## Scope

**In scope:**
- `sendDraftNotifications` toggle on `MessagingChannel`
- `PendingChannelDraft` table and migration
- Block Kit message builders for draft notification and check-in archive
- Slack interaction handler (`/api/slack/interactions/route.ts`) for draft Send/Edit/Dismiss and bulk Archive
- Intercept `DRAFT_EMAIL` in `executeAct()` when toggle is on
- Upgrade check-in message generation to classify archivable emails
- Upgrade `sendAutomationMessageToSlack()` to support blocks
- @mention hint for channel check-ins
- Settings UI toggle for `sendDraftNotifications`

**Out of scope:**
- Teams/Telegram interactive message support (table is provider-agnostic; provider-specific handlers can be added later)
- Per-rule notification overrides (DB supports it via a future boolean on `Rule`; not building the UI now)
- Notification for non-draft actions (architecture supports it; implementing only for drafts now)
- Notification preferences page (future — currently just a single toggle alongside existing ones)

## Testing

- Unit tests for Block Kit message builders (draft notification, check-in archive)
- Unit tests for `PendingChannelDraft` creation logic in the intercepted draft path
- Unit test for @mention hint conditional logic
- Integration test for Slack interaction handler (mock Slack signature verification, test Send/Edit/Dismiss flows)
- AI test for check-in message generation with archivable classification
- Manual test: enable toggle, trigger a rule with DRAFT_EMAIL, verify Slack message appears with correct content and buttons work
