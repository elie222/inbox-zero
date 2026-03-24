# Slack Draft Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the AI drafts a reply, also post to the user's Slack channel with Send/Edit/Dismiss buttons so they can act on drafts without opening their inbox.

**Architecture:** Post-execution hook in the rule engine. After `DRAFT_EMAIL` creates a Gmail draft, check if the user has notifications enabled and post a Block Kit message to their Slack channel. A new `/api/slack/interactions` route handles button clicks (send/edit/dismiss) using the existing `EmailProvider` abstraction.

**Tech Stack:** Next.js API routes, Prisma, `@slack/web-api`, `@slack/types`, `next-safe-action`

**Spec:** `docs/superpowers/specs/2026-03-24-slack-draft-notifications-design.md`

---

## File Structure

### New files:
| File | Responsibility |
|------|---------------|
| `apps/web/utils/messaging/providers/slack/messages/draft-notification.ts` | Block Kit builder for draft notification messages |
| `apps/web/utils/messaging/notify-draft.ts` | Notification hook: check if enabled, post to Slack, create DB record |
| `apps/web/app/api/slack/interactions/route.ts` | Slack interaction handler for button clicks and modal submissions |
| `apps/web/utils/messaging/providers/slack/draft-actions.ts` | Action handlers for send/edit/dismiss draft operations |

### Modified files:
| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add `DraftNotificationStatus` enum, `PendingDraftNotification` model, `notifyActions` field on `MessagingChannel`, reverse relations |
| `apps/web/utils/messaging/providers/slack/send.ts:153-184` | Make `postMessageWithJoin` return `{ ts, channel }` |
| `apps/web/utils/ai/choose-rule/execute.ts:67-73` | Add `notifyDraftOnChannel` call after draft creation |
| `apps/web/utils/actions/messaging-channels.validation.ts` | Add `notifyActions` to `updateChannelFeaturesBody` |
| `apps/web/utils/actions/messaging-channels.ts:97-133` | Handle `notifyActions` in `updateChannelFeaturesAction` |
| `apps/web/app/(app)/[emailAccountId]/briefs/DeliveryChannelsSetting.tsx` | Add draft notification toggle |

---

## Task 1: Database schema changes

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add `DraftNotificationStatus` enum**

In `schema.prisma`, add before the `PendingDraftNotification` model:

```prisma
enum DraftNotificationStatus {
  PENDING
  SENT
  DISMISSED
}
```

- [ ] **Step 2: Add `PendingDraftNotification` model**

```prisma
model PendingDraftNotification {
  id                String                   @id @default(cuid())
  createdAt         DateTime                 @default(now())
  updatedAt         DateTime                 @updatedAt

  providerMessageId String                   @unique
  draftId           String
  threadId          String
  messageId         String
  subject           String
  recipient         String
  status            DraftNotificationStatus  @default(PENDING)

  emailAccountId    String
  emailAccount      EmailAccount             @relation(fields: [emailAccountId], references: [id])

  executedRuleId    String?
  executedRule      ExecutedRule?             @relation(fields: [executedRuleId], references: [id])

  messagingChannelId String
  messagingChannel   MessagingChannel        @relation(fields: [messagingChannelId], references: [id])

  @@index([emailAccountId])
  @@index([messagingChannelId])
}
```

- [ ] **Step 3: Add `notifyActions` field and reverse relation to `MessagingChannel`**

In the `MessagingChannel` model (line ~1114 of schema.prisma), add after `sendDocumentFilings`:

```prisma
  notifyActions              String[]                   @default([])
  pendingDraftNotifications  PendingDraftNotification[]
```

- [ ] **Step 4: Add reverse relations to `EmailAccount` and `ExecutedRule`**

In the `EmailAccount` model, add:
```prisma
  pendingDraftNotifications  PendingDraftNotification[]
```

In the `ExecutedRule` model, add:
```prisma
  pendingDraftNotifications  PendingDraftNotification[]
```

