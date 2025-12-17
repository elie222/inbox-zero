/**
 * E2E tests for Gmail thread label removal
 *
 * These tests verify that conversation status labels (To Reply, Awaiting Reply, FYI, Actioned)
 * are mutually exclusive within a thread - when applying a new label, existing conflicting
 * labels should be removed from ALL messages in the thread.
 *
 * Usage:
 * pnpm test-e2e gmail-thread-label-removal
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";
import { removeConflictingThreadStatusLabels } from "@/utils/reply-tracker/label-helpers";
import { createScopedLogger } from "@/utils/logger";
import { findThreadWithMultipleMessages } from "./helpers";

const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_GMAIL_EMAIL = process.env.TEST_GMAIL_EMAIL;

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS)("Gmail Thread Label Removal E2E Tests", () => {
  let provider: EmailProvider;
  let emailAccountId: string;
  let testThreadId: string;
  let testMessages: ParsedMessage[];
  const createdTestLabels: string[] = [];
  const logger = createScopedLogger("e2e-test");

  beforeAll(async () => {
    if (!TEST_GMAIL_EMAIL) {
      throw new Error("TEST_GMAIL_EMAIL env var is required");
    }

    const emailAccount = await prisma.emailAccount.findFirst({
      where: {
        email: TEST_GMAIL_EMAIL,
        account: { provider: "google" },
      },
      include: { account: true },
    });

    if (!emailAccount) {
      throw new Error(`No Gmail account found for ${TEST_GMAIL_EMAIL}`);
    }

    emailAccountId = emailAccount.id;
    provider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: "google",
    });

    // Find a suitable test thread with 2+ messages
    const { threadId, messages } = await findThreadWithMultipleMessages(
      provider,
      2,
    );
    testThreadId = threadId;
    testMessages = messages;
  }, 60_000);

  afterAll(async () => {
    // Clean up test labels
    for (const labelName of createdTestLabels) {
      try {
        const label = await provider.getLabelByName(labelName);
        if (label) {
          await provider.removeThreadLabel(testThreadId, label.id);
          await provider.deleteLabel(label.id);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // ============================================
  // TEST 1: Provider Level - removeThreadLabels()
  // ============================================
  describe("Provider Level: removeThreadLabels()", () => {
    test("should remove labels from thread", async () => {
      expect(
        testMessages.length,
        "Test requires a thread with 2+ messages. Reply to an email in the test inbox to create one.",
      ).toBeGreaterThanOrEqual(2);

      // Create test label
      const testLabelName = `E2E-ThreadRemoval-${Date.now()}`;
      createdTestLabels.push(testLabelName);
      const label = await provider.createLabel(testLabelName);

      // Apply label to the thread (Gmail applies to all messages in thread)
      await provider.labelMessage({
        messageId: testMessages[0].id,
        labelId: label.id,
        labelName: label.name,
      });

      // Verify the thread has the label
      const msgBefore = await provider.getMessage(testMessages[0].id);
      expect(msgBefore.labelIds).toContain(label.id);

      // Remove the label from the thread using removeThreadLabels
      await provider.removeThreadLabels(testThreadId, [label.id]);

      // Verify the thread no longer has the label
      const msgAfter = await provider.getMessage(testMessages[0].id);
      expect(msgAfter.labelIds).not.toContain(label.id);
    }, 60_000);

    test("should remove multiple labels from thread", async () => {
      expect(
        testMessages.length,
        "Test requires a thread with 2+ messages. Reply to an email in the test inbox to create one.",
      ).toBeGreaterThanOrEqual(2);

      // Create multiple test labels
      const label1Name = `E2E-Multi1-${Date.now()}`;
      const label2Name = `E2E-Multi2-${Date.now()}`;
      createdTestLabels.push(label1Name, label2Name);

      const label1 = await provider.createLabel(label1Name);
      const label2 = await provider.createLabel(label2Name);

      // Apply both labels to the thread
      await provider.labelMessage({
        messageId: testMessages[0].id,
        labelId: label1.id,
        labelName: label1.name,
      });
      await provider.labelMessage({
        messageId: testMessages[0].id,
        labelId: label2.id,
        labelName: label2.name,
      });

      // Verify thread has both labels
      const msgBefore = await provider.getMessage(testMessages[0].id);
      expect(msgBefore.labelIds).toContain(label1.id);
      expect(msgBefore.labelIds).toContain(label2.id);

      // Remove both labels from the thread
      await provider.removeThreadLabels(testThreadId, [label1.id, label2.id]);

      // Verify thread has neither label
      const msgAfter = await provider.getMessage(testMessages[0].id);
      expect(msgAfter.labelIds).not.toContain(label1.id);
      expect(msgAfter.labelIds).not.toContain(label2.id);
    }, 60_000);
  });

  // ============================================
  // TEST 2: Label Helpers Level - removeConflictingThreadStatusLabels()
  // ============================================
  describe("Label Helpers Level: removeConflictingThreadStatusLabels()", () => {
    test("should remove conflicting conversation status labels when applying a new status", async () => {
      expect(
        testMessages.length,
        "Test requires a thread with 2+ messages. Reply to an email in the test inbox to create one.",
      ).toBeGreaterThanOrEqual(2);

      // Create conversation status labels
      const toReplyLabelName = getRuleLabel(SystemType.TO_REPLY);
      const awaitingReplyLabelName = getRuleLabel(SystemType.AWAITING_REPLY);
      createdTestLabels.push(toReplyLabelName, awaitingReplyLabelName);

      const toReplyLabel = await provider.createLabel(toReplyLabelName);
      const awaitingReplyLabel = await provider.createLabel(
        awaitingReplyLabelName,
      );

      // Apply "To Reply" label to thread
      await provider.labelMessage({
        messageId: testMessages[0].id,
        labelId: toReplyLabel.id,
        labelName: toReplyLabel.name,
      });

      // Apply "Awaiting Reply" label to thread
      await provider.labelMessage({
        messageId: testMessages[0].id,
        labelId: awaitingReplyLabel.id,
        labelName: awaitingReplyLabel.name,
      });

      // Verify labels are applied
      const msgBefore = await provider.getMessage(testMessages[0].id);
      expect(msgBefore.labelIds).toContain(toReplyLabel.id);
      expect(msgBefore.labelIds).toContain(awaitingReplyLabel.id);

      // Call removeConflictingThreadStatusLabels with FYI status
      // This should remove TO_REPLY and AWAITING_REPLY labels from the thread
      await removeConflictingThreadStatusLabels({
        emailAccountId,
        threadId: testThreadId,
        systemType: SystemType.FYI,
        provider,
        logger,
      });

      // Verify conflicting labels are removed
      const msgAfter = await provider.getMessage(testMessages[0].id);
      expect(msgAfter.labelIds).not.toContain(toReplyLabel.id);
      expect(msgAfter.labelIds).not.toContain(awaitingReplyLabel.id);
    }, 60_000);
  });
});
