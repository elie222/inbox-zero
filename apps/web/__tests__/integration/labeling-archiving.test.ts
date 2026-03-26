/**
 * Integration test: Gmail labeling & archiving operations via @inbox-zero/emulate
 *
 * Tests labelThread, archiveThread, markReadThread, createLabel, and
 * labelMessage against a local Gmail emulator. Verifies labels persist
 * across operations.
 *
 * Usage:
 *   pnpm test-integration labeling-archiving
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createGmailTestHarness, type GmailTestHarness } from "./helpers";
import {
  labelThread,
  archiveThread,
  markReadThread,
  createLabel,
  getLabels,
  getLabel,
  labelMessage,
  GmailLabel,
} from "@/utils/gmail/label";

vi.mock("server-only", () => ({}));

// Mock Tinybird — archiveThread publishes analytics
vi.mock("@inboxzero/tinybird", () => ({
  publishArchive: vi.fn().mockResolvedValue(undefined),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const TEST_EMAIL = "label-test@example.com";
const TEST_PORT = 4103;

const SEED_MESSAGES = [
  {
    id: "msg_inbox_unread",
    user_email: TEST_EMAIL,
    from: "alice@example.com",
    to: TEST_EMAIL,
    subject: "Unread message in inbox",
    body_text: "Please read me",
    label_ids: ["INBOX", "UNREAD"],
    internal_date: "1711900000000",
  },
  {
    id: "msg_inbox_read",
    user_email: TEST_EMAIL,
    from: "bob@example.com",
    to: TEST_EMAIL,
    subject: "Read message in inbox",
    body_text: "Already read",
    label_ids: ["INBOX"],
    internal_date: "1711900060000",
  },
  {
    id: "msg_starred",
    user_email: TEST_EMAIL,
    from: "carol@example.com",
    to: TEST_EMAIL,
    subject: "Starred message",
    body_text: "Important",
    label_ids: ["INBOX", "STARRED", "UNREAD"],
    internal_date: "1711900120000",
  },
];

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Labeling & archiving operations",
  { timeout: 30_000 },
  () => {
    let emulator: GmailTestHarness["emulator"];
    let gmailClient: GmailTestHarness["gmailClient"];
    let threadIds: GmailTestHarness["threadIds"];

    beforeAll(async () => {
      const harness = await createGmailTestHarness({
        port: TEST_PORT,
        email: TEST_EMAIL,
        messages: SEED_MESSAGES,
      });
      emulator = harness.emulator;
      gmailClient = harness.gmailClient;
      threadIds = harness.threadIds;
    });

    afterAll(async () => {
      await emulator?.close();
    });

    test("markReadThread marks an unread thread as read", async () => {
      const threadId = threadIds.msg_inbox_unread;

      // Verify starts unread
      const before = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbox_unread",
      });
      expect(before.data.labelIds).toContain("UNREAD");

      // Mark as read
      await markReadThread({ gmail: gmailClient, threadId, read: true });

      // Verify UNREAD removed
      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbox_unread",
      });
      expect(after.data.labelIds).not.toContain("UNREAD");
    });

    test("markReadThread marks a read thread as unread", async () => {
      const threadId = threadIds.msg_inbox_read;

      // Verify starts without UNREAD
      const before = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbox_read",
      });
      expect(before.data.labelIds).not.toContain("UNREAD");

      // Mark as unread
      await markReadThread({ gmail: gmailClient, threadId, read: false });

      // Verify UNREAD added
      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbox_read",
      });
      expect(after.data.labelIds).toContain("UNREAD");
    });

    test("labelThread adds and removes labels", async () => {
      const threadId = threadIds.msg_starred;

      await labelThread({
        gmail: gmailClient,
        threadId,
        addLabelIds: [GmailLabel.IMPORTANT],
        removeLabelIds: [GmailLabel.STARRED],
      });

      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_starred",
      });
      expect(after.data.labelIds).toContain("IMPORTANT");
      expect(after.data.labelIds).not.toContain("STARRED");
    });

    test("labelThread skips when no valid labels provided", async () => {
      const threadId = threadIds.msg_inbox_read;

      // Should not throw — just returns undefined
      const result = await labelThread({
        gmail: gmailClient,
        threadId,
        addLabelIds: [],
        removeLabelIds: [],
      });
      expect(result).toBeUndefined();
    });

    test("archiveThread removes INBOX label", async () => {
      const threadId = threadIds.msg_inbox_read;

      // Verify starts in INBOX
      const before = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbox_read",
      });
      expect(before.data.labelIds).toContain("INBOX");

      await archiveThread({
        gmail: gmailClient,
        threadId,
        ownerEmail: TEST_EMAIL,
        actionSource: "automation",
      });

      // Verify INBOX removed
      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbox_read",
      });
      expect(after.data.labelIds).not.toContain("INBOX");
    });

    test("createLabel creates a new user label", async () => {
      const label = await createLabel({
        gmail: gmailClient,
        name: "TestLabel",
      });

      expect(label).toBeDefined();
      expect(label.name).toBe("TestLabel");
      expect(label.id).toBeDefined();

      // Verify it shows up in label list
      const allLabels = await getLabels(gmailClient);
      const found = allLabels?.find((l) => l.name === "TestLabel");
      expect(found).toBeDefined();
    });

    test("getLabel finds label by name", async () => {
      // Create a label first
      await createLabel({ gmail: gmailClient, name: "FindMe" });

      const found = await getLabel({ gmail: gmailClient, name: "FindMe" });
      expect(found).toBeDefined();
      expect(found?.name).toBe("FindMe");
    });

    test("getLabel returns undefined for non-existent label", async () => {
      const found = await getLabel({
        gmail: gmailClient,
        name: "DoesNotExist",
      });
      expect(found).toBeUndefined();
    });

    test("labelMessage modifies a single message", async () => {
      await labelMessage({
        gmail: gmailClient,
        messageId: "msg_inbox_unread",
        addLabelIds: [GmailLabel.STARRED],
      });

      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbox_unread",
      });
      expect(after.data.labelIds).toContain("STARRED");
    });

    test("labelThread with created label applies it to thread", async () => {
      const label = await createLabel({
        gmail: gmailClient,
        name: "AutoApplied",
      });

      const threadId = threadIds.msg_inbox_unread;
      await labelThread({
        gmail: gmailClient,
        threadId,
        addLabelIds: [label.id!],
      });

      const after = await gmailClient.users.messages.get({
        userId: "me",
        id: "msg_inbox_unread",
      });
      expect(after.data.labelIds).toContain(label.id);
    });
  },
);