- [ ] **Step 5: Generate and apply migration**

Run:
```bash
cd apps/web && npx prisma migrate dev --name draft_notifications
```

Expected: Migration created and applied. `npx prisma generate` completes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/prisma/
git commit -m "feat: add PendingDraftNotification schema and notifyActions field"
```

---

## Task 2: Make `postMessageWithJoin` return message timestamp

**Files:**
- Modify: `apps/web/utils/messaging/providers/slack/send.ts:153-184`

- [ ] **Step 1: Update `postMessageWithJoin` return type and capture response**

In `send.ts`, change the function at line 153 from:

```typescript
async function postMessageWithJoin(
  client: WebClient,
  channelId: string,
  message: { text: string; blocks?: Blocks },
): Promise<void> {
```

To:

```typescript
export async function postMessageWithJoin(
  client: WebClient,
  channelId: string,
  message: { text: string; blocks?: Blocks },
): Promise<{ ts: string; channel: string } | undefined> {
```

Then update the body — at line 163, capture the response:

```typescript
  try {
    const response = await client.chat.postMessage(args);
    return response.ts ? { ts: response.ts, channel: channelId } : undefined;
  } catch (error: unknown) {
    if (isSlackError(error) && error.data?.error === "not_in_channel") {
      try {
        await client.conversations.join({ channel: channelId });
      } catch (joinError: unknown) {
        if (
          isSlackError(joinError) &&
          joinError.data?.error === "missing_scope"
        ) {
          throw new Error(
            "Bot lacks channels:join scope. Please reconnect Slack in Settings to update permissions.",
          );
        }
        throw joinError;
      }
      const response = await client.chat.postMessage(args);
      return response.ts ? { ts: response.ts, channel: channelId } : undefined;
    }
    throw error;
  }
```

- [ ] **Step 2: Verify existing callers are unaffected**

Existing callers (`sendMeetingBriefingToSlack`, `sendChannelConfirmation`, etc.) use `await postMessageWithJoin(...)` and ignore the return value. This is a non-breaking change.

Run:
```bash
cd apps/web && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/utils/messaging/providers/slack/send.ts
git commit -m "feat: return message timestamp from postMessageWithJoin"
```

---

## Task 3: Block Kit builder for draft notifications

**Files:**
- Create: `apps/web/utils/messaging/providers/slack/messages/draft-notification.ts`
- Create: `apps/web/utils/messaging/providers/slack/messages/draft-notification.test.ts`

- [ ] **Step 1: Write the test**

Create `apps/web/utils/messaging/providers/slack/messages/draft-notification.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  buildDraftNotificationBlocks,
  buildDraftSentBlocks,
  buildDraftDismissedBlocks,
} from "./draft-notification";

describe("buildDraftNotificationBlocks", () => {
  it("builds blocks with header, recipient, subject, body, and action buttons", () => {
    const blocks = buildDraftNotificationBlocks({
      recipient: "sender@example.com",
      subject: "Re: Meeting next week",
      draftBody: "Tuesday at 2pm works for me.",
    });

    const header = blocks.find((b) => b.type === "header");
    expect(header).toBeDefined();

    const actions = blocks.find((b) => b.type === "actions");
    expect(actions).toBeDefined();

    // Should have 3 buttons: Send, Edit, Dismiss
    const actionsBlock = actions as { type: "actions"; elements: unknown[] };
    expect(actionsBlock.elements).toHaveLength(3);
  });

  it("truncates long draft bodies", () => {
    const longBody = "x".repeat(2000);
    const blocks = buildDraftNotificationBlocks({
      recipient: "test@test.com",
      subject: "Test",
      draftBody: longBody,
    });

    const bodySection = blocks.find(
      (b) =>
        b.type === "section" &&
        "text" in b &&
        b.text &&
        typeof b.text === "object" &&
        "text" in b.text &&
        typeof b.text.text === "string" &&
        b.text.text.startsWith(">"),
    );
    expect(bodySection).toBeDefined();
  });
});

describe("buildDraftSentBlocks", () => {
  it("shows sent confirmation", () => {
    const blocks = buildDraftSentBlocks({
      recipient: "sender@example.com",
      subject: "Re: Meeting",
    });
    expect(blocks.some((b) => b.type === "context")).toBe(true);
  });
});

describe("buildDraftDismissedBlocks", () => {
  it("shows dismissed confirmation", () => {
    const blocks = buildDraftDismissedBlocks({
      recipient: "sender@example.com",
      subject: "Re: Meeting",
    });
    expect(blocks.some((b) => b.type === "context")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && pnpm test utils/messaging/providers/slack/messages/draft-notification.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the Block Kit builder**

Create `apps/web/utils/messaging/providers/slack/messages/draft-notification.ts`:

```typescript
import type { KnownBlock, Block } from "@slack/types";

const MAX_BODY_LENGTH = 1500;

export type DraftNotificationBlocksParams = {
  recipient: string;
  subject: string;
  draftBody: string;
};

export function buildDraftNotificationBlocks({
  recipient,
  subject,
  draftBody,
}: DraftNotificationBlocksParams): (KnownBlock | Block)[] {
  const truncatedBody =
    draftBody.length > MAX_BODY_LENGTH
      ? `${draftBody.slice(0, MAX_BODY_LENGTH)}...`
      : draftBody;

  const quotedBody = truncatedBody
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Draft reply ready", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*To:* ${recipient}\n*Subject:* ${subject}`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: quotedBody },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Send", emoji: true },
          style: "primary",
          action_id: "draft_send",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Edit", emoji: true },
          action_id: "draft_edit",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Dismiss", emoji: true },
          style: "danger",
          action_id: "draft_dismiss",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Inbox Zero draft notification_",
        },
      ],
    },
  ];
}

