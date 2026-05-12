import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { searchReplyContextEmails } from "@/utils/ai/reply/reply-context-collector";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage } from "@/utils/types";
import {
  createGmailTestHarness,
  createOutlookTestHarness,
  type GmailTestHarness,
  type OutlookTestHarness,
} from "./helpers";

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const GMAIL_EMAIL = "account@example.com";
const OUTLOOK_EMAIL = "account@outlook.example.com";
const HISTORICAL_THREAD_ID = "thread-1";
const HISTORICAL_CONVERSATION_ID = "conversation-1";
const CURRENT_THREAD_ID = "thread-2";
const CURRENT_MESSAGE_ID = "message-1";
const SEARCH_QUERY = "WayFair";
const SEARCH_AFTER = new Date("2026-01-01T00:00:00Z");

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "reply-context search thread precedent — Gmail",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        email: GMAIL_EMAIL,
        messages: gmailFurniturePrecedentSeed(GMAIL_EMAIL),
      });
    });

    afterAll(async () => {
      await harness?.emulator.close();
    });

    providerPrecedentSuite(() => harness.provider, GMAIL_EMAIL);
  },
);

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "reply-context search thread precedent — Outlook",
  { timeout: 30_000 },
  () => {
    let harness: OutlookTestHarness;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: OUTLOOK_EMAIL,
        messages: outlookFurniturePrecedentSeed(OUTLOOK_EMAIL),
      });
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    providerPrecedentSuite(() => harness.provider, OUTLOOK_EMAIL);
  },
);

function providerPrecedentSuite(
  getProvider: () => EmailProvider,
  accountEmail: string,
) {
  test("message-level historical search misses the prior correction", async () => {
    const messageLevelContext = await collectMessageLevelSearchContext(
      getProvider(),
      SEARCH_QUERY,
    );
    const senders = messageLevelContext.map((email) => email.from);

    expect(messageLevelContext.length).toBeGreaterThan(0);
    expect(senders.some((sender) => sender.includes(accountEmail))).toBe(false);
  });

  test("production historical search expands matching hits and excludes the current thread", async () => {
    const threadLevelContext = await searchReplyContextEmails({
      emailProvider: getProvider(),
      query: SEARCH_QUERY,
      after: SEARCH_AFTER,
      currentThread: getCurrentWayfairThreadContext(accountEmail),
    });
    const senders = threadLevelContext.map((email) => email.from);

    expect(threadLevelContext.length).toBeGreaterThanOrEqual(3);
    expect(senders.some((sender) => sender.includes(accountEmail))).toBe(true);
    expect(
      countEmailSendersContaining(threadLevelContext, "customer@example.com"),
    ).toBe(2);
    expect(
      senders.some((sender) => sender.includes("new-customer@example.com")),
    ).toBe(false);
  });
}

async function collectMessageLevelSearchContext(
  provider: EmailProvider,
  query: string,
) {
  const { messages } = await provider.getMessagesWithPagination({
    query,
    maxResults: 20,
    after: SEARCH_AFTER,
  });

  return messages.map(toCollectorEmail);
}

function getCurrentWayfairThreadContext(accountEmail: string) {
  return [
    {
      id: CURRENT_MESSAGE_ID,
      threadId: CURRENT_THREAD_ID,
      from: "new-customer@example.com",
      to: accountEmail,
      subject: "Light strip colors",
      content:
        "I bought a WayFair desk and need help changing the light strip colors.",
      date: new Date("2026-05-12T12:00:00Z"),
    },
  ];
}

function toCollectorEmail(message: ParsedMessage) {
  return getEmailForLLM(message, {
    maxLength: 2000,
  });
}

function countEmailSendersContaining(
  emails: Array<{ from: string }>,
  senderEmail: string,
) {
  return emails.filter((email) => email.from.includes(senderEmail)).length;
}

function gmailFurniturePrecedentSeed(email: string) {
  return [
    {
      id: CURRENT_MESSAGE_ID,
      user_email: email,
      thread_id: CURRENT_THREAD_ID,
      message_id: "<message-1@example.com>",
      from: "new-customer@example.com",
      to: email,
      subject: "Light strip colors",
      body_text:
        "I bought a WayFair desk and need help changing the light strip colors.",
      label_ids: ["INBOX"],
      internal_date: "1778600000000",
    },
    {
      id: "message-2",
      user_email: email,
      thread_id: HISTORICAL_THREAD_ID,
      message_id: "<message-2@example.com>",
      from: "customer@example.com",
      to: email,
      subject: "Inbox Zero Support Request",
      body_text: `Good evening!

I just bought from WayFair your Farmhouse L Shaped Standing Desk, 55 Inch Height Adjustable Corner Desk With Storage Drawers, Standing Computer Desks With Power Outlets For Home Office.

I've assembled it all and the control panel for the rising desk just reads "RsT". I'm unable to raise or lower the desk.

Could you please advise me on how I can clear the code?`,
      label_ids: ["INBOX"],
      internal_date: "1778131920000",
    },
    {
      id: "message-3",
      user_email: email,
      thread_id: HISTORICAL_THREAD_ID,
      message_id: "<message-3@example.com>",
      in_reply_to: "<message-2@example.com>",
      references: "<message-2@example.com>",
      from: email,
      to: "customer@example.com",
      subject: "Re: Inbox Zero Support Request",
      body_text:
        "Hey, we don't sell furniture. This is the wrong email address. We're an email company: https://getinboxzero.com",
      label_ids: ["SENT"],
      internal_date: "1778156940000",
    },
    {
      id: "message-4",
      user_email: email,
      thread_id: HISTORICAL_THREAD_ID,
      message_id: "<message-4@example.com>",
      in_reply_to: "<message-3@example.com>",
      references: "<message-2@example.com> <message-3@example.com>",
      from: "customer@example.com",
      to: email,
      subject: "Re: Inbox Zero Support Request",
      body_text: "Thx for letting me know!",
      label_ids: ["INBOX"],
      internal_date: "1778188620000",
    },
    {
      id: "message-5",
      user_email: email,
      thread_id: "thread-3",
      message_id: "<message-5@example.com>",
      from: "receipts@example.com",
      to: email,
      subject: "Receipt",
      body_text: "A generic WayFair receipt with no support precedent.",
      label_ids: ["INBOX"],
      internal_date: "1778000000000",
    },
  ];
}

