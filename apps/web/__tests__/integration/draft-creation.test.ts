/**
 * Integration test: Gmail draft creation & sending via @inbox-zero/emulate
 *
 * Tests draftEmail (reply draft creation) and sendDraft against a local
 * Gmail emulator. Verifies drafts are created with correct threading,
 * appear in the drafts list, and can be sent.
 *
 * Usage:
 *   pnpm test-integration draft-creation
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";
import { draftEmail } from "@/utils/gmail/mail";
import { sendDraft } from "@/utils/gmail/draft";

// draftEmail needs ensureEmailSendingEnabled which checks env vars
vi.mock("@/utils/mail", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/utils/mail")>();
  return {
    ...original,
    ensureEmailSendingEnabled: () => {},
  };
});

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "draft-test@example.com";
const TEST_PORT = 4105;

const SEED_MESSAGES = [
  {
    id: "msg_original",
    user_email: TEST_EMAIL,
    from: "alice@example.com",
    to: TEST_EMAIL,
    subject: "Project update",
    body_text: "Here is the latest update on the project.",
    body_html: "<p>Here is the latest update on the project.</p>",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900000000",
  },
];

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Draft creation & sending",
  { timeout: 30_000 },
  () => {
    let harness: GmailTestHarness;
    let gmailClient: GmailTestHarness["gmailClient"];
    let provider: GmailTestHarness["provider"];

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        port: TEST_PORT,
        email: TEST_EMAIL,
        messages: SEED_MESSAGES,
      });
      gmailClient = harness.gmailClient;
      provider = harness.provider;
    });

    afterAll(async () => {
      await harness?.emulator?.close();
    });

    test("draftEmail creates a reply draft on a thread", async () => {
      // Fetch the original message via the provider to get parsed headers
      const result = await provider.getMessagesWithPagination({
        maxResults: 1,
      });
      const originalMsg = result.messages[0];

      const draftResult = await draftEmail(
        gmailClient,
        {
          threadId: originalMsg.threadId,
          id: originalMsg.id,
          headers: originalMsg.headers,
          textPlain: originalMsg.textPlain || "",
          textHtml: originalMsg.textHtml || "",
          snippet: originalMsg.snippet || "",
          attachments: [],
          internalDate: originalMsg.internalDate,
          rawRecipients: [],
        },
        {
          content: "Thanks for the update! I'll review this today.",
        },
        TEST_EMAIL,
      );

      expect(draftResult.data.id).toBeDefined();
      expect(draftResult.data.message?.id).toBeDefined();

      // Verify draft appears in drafts list
      const drafts = await gmailClient.users.drafts.list({ userId: "me" });
      const found = drafts.data.drafts?.find(
        (d) => d.id === draftResult.data.id,
      );
      expect(found).toBeDefined();
    });

    test("sendDraft sends a draft and returns message/thread IDs", async () => {
      // Create a draft first
      const result = await provider.getMessagesWithPagination({
        maxResults: 1,
      });
      const originalMsg = result.messages[0];

      const draftResult = await draftEmail(
        gmailClient,
        {
          threadId: originalMsg.threadId,
          id: originalMsg.id,
          headers: originalMsg.headers,
          textPlain: originalMsg.textPlain || "",
          textHtml: originalMsg.textHtml || "",
          snippet: originalMsg.snippet || "",
          attachments: [],
          internalDate: originalMsg.internalDate,
          rawRecipients: [],
        },
        {
          content: "Draft that will be sent.",
        },
        TEST_EMAIL,
      );

      const draftId = draftResult.data.id!;

      // Send it
      const sent = await sendDraft(gmailClient, draftId);

      expect(sent.messageId).toBeDefined();
      expect(sent.threadId).toBeDefined();

      // Verify draft is no longer in drafts list
      const drafts = await gmailClient.users.drafts.list({ userId: "me" });
      const stillThere = drafts.data.drafts?.find((d) => d.id === draftId);
      expect(stillThere).toBeUndefined();
    });

    test("draftEmail with explicit subject overrides original", async () => {
      const result = await provider.getMessagesWithPagination({
        maxResults: 1,
      });
      const originalMsg = result.messages[0];

      const draftResult = await draftEmail(
        gmailClient,
        {
          threadId: originalMsg.threadId,
          id: originalMsg.id,
          headers: originalMsg.headers,
          textPlain: originalMsg.textPlain || "",
          textHtml: originalMsg.textHtml || "",
          snippet: originalMsg.snippet || "",
          attachments: [],
          internalDate: originalMsg.internalDate,
          rawRecipients: [],
        },
        {
          content: "Changed subject reply.",
          subject: "Custom Subject Override",
        },
        TEST_EMAIL,
      );

      expect(draftResult.data.id).toBeDefined();

      // Fetch the draft to verify subject
      const draft = await gmailClient.users.drafts.get({
        userId: "me",
        id: draftResult.data.id!,
        format: "full",
      });
      const subjectHeader = draft.data.message?.payload?.headers?.find(
        (h) => h.name?.toLowerCase() === "subject",
      );
      expect(subjectHeader?.value).toBe("Custom Subject Override");
    });
  },
);