export function buildDraftSentBlocks({
  recipient,
  subject,
  edited,
}: {
  recipient: string;
  subject: string;
  edited?: boolean;
}): (KnownBlock | Block)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*To:* ${recipient}\n*Subject:* ${subject}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: edited
            ? "_Draft sent (edited) via Inbox Zero_"
            : "_Draft sent via Inbox Zero_",
        },
      ],
    },
  ];
}

export function buildDraftDismissedBlocks({
  recipient,
  subject,
}: {
  recipient: string;
  subject: string;
}): (KnownBlock | Block)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `~*To:* ${recipient}\n*Subject:* ${subject}~`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Draft dismissed — draft deleted from inbox_",
        },
      ],
    },
  ];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && pnpm test utils/messaging/providers/slack/messages/draft-notification.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/utils/messaging/providers/slack/messages/draft-notification*
git commit -m "feat: add Block Kit builder for draft notifications"
```

---

## Task 4: Notification hook — `notifyDraftOnChannel`

**Files:**
- Create: `apps/web/utils/messaging/notify-draft.ts`
- Modify: `apps/web/utils/ai/choose-rule/execute.ts:67-73`

- [ ] **Step 1: Create the notification hook**

Create `apps/web/utils/messaging/notify-draft.ts`:

```typescript
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import { postMessageWithJoin } from "@/utils/messaging/providers/slack/send";
import { resolveSlackDestination } from "@/utils/messaging/providers/slack/send";
import { buildDraftNotificationBlocks } from "@/utils/messaging/providers/slack/messages/draft-notification";