function outlookFurniturePrecedentSeed(email: string) {
  return [
    {
      microsoft_id: CURRENT_MESSAGE_ID,
      conversation_id: CURRENT_THREAD_ID,
      internet_message_id: "<message-1@example.com>",
      user_email: email,
      from: { address: "new-customer@example.com", name: "New Customer" },
      to_recipients: [{ address: email }],
      subject: "Light strip colors",
      body_content_type: "text" as const,
      body_content:
        "I bought a WayFair desk and need help changing the light strip colors.",
      body_text_content:
        "I bought a WayFair desk and need help changing the light strip colors.",
      parent_folder_id: "inbox",
      is_read: true,
      received_date_time: "2026-05-12T12:00:00Z",
    },
    {
      microsoft_id: "message-2",
      conversation_id: HISTORICAL_CONVERSATION_ID,
      internet_message_id: "<message-2@example.com>",
      user_email: email,
      from: { address: "customer@example.com", name: "Customer" },
      to_recipients: [{ address: email }],
      subject: "Inbox Zero Support Request",
      body_content_type: "text" as const,
      body_content: `Good evening!

I just bought from WayFair your Farmhouse L Shaped Standing Desk, 55 Inch Height Adjustable Corner Desk With Storage Drawers, Standing Computer Desks With Power Outlets For Home Office.

I've assembled it all and the control panel for the rising desk just reads "RsT". I'm unable to raise or lower the desk.

Could you please advise me on how I can clear the code?`,
      body_text_content: `Good evening!

I just bought from WayFair your Farmhouse L Shaped Standing Desk, 55 Inch Height Adjustable Corner Desk With Storage Drawers, Standing Computer Desks With Power Outlets For Home Office.

I've assembled it all and the control panel for the rising desk just reads "RsT". I'm unable to raise or lower the desk.

Could you please advise me on how I can clear the code?`,
      parent_folder_id: "inbox",
      is_read: true,
      received_date_time: "2026-05-07T02:52:00Z",
    },
    {
      microsoft_id: "message-3",
      conversation_id: HISTORICAL_CONVERSATION_ID,
      internet_message_id: "<message-3@example.com>",
      user_email: email,
      from: { address: email, name: "Test User" },
      to_recipients: [{ address: "customer@example.com" }],
      subject: "Re: Inbox Zero Support Request",
      body_content_type: "text" as const,
      body_content:
        "Hey, we don't sell furniture. This is the wrong email address. We're an email company: https://getinboxzero.com",
      body_text_content:
        "Hey, we don't sell furniture. This is the wrong email address. We're an email company: https://getinboxzero.com",
      parent_folder_id: "sentitems",
      is_read: true,
      received_date_time: "2026-05-07T09:29:00Z",
      sent_date_time: "2026-05-07T09:29:00Z",
    },
    {
      microsoft_id: "message-4",
      conversation_id: HISTORICAL_CONVERSATION_ID,
      internet_message_id: "<message-4@example.com>",
      user_email: email,
      from: { address: "customer@example.com", name: "Customer" },
      to_recipients: [{ address: email }],
      subject: "Re: Inbox Zero Support Request",
      body_content_type: "text" as const,
      body_content: "Thx for letting me know!",
      body_text_content: "Thx for letting me know!",
      parent_folder_id: "inbox",
      is_read: true,
      received_date_time: "2026-05-07T17:17:00Z",
    },
    {
      microsoft_id: "message-5",
      conversation_id: "conversation-2",
      internet_message_id: "<message-5@example.com>",
      user_email: email,
      from: { address: "receipts@example.com", name: "Receipts" },
      to_recipients: [{ address: email }],
      subject: "Receipt",
      body_content_type: "text" as const,
      body_content: "A generic WayFair receipt with no support precedent.",
      body_text_content: "A generic WayFair receipt with no support precedent.",
      parent_folder_id: "inbox",
      is_read: true,
      received_date_time: "2026-05-06T12:00:00Z",
    },
  ];
}
