import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  createGmailTestHarness,
  createOutlookTestHarness,
  type GmailTestHarness,
  type OutlookTestHarness,
} from "./helpers";

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const gmailEmail = "shared-gmail@example.com";
const outlookEmail = "shared-outlook@example.com";
const threadId = "team-comments-thread";
const historyCount = 25;

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "shared conversation complete provider retrieval — Gmail",
  { timeout: 60_000 },
  () => {
    let harness: GmailTestHarness;

    beforeAll(async () => {
      harness = await createGmailTestHarness({
        email: gmailEmail,
        messages: [
          ...Array.from({ length: historyCount }, (_, index) => ({
            id: `shared-history-${index}`,
            thread_id: threadId,
            user_email: gmailEmail,
            from: "sender@example.com",
            to: gmailEmail,
            subject: "Team discussion",
            body_text: `History ${index}`,
            label_ids: ["INBOX"],
            internal_date: String(1_790_000_000_000 + index * 1000),
          })),
          {
            id: "shared-changed-recipient",
            thread_id: threadId,
            user_email: gmailEmail,
            from: gmailEmail,
            to: "new-recipient@example.com",
            subject: "Re: Team discussion",
            body_text: "Changed recipient branch",
            label_ids: ["SENT"],
            internal_date: "1790000030000",
          },
          {
            id: "shared-draft",
            thread_id: threadId,
            user_email: gmailEmail,
            from: gmailEmail,
            to: "new-recipient@example.com",
            subject: "Re: Team discussion",
            body_text: "Private draft",
            label_ids: ["DRAFT"],
            internal_date: "1790000040000",
          },
          {
            id: "unrelated",
            thread_id: "unrelated-thread",
            user_email: gmailEmail,
            from: "other@example.com",
            to: gmailEmail,
            subject: "Unrelated",
            body_text: "Do not share",
            label_ids: ["INBOX"],
            internal_date: "1790000050000",
          },
        ],
      });
    });

    afterAll(async () => {
      await harness?.emulator.close();
    });

    test("returns complete history and the changed-recipient branch without draft or unrelated mail", async () => {
      const thread = await harness.provider.getThread(
        harness.threadIds["shared-history-0"],
        { complete: true },
      );
      const bodies = thread.messages.map(
        (message) => `${message.textPlain ?? ""} ${message.textHtml ?? ""}`,
      );
      expect(thread.messages).toHaveLength(historyCount + 1);
      expect(bodies.some((body) => body.includes("History 24"))).toBe(true);
      expect(
        bodies.some((body) => body.includes("Changed recipient branch")),
      ).toBe(true);
      expect(bodies.some((body) => body.includes("Private draft"))).toBe(false);
      expect(bodies.some((body) => body.includes("Do not share"))).toBe(false);
    });
  },
);

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "shared conversation complete provider retrieval — Microsoft",
  { timeout: 60_000 },
  () => {
    let harness: OutlookTestHarness;

    beforeAll(async () => {
      harness = await createOutlookTestHarness({
        email: outlookEmail,
        messages: [
          ...Array.from({ length: historyCount }, (_, index) => ({
            microsoft_id: `shared-history-${index}`,
            conversation_id: threadId,
            user_email: outlookEmail,
            from: { address: "sender@example.com" },
            to_recipients: [{ address: outlookEmail }],
            subject: "Team discussion",
            body_content: `History ${index}`,
            parent_folder_id: "inbox",
            is_read: true,
            received_date_time: new Date(
              Date.UTC(2026, 8, 22, 12, 0, index),
            ).toISOString(),
          })),
          {
            microsoft_id: "shared-changed-recipient",
            conversation_id: threadId,
            user_email: outlookEmail,
            from: { address: outlookEmail },
            to_recipients: [{ address: "new-recipient@example.com" }],
            subject: "Re: Team discussion",
            body_content: "Changed recipient branch",
            parent_folder_id: "sentitems",
            is_read: true,
            received_date_time: "2026-09-22T12:01:00Z",
          },
          {
            microsoft_id: "shared-draft",
            conversation_id: threadId,
            user_email: outlookEmail,
            from: { address: outlookEmail },
            to_recipients: [{ address: "new-recipient@example.com" }],
            subject: "Re: Team discussion",
            body_content: "Private draft",
            parent_folder_id: "drafts",
            is_read: true,
            is_draft: true,
            received_date_time: "2026-09-22T12:02:00Z",
          },
          {
            microsoft_id: "unrelated",
            conversation_id: "unrelated-thread",
            user_email: outlookEmail,
            from: { address: "other@example.com" },
            to_recipients: [{ address: outlookEmail }],
            subject: "Unrelated",
            body_content: "Do not share",
            parent_folder_id: "inbox",
            is_read: true,
            received_date_time: "2026-09-22T12:03:00Z",
          },
        ],
      });
    });

    afterAll(async () => {
      harness?.restoreFetch();
      await harness?.emulator.close();
    });

    test("follows Graph pages and excludes draft and unrelated mail", async () => {
      const thread = await harness.provider.getThread(threadId, {
        complete: true,
      });
      const bodies = thread.messages.map(
        (message) => `${message.textPlain ?? ""} ${message.textHtml ?? ""}`,
      );
      expect(thread.messages).toHaveLength(historyCount + 1);
      expect(bodies.some((body) => body.includes("History 24"))).toBe(true);
      expect(
        bodies.some((body) => body.includes("Changed recipient branch")),
      ).toBe(true);
      expect(bodies.some((body) => body.includes("Private draft"))).toBe(false);
      expect(bodies.some((body) => body.includes("Do not share"))).toBe(false);
    });
  },
);