export async function notifyDraftOnChannel({
  executedRuleId,
  draftId,
  draftContent,
  draftSubject,
  recipient,
  threadId,
  messageId,
  emailAccountId,
  logger,
}: {
  executedRuleId: string;
  draftId: string;
  draftContent: string | null;
  draftSubject: string | null;
  recipient: string | null;
  threadId: string | null;
  messageId: string | null;
  emailAccountId: string;
  logger: Logger;
}): Promise<void> {
  const channel = await prisma.messagingChannel.findFirst({
    where: {
      emailAccountId,
      isConnected: true,
      notifyActions: { has: "DRAFT_EMAIL" },
    },
  });

  if (!channel?.accessToken || !channel.channelId) {
    return;
  }

  const destination = await resolveSlackDestination({
    accessToken: channel.accessToken,
    channelId: channel.channelId,
    providerUserId: channel.providerUserId,
  });

  if (!destination) {
    logger.warn("Could not resolve Slack destination for draft notification");
    return;
  }

  const blocks = buildDraftNotificationBlocks({
    recipient: recipient ?? "unknown",
    subject: draftSubject ?? "(no subject)",
    draftBody: draftContent ?? "",
  });

  const client = createSlackClient(channel.accessToken);

  const result = await postMessageWithJoin(client, destination, {
    blocks,
    text: `Draft reply ready — To: ${recipient ?? "unknown"}, Subject: ${draftSubject ?? "(no subject)"}`,
  });

  if (!result?.ts) {
    logger.warn("Failed to get message timestamp from Slack");
    return;
  }

  await prisma.pendingDraftNotification.create({
    data: {
      providerMessageId: result.ts,
      draftId,
      threadId: threadId ?? "",
      messageId: messageId ?? "",
      subject: draftSubject ?? "(no subject)",
      recipient: recipient ?? "unknown",
      emailAccountId,
      executedRuleId,
      messagingChannelId: channel.id,
    },
  });

  logger.info("Draft notification posted to Slack", {
    providerMessageId: result.ts,
    draftId,
  });
}
```

- [ ] **Step 2: Wire the hook into execute.ts**

In `apps/web/utils/ai/choose-rule/execute.ts`, add the import at the top (after line 9):

```typescript
import { notifyDraftOnChannel } from "@/utils/messaging/notify-draft";
```

Then modify the `DRAFT_EMAIL` block (lines 67-73) to add the notification call after `updateExecutedActionWithDraftId`:

```typescript
      if (action.type === ActionType.DRAFT_EMAIL && actionResult?.draftId) {
        await updateExecutedActionWithDraftId({
          actionId: action.id,
          draftId: actionResult.draftId,
          logger,
        });

        try {
          await notifyDraftOnChannel({
            executedRuleId: executedRule.id,
            draftId: actionResult.draftId,
            draftContent: action.content,
            draftSubject: action.subject,
            recipient: action.to,
            threadId: executedRule.threadId,
            messageId: executedRule.messageId,
            emailAccountId,
            logger: log,
          });
        } catch (error) {
          log.error("Failed to send draft notification", { error });
        }
      }
```

The notification is wrapped in try/catch so a Slack failure doesn't block rule execution.

- [ ] **Step 3: Type check**

Run:
```bash
cd apps/web && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/utils/messaging/notify-draft.ts apps/web/utils/ai/choose-rule/execute.ts
git commit -m "feat: add draft notification hook in rule execution"
```

---

## Task 5: Slack interaction handler — draft actions

**Files:**
- Create: `apps/web/utils/messaging/providers/slack/draft-actions.ts`
- Create: `apps/web/app/api/slack/interactions/route.ts`

- [ ] **Step 1: Create draft action handlers**

Create `apps/web/utils/messaging/providers/slack/draft-actions.ts`:

```typescript
import prisma from "@/utils/prisma";
import type { WebClient } from "@slack/web-api";
import { DraftNotificationStatus } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import {
  buildDraftSentBlocks,
  buildDraftDismissedBlocks,
} from "@/utils/messaging/providers/slack/messages/draft-notification";

const logger = createScopedLogger("slack/draft-actions");

