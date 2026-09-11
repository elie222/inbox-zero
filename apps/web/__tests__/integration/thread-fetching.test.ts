/**
 * Integration test: Gmail thread fetching & pagination via @inbox-zero/emulate
 *
 * Tests getThread, getThreadsWithNextPageToken, and GmailProvider's
 * getMessagesWithPagination against a local Gmail emulator with seeded threads.
 *
 * Usage:
 *   pnpm test-integration thread-fetching
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";
import { getThread, getThreadsWithNextPageToken } from "@/utils/gmail/thread";

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "thread-test@example.com";
const TEST_PORT = 4104;

// Seed enough messages to test pagination (maxResults=2 → need >2 messages)
const SEED_MESSAGES = [
  {
    id: "msg_1",
    user_email: TEST_EMAIL,
    from: "alice@example.com",
    to: TEST_EMAIL,
    subject: "First thread",
    body_text: "Message one",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900000000",
  },
  {
    id: "msg_2",
    user_email: TEST_EMAIL,
    from: "bob@example.com",
    to: TEST_EMAIL,
    subject: "Second thread",
    body_text: "Message two",
    label_ids: ["INBOX"],
    internal_date: "1711900060000",
  },
  {
    id: "msg_3",
    user_email: TEST_EMAIL,
    from: "carol@example.com",
    to: TEST_EMAIL,
    subject: "Third thread",
    body_text: "Message three",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900120000",
  },
  {
    id: "msg_4",
    user_email: TEST_EMAIL,
    from: "dave@example.com",
    to: TEST_EMAIL,
    subject: "Fourth thread",
    body_text: "Message four",
    label_ids: ["INBOX"],
    internal_date: "1711900180000",
  },
  {
    id: "msg_5",
    user_email: TEST_EMAIL,
    from: "eve@example.com",
    to: TEST_EMAIL,
    subject: "Fifth thread",
    body_text: "Message five",
    label_ids: ["SENT"],
    internal_date: "1711900240000",
  },
];

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Thread fetching & pagination",
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
      await harness?.emulator.close();
    });

    test("getThread returns full thread with messages", async () => {
      // Get thread ID for msg_1
      const msg = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_1",
      });
      const threadId = msg.data.threadId!;

      const thread = await getThread(threadId, gmailClient);

      expect(thread.id).toBe(threadId);
      expect(thread.messages).toBeDefined();
      expect(thread.messages!.length).toBeGreaterThanOrEqual(1);
    });

    test("getThreadsWithNextPageToken returns threads", async () => {
      const result = await getThreadsWithNextPageToken({
        gmail: gmailClient,
        maxResults: 10,
      });

      expect(result.threads).toBeDefined();
      expect(result.threads.length).toBeGreaterThanOrEqual(1);
    });

    test("getThreadsWithNextPageToken supports pagination with maxResults", async () => {
      // Request only 2 threads at a time
      const page1 = await getThreadsWithNextPageToken({
        gmail: gmailClient,
        maxResults: 2,
      });

      expect(page1.threads.length).toBeLessThanOrEqual(2);

      // With 5 seeded messages and maxResults=2, pagination must exist
      expect(page1.nextPageToken).toBeDefined();

      if (page1.nextPageToken) {
        const page2 = await getThreadsWithNextPageToken({
          gmail: gmailClient,
          maxResults: 2,
          pageToken: page1.nextPageToken,
        });

        expect(page2.threads.length).toBeGreaterThanOrEqual(1);

        // Pages should have different threads
        const page1Ids = new Set(page1.threads.map((t) => t.id));
        const overlap = page2.threads.filter((t) => page1Ids.has(t.id));
        expect(overlap).toHaveLength(0);
      }
    });

    test("GmailProvider.getMessagesWithPagination returns parsed messages", async () => {
      const result = await provider.getMessagesWithPagination({
        maxResults: 10,
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBe(5);

      // Verify messages are properly parsed with headers
      for (const msg of result.messages) {
        expect(msg.id).toBeDefined();
        expect(msg.headers.from).toBeDefined();
        expect(msg.headers.to).toBeDefined();
        expect(msg.headers.subject).toBeDefined();
      }
    });

    test("GmailProvider.getMessagesWithPagination paginates correctly", async () => {
      const page1 = await provider.getMessagesWithPagination({
        maxResults: 2,
      });

      expect(page1.messages.length).toBeLessThanOrEqual(2);

      if (page1.nextPageToken) {
        const page2 = await provider.getMessagesWithPagination({
          maxResults: 2,
          pageToken: page1.nextPageToken,
        });

        expect(page2.messages.length).toBeGreaterThanOrEqual(1);

        // No duplicate messages across pages
        const page1Ids = new Set(page1.messages.map((m) => m.id));
        const duplicates = page2.messages.filter((m) => page1Ids.has(m.id));
        expect(duplicates).toHaveLength(0);
      }
    });

    test("GmailProvider.getMessagesWithPagination returns correct label data", async () => {
      const result = await provider.getMessagesWithPagination({
        maxResults: 10,
      });

      // msg_1 has INBOX + UNREAD
      const msg1 = result.messages.find((m) => m.id === "msg_1");
      expect(msg1).toBeDefined();
      expect(msg1!.labelIds).toContain("INBOX");
      expect(msg1!.labelIds).toContain("UNREAD");

      // msg_5 has SENT (not INBOX)
      const msg5 = result.messages.find((m) => m.id === "msg_5");
      expect(msg5).toBeDefined();
      expect(msg5!.labelIds).toContain("SENT");
      expect(msg5!.labelIds).not.toContain("INBOX");
    });
  },
);
