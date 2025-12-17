/**
 * E2E tests for Microsoft Outlook thread category removal
 *
 * These tests verify that conversation status labels (To Reply, Awaiting Reply, FYI, Actioned)
 * are mutually exclusive within a thread - when applying a new label, existing conflicting
 * labels should be removed from ALL messages in the thread.
 *
 * Usage:
 * pnpm test-e2e microsoft-thread-category-removal
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

const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS)(
  "Microsoft Outlook Thread Category Removal E2E Tests",
  () => {
    let provider: EmailProvider;
    let emailAccountId: string;
    let testThreadId: string;
    let testMessages: ParsedMessage[];
    const createdTestLabels: string[] = [];
    const logger = createScopedLogger("e2e-test");

    beforeAll(async () => {
      if (!TEST_OUTLOOK_EMAIL) {
        throw new Error("TEST_OUTLOOK_EMAIL env var is required");
      }

      const emailAccount = await prisma.emailAccount.findFirst({
        where: {
          email: TEST_OUTLOOK_EMAIL,
          account: { provider: "microsoft" },
        },
        include: { account: true },
      });

      if (!emailAccount) {
        throw new Error(`No Outlook account found for ${TEST_OUTLOOK_EMAIL}`);
      }

      emailAccountId = emailAccount.id;
      provider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: "microsoft",
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
      test("should remove categories from ALL messages in a thread", async () => {
        expect(
          testMessages.length,
          "Test requires a thread with 2+ messages. Reply to an email in the test inbox to create one.",
        ).toBeGreaterThanOrEqual(2);

        // Create test category
        const testCategoryName = `E2E-ThreadRemoval-${Date.now()}`;
        createdTestLabels.push(testCategoryName);
        const category = await provider.createLabel(testCategoryName);

        // Apply category to ALL messages in the thread
        for (const msg of testMessages) {
          await provider.labelMessage({
            messageId: msg.id,
            labelId: category.id,
            labelName: category.name,
          });
        }

        // Verify all messages have the category
        for (const msg of testMessages) {
          const message = await provider.getMessage(msg.id);
          expect(message.labelIds).toContain(category.name);
        }

        // Remove the category from the thread using removeThreadLabels
        await provider.removeThreadLabels(testThreadId, [category.id]);

        // Verify ALL messages no longer have the category
        for (const msg of testMessages) {
          const message = await provider.getMessage(msg.id);
          expect(message.labelIds).not.toContain(category.name);
        }
      }, 60_000);

      test("should remove multiple categories from all messages in a thread", async () => {
        expect(
          testMessages.length,
          "Test requires a thread with 2+ messages. Reply to an email in the test inbox to create one.",
        ).toBeGreaterThanOrEqual(2);

        // Create multiple test categories
        const category1Name = `E2E-Multi1-${Date.now()}`;
        const category2Name = `E2E-Multi2-${Date.now()}`;
        createdTestLabels.push(category1Name, category2Name);

        const category1 = await provider.createLabel(category1Name);
        const category2 = await provider.createLabel(category2Name);

        // Apply both categories to all messages
        for (const msg of testMessages) {
          await provider.labelMessage({
            messageId: msg.id,
            labelId: category1.id,
            labelName: category1.name,
          });
          await provider.labelMessage({
            messageId: msg.id,
            labelId: category2.id,
            labelName: category2.name,
          });
        }

        // Verify all messages have both categories
        for (const msg of testMessages) {
          const message = await provider.getMessage(msg.id);
          expect(message.labelIds).toContain(category1.name);
          expect(message.labelIds).toContain(category2.name);
        }

        // Remove both categories from the thread
        await provider.removeThreadLabels(testThreadId, [
          category1.id,
          category2.id,
        ]);

        // Verify ALL messages have neither category
        for (const msg of testMessages) {
          const message = await provider.getMessage(msg.id);
          expect(message.labelIds).not.toContain(category1.name);
          expect(message.labelIds).not.toContain(category2.name);
        }
      }, 60_000);
    });

    // ============================================
    // TEST 2: Label Helpers Level - removeConflictingThreadStatusLabels()
    // ============================================
    describe("Label Helpers Level: removeConflictingThreadStatusLabels()", () => {
      test("should remove conflicting conversation status categories when applying a new status", async () => {
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

        // Apply "To Reply" to first message
        await provider.labelMessage({
          messageId: testMessages[0].id,
          labelId: toReplyLabel.id,
          labelName: toReplyLabel.name,
        });

        // Apply "Awaiting Reply" to second message
        await provider.labelMessage({
          messageId: testMessages[1].id,
          labelId: awaitingReplyLabel.id,
          labelName: awaitingReplyLabel.name,
        });

        // Verify labels are applied
        const msg1Before = await provider.getMessage(testMessages[0].id);
        expect(msg1Before.labelIds).toContain(toReplyLabel.name);

        const msg2Before = await provider.getMessage(testMessages[1].id);
        expect(msg2Before.labelIds).toContain(awaitingReplyLabel.name);

        // Call removeConflictingThreadStatusLabels with FYI status
        // This should remove TO_REPLY and AWAITING_REPLY labels from the thread
        await removeConflictingThreadStatusLabels({
          emailAccountId,
          threadId: testThreadId,
          systemType: SystemType.FYI,
          provider,
          logger,
        });

        // Verify ALL conflicting labels are removed from ALL messages
        for (const msg of testMessages) {
          const message = await provider.getMessage(msg.id);
          expect(message.labelIds).not.toContain(toReplyLabel.name);
          expect(message.labelIds).not.toContain(awaitingReplyLabel.name);
        }
      }, 60_000);
    });
  },
);

/**
 * Finds a thread with at least minMessages messages from the inbox.
 * Looks through recent inbox messages and finds one with multiple messages in thread.
 */
async function findThreadWithMultipleMessages(
  provider: EmailProvider,
  minMessages = 2,
): Promise<{ threadId: string; messages: ParsedMessage[] }> {
  const inboxMessages = await provider.getInboxMessages(50);

  // Group by threadId and find one with enough messages
  const threadIds = [...new Set(inboxMessages.map((m) => m.threadId))];

  for (const threadId of threadIds) {
    const messages = await provider.getThreadMessages(threadId);
    if (messages.length >= minMessages) {
      return { threadId, messages };
    }
  }

  throw new Error(
    `TEST PREREQUISITE NOT MET: No thread found with ${minMessages}+ messages. ` +
      "Send an email to the test account and reply to it to create a multi-message thread.",
  );
}