async function getNotificationAndProvider(providerMessageId: string) {
  const notification = await prisma.pendingDraftNotification.findUnique({
    where: { providerMessageId },
    include: {
      emailAccount: {
        select: {
          id: true,
          account: { select: { provider: true } },
        },
      },
      messagingChannel: {
        select: { providerUserId: true, accessToken: true },
      },
    },
  });

  if (!notification) throw new Error("Draft notification not found");
  if (notification.status !== DraftNotificationStatus.PENDING) {
    throw new Error(`Draft already ${notification.status.toLowerCase()}`);
  }

  const accountProvider = notification.emailAccount.account?.provider;
  if (!accountProvider) throw new Error("No provider found for email account");

  const provider = await createEmailProvider({
    emailAccountId: notification.emailAccount.id,
    provider: accountProvider,
    logger,
  });

  return { notification, provider };
}

function authorizeSlackUser(
  notification: { messagingChannel: { providerUserId: string | null } },
  slackUserId: string | undefined,
) {
  if (
    !slackUserId ||
    notification.messagingChannel.providerUserId !== slackUserId
  ) {
    throw new Error("Unauthorized: Slack user does not own this draft");
  }
}

export async function handleDraftSend({
  providerMessageId,
  slackClient,
  channelId,
  slackUserId,
}: {
  providerMessageId: string;
  slackClient: WebClient;
  channelId: string;
  slackUserId: string | undefined;
}) {
  const { notification, provider } = await getNotificationAndProvider(
    providerMessageId,
  );
  authorizeSlackUser(notification, slackUserId);

  await provider.sendDraft(notification.draftId);

  await prisma.pendingDraftNotification.update({
    where: { providerMessageId },
    data: { status: DraftNotificationStatus.SENT },
  });

  await slackClient.chat.update({
    channel: channelId,
    ts: providerMessageId,
    blocks: buildDraftSentBlocks({
      recipient: notification.recipient,
      subject: notification.subject,
    }),
    text: `Draft sent to ${notification.recipient}`,
  });

  logger.info("Draft sent via Slack", { providerMessageId });
}

export async function handleDraftEdit({
  providerMessageId,
  triggerId,
  slackClient,
  slackUserId,
}: {
  providerMessageId: string;
  triggerId: string;
  slackClient: WebClient;
  slackUserId: string | undefined;
}) {
  const { notification, provider } = await getNotificationAndProvider(
    providerMessageId,
  );
  authorizeSlackUser(notification, slackUserId);

  // Fetch current draft content from provider
  const draft = await provider.getDraft(notification.draftId);
  const currentBody = draft?.textPlain ?? draft?.textHtml ?? "";

  await slackClient.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "draft_edit_modal",
      private_metadata: providerMessageId,
      title: { type: "plain_text", text: "Edit draft" },
      submit: { type: "plain_text", text: "Send" },
      close: { type: "plain_text", text: "Cancel" },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*To:* ${notification.recipient}\n*Subject:* ${notification.subject}`,
          },
        },
        {
          type: "input",
          block_id: "draft_body_block",
          label: { type: "plain_text", text: "Message" },
          element: {
            type: "plain_text_input",
            action_id: "draft_body",
            multiline: true,
            initial_value: currentBody,
          },
        },
      ],
    },
  });
}

export async function handleDraftDismiss({
  providerMessageId,
  slackClient,
  channelId,
  slackUserId,
}: {
  providerMessageId: string;
  slackClient: WebClient;
  channelId: string;
  slackUserId: string | undefined;
}) {
  const { notification, provider } = await getNotificationAndProvider(
    providerMessageId,
  );
  authorizeSlackUser(notification, slackUserId);

  try {
    await provider.deleteDraft(notification.draftId);
  } catch (error) {
    logger.warn("Failed to delete draft (may already be deleted)", { error });
  }

  await prisma.pendingDraftNotification.update({
    where: { providerMessageId },
    data: { status: DraftNotificationStatus.DISMISSED },
  });

  await slackClient.chat.update({
    channel: channelId,
    ts: providerMessageId,
    blocks: buildDraftDismissedBlocks({
      recipient: notification.recipient,
      subject: notification.subject,
    }),
    text: `Draft dismissed for ${notification.recipient}`,
  });

  logger.info("Draft dismissed via Slack", { providerMessageId });
}

export async function handleDraftEditSubmit({
  providerMessageId,
  newBody,
  slackClient,
}: {
  providerMessageId: string;
  newBody: string;
  slackClient: WebClient;
}) {
  const { notification, provider } = await getNotificationAndProvider(
    providerMessageId,
  );

  await provider.updateDraft(notification.draftId, { messageHtml: newBody });
  await provider.sendDraft(notification.draftId);

  await prisma.pendingDraftNotification.update({
    where: { providerMessageId },
    data: { status: DraftNotificationStatus.SENT },
  });

  // Find the channel to update the original message
  const channel = await prisma.messagingChannel.findUnique({
    where: { id: notification.messagingChannelId },
    select: { channelId: true },
  });

  if (channel?.channelId) {
    await slackClient.chat.update({
      channel: channel.channelId,
      ts: providerMessageId,
      blocks: buildDraftSentBlocks({
        recipient: notification.recipient,
        subject: notification.subject,
        edited: true,
      }),
      text: `Draft sent (edited) to ${notification.recipient}`,
    });
  }

  logger.info("Edited draft sent via Slack", { providerMessageId });
}
```

- [ ] **Step 2: Create the interaction route**

Create `apps/web/app/api/slack/interactions/route.ts`:

```typescript
import { NextResponse, after } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { validateSlackWebhookRequest } from "@/utils/messaging/providers/slack/verify-signature";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import {
  handleDraftSend,
  handleDraftEdit,
  handleDraftDismiss,
  handleDraftEditSubmit,
} from "@/utils/messaging/providers/slack/draft-actions";
import prisma from "@/utils/prisma";
export const maxDuration = 60;

export const POST = withError("slack/interactions", async (request) => {
  const logger = request.logger;
  if (!env.SLACK_SIGNING_SECRET) {
    return NextResponse.json(
      { error: "Slack not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  const validation = validateSlackWebhookRequest({
    signingSecret: env.SLACK_SIGNING_SECRET,
    timestamp,
    body: rawBody,
    signature,
  });

  if (!validation.valid) {
    logger.warn("Invalid Slack interaction signature", {
      reason: validation.reason,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    if (!action) {
      return NextResponse.json({ ok: true });
    }

    const messageTs =
      payload.container?.message_ts ?? payload.message?.ts ?? "";
    const channelId =
      payload.container?.channel_id ?? payload.channel?.id ?? "";

    const slackUserId = payload.user?.id;

    // draft_edit must run synchronously — trigger_id expires in 3 seconds
    if (action.action_id === "draft_edit") {
      try {
        const slackClient = await getSlackClientForNotification(messageTs);
        await handleDraftEdit({
          providerMessageId: messageTs,
          triggerId: payload.trigger_id ?? "",
          slackClient,
          slackUserId,
        });
      } catch (error) {
        logger.error("Failed to open edit modal", { error });
      }
      return NextResponse.json({ ok: true });
    }

    // Send and Dismiss can be deferred
    after(async () => {
      try {
        const slackClient = await getSlackClientForNotification(messageTs);

        if (action.action_id === "draft_send") {
          await handleDraftSend({
            providerMessageId: messageTs,
            slackClient,
            channelId,
            slackUserId,
          });
        } else if (action.action_id === "draft_dismiss") {
          await handleDraftDismiss({
            providerMessageId: messageTs,
            slackClient,
            channelId,
            slackUserId,
          });
        }
      } catch (error) {
        logger.error("Failed to handle draft action", {
          error,
          actionId: action.action_id,
        });
      }
    });

    return NextResponse.json({ ok: true });
  }

  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === "draft_edit_modal"
  ) {
    const providerMessageId = payload.view.private_metadata ?? "";
    const newBody =
      payload.view.state?.values?.draft_body_block?.draft_body?.value ?? "";

    after(async () => {
      try {
        const slackClient = await getSlackClientForNotification(
          providerMessageId,
        );
        await handleDraftEditSubmit({
          providerMessageId,
          newBody,
          slackClient,
        });
      } catch (error) {
        logger.error("Failed to submit edited draft", { error });
      }
    });

    // Return empty response to close the modal
    return NextResponse.json({});
  }

  return NextResponse.json({ ok: true });
});

async function getSlackClientForNotification(providerMessageId: string) {
  const notification = await prisma.pendingDraftNotification.findUnique({
    where: { providerMessageId },
    include: {
      messagingChannel: { select: { accessToken: true } },
    },
  });

  if (!notification?.messagingChannel.accessToken) {
    throw new Error("No Slack access token for notification");
  }

  return createSlackClient(notification.messagingChannel.accessToken);
}

interface SlackInteractionPayload {
  type: string;
  actions?: Array<{ action_id: string; value?: string }>;
  channel?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { ts?: string };
  trigger_id?: string;
  user?: { id?: string };
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: {
      values?: {
        draft_body_block?: {
          draft_body?: { value?: string };
        };
      };
    };
  };
}
```

- [ ] **Step 3: Type check**

Run:
```bash
cd apps/web && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/utils/messaging/providers/slack/draft-actions.ts apps/web/app/api/slack/interactions/route.ts
git commit -m "feat: add Slack interaction handler for draft send/edit/dismiss"
```

---

## Task 6: Settings UI — draft notification toggle

**Files:**
- Modify: `apps/web/utils/actions/messaging-channels.validation.ts`
- Modify: `apps/web/utils/actions/messaging-channels.ts:97-133`
- Modify: `apps/web/app/(app)/[emailAccountId]/briefs/DeliveryChannelsSetting.tsx`

- [ ] **Step 1: Add `notifyActions` to the validation schema**

In `apps/web/utils/actions/messaging-channels.validation.ts`, update `updateChannelFeaturesBody` (line 9):

```typescript
export const updateChannelFeaturesBody = z.object({
  channelId: z.string().min(1),
  sendMeetingBriefs: z.boolean().optional(),
  sendDocumentFilings: z.boolean().optional(),
  notifyDraftEmail: z.boolean().optional(),
});
```

- [ ] **Step 2: Handle `notifyDraftEmail` in the server action**

In `apps/web/utils/actions/messaging-channels.ts`, update `updateChannelFeaturesAction` (line 97). Replace the current action body:

```typescript
export const updateChannelFeaturesAction = actionClient
  .metadata({ name: "updateChannelFeatures" })
  .inputSchema(updateChannelFeaturesBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: {
        channelId,
        sendMeetingBriefs,
        sendDocumentFilings,
        notifyDraftEmail,
      },
    }) => {
      const channel = await prisma.messagingChannel.findUnique({
        where: { id: channelId },
      });

      if (!channel || channel.emailAccountId !== emailAccountId) {
        throw new SafeError("Messaging channel not found");
      }

      if (!channel.isConnected) {
        throw new SafeError("Messaging channel is not connected");
      }

      const enablingFeature =
        sendMeetingBriefs === true ||
        sendDocumentFilings === true ||
        notifyDraftEmail === true;
      if (enablingFeature && !channel.channelId) {
        throw new SafeError(
          "Please select a target channel before enabling features",
        );
      }

      // Build notifyActions array update
      let notifyActionsUpdate: { notifyActions: string[] } | undefined;
      if (notifyDraftEmail !== undefined) {
        const currentActions = channel.notifyActions ?? [];
        if (notifyDraftEmail && !currentActions.includes("DRAFT_EMAIL")) {
          notifyActionsUpdate = {
            notifyActions: [...currentActions, "DRAFT_EMAIL"],
          };
        } else if (
          !notifyDraftEmail &&
          currentActions.includes("DRAFT_EMAIL")
        ) {
          notifyActionsUpdate = {
            notifyActions: currentActions.filter((a) => a !== "DRAFT_EMAIL"),
          };
        }
      }

      await prisma.messagingChannel.update({
        where: { id: channelId },
        data: {
          ...(sendMeetingBriefs !== undefined && { sendMeetingBriefs }),
          ...(sendDocumentFilings !== undefined && { sendDocumentFilings }),
          ...notifyActionsUpdate,
        },
      });
    },
  );
```

- [ ] **Step 3: Add the toggle to the UI**

In `apps/web/app/(app)/[emailAccountId]/briefs/DeliveryChannelsSetting.tsx`, update the `ChannelRow` component.

First, update the channel type in the `ChannelRow` props (line 157) to include `notifyActions`:

```typescript
  channel: {
    id: string;
    provider: MessagingProvider;
    channelId: string | null;
    channelName: string | null;
    sendMeetingBriefs: boolean;
    notifyActions: string[];
  };
```

Then, after the existing `sendMeetingBriefs` toggle (after line 311), add a second toggle:

```tsx
      {supportsBriefTargetSelection &&
        channel.channelId &&
        !selectingTarget && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Briefs</span>
              <Toggle
                name={`briefs-${channel.id}`}
                enabled={channel.sendMeetingBriefs}
                onChange={(sendMeetingBriefs) =>
                  executeFeatures({
                    channelId: channel.id,
                    sendMeetingBriefs,
                  })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Draft notifications</span>
              <Toggle
                name={`draft-notifs-${channel.id}`}
                enabled={channel.notifyActions.includes("DRAFT_EMAIL")}
                onChange={(notifyDraftEmail) =>
                  executeFeatures({
                    channelId: channel.id,
                    notifyDraftEmail,
                  })
                }
              />
            </div>
          </div>
        )}
```

The existing single toggle block (lines 299-312) should be replaced with the multi-toggle block above.

- [ ] **Step 4: Update the API route or SWR hook to return `notifyActions`**

Check what the `useMessagingChannels` hook fetches. The `GET /api/user/messaging-channels` route needs to include `notifyActions` in its select. Find and update the Prisma query in `apps/web/app/api/user/messaging-channels/route.ts` to include `notifyActions: true` in the select.

- [ ] **Step 5: Type check**

Run:
```bash
cd apps/web && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/utils/actions/messaging-channels.validation.ts apps/web/utils/actions/messaging-channels.ts apps/web/app/\(app\)/\[emailAccountId\]/briefs/DeliveryChannelsSetting.tsx apps/web/app/api/user/messaging-channels/route.ts
git commit -m "feat: add draft notification toggle to messaging channel settings"
```

---

## Task 7: Integration test and type check

**Files:**
- Test: full type check and test suite

- [ ] **Step 1: Run type check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: All tests pass, including the new `draft-notification.test.ts`.

- [ ] **Step 3: Commit any fixes**

If any issues found, fix and commit:
```bash
git add -A
git commit -m "fix: address type/test issues in draft notifications"
```

- [ ] **Step 4: Final commit — update disconnectChannelAction**

In `apps/web/utils/actions/messaging-channels.ts`, the `disconnectChannelAction` (line 145) resets `sendMeetingBriefs` and `sendDocumentFilings` to false. Also reset `notifyActions`:

```typescript
      data: {
        isConnected: false,
        channelId: null,
        channelName: null,
        sendMeetingBriefs: false,
        sendDocumentFilings: false,
        notifyActions: [],
      },
```

```bash
git add apps/web/utils/actions/messaging-channels.ts
git commit -m "fix: clear notifyActions on channel disconnect"
```
