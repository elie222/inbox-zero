/**
 * E2E tests for Microsoft Outlook labeling operations
 *
 * Usage:
 * pnpm test-e2e microsoft-labeling
 * pnpm test-e2e microsoft-labeling -t "should apply and remove label"  # Run specific test
 *
 * Setup:
 * 1. Set TEST_OUTLOOK_EMAIL env var to your Outlook email
 * 2. Set TEST_OUTLOOK_MESSAGE_ID with a real messageId from your logs
 * 3. Set TEST_CONVERSATION_ID with a real conversationId from your logs
 *
 * These tests follow a clean slate approach:
 * - Create test labels
 * - Apply labels and verify
 * - Remove labels and verify
 * - Clean up all test labels at the end
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { OutlookProvider } from "@/utils/email/microsoft";

// ============================================
// TEST DATA - SET VIA ENVIRONMENT VARIABLES
// ============================================
const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;
const TEST_CONVERSATION_ID =
  process.env.TEST_CONVERSATION_ID ||
  "AQQkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoAEABuo-fmt9KvQ4u55KlWB32H";
const TEST_OUTLOOK_MESSAGE_ID =
  process.env.TEST_OUTLOOK_MESSAGE_ID ||
  "AQMkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoARgAAA-ybH4V64nRKkgXhv9H-GEkHAP38WoVoPXRMilGF27prOB8AAAIBDAAAAP38WoVoPXRMilGF27prOB8AAABGAqbwAAAA";

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS)("Microsoft Outlook Labeling E2E Tests", () => {
  let provider: OutlookProvider;
  const createdTestLabels: string[] = []; // Track labels to clean up

  beforeAll(async () => {
    const testEmail = TEST_OUTLOOK_EMAIL;

    if (!testEmail) {
      console.warn("\n⚠️  Set TEST_OUTLOOK_EMAIL env var to run these tests");
      console.warn(
        "   Example: TEST_OUTLOOK_EMAIL=your@email.com pnpm test-e2e microsoft-labeling\n",
      );
      return;
    }

    // Load account from DB
    const emailAccount = await prisma.emailAccount.findFirst({
      where: {
        email: testEmail,
        account: {
          provider: "microsoft",
        },
      },
      include: {
        account: true,
      },
    });

    if (!emailAccount) {
      throw new Error(`No Outlook account found for ${testEmail}`);
    }

    provider = (await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: "microsoft",
    })) as OutlookProvider;

    console.log(`\n✅ Using account: ${emailAccount.email}`);
    console.log(`   Account ID: ${emailAccount.id}`);
    console.log(`   Test conversation ID: ${TEST_CONVERSATION_ID}`);
    console.log(`   Test message ID: ${TEST_OUTLOOK_MESSAGE_ID}\n`);
  });

  afterAll(async () => {
    // Clean up all test labels created during the test suite
    if (createdTestLabels.length > 0) {
      console.log(
        `\n   🧹 Cleaning up ${createdTestLabels.length} test labels...`,
      );

      let deletedCount = 0;
      let failedCount = 0;

      for (const labelName of createdTestLabels) {
        try {
          const label = await provider.getLabelByName(labelName);
          if (label) {
            await provider.deleteLabel(label.id);
            deletedCount++;
          }
        } catch {
          failedCount++;
          console.log(`      ⚠️  Failed to delete: ${labelName}`);
        }
      }

      console.log(
        `   ✅ Deleted ${deletedCount} labels, ${failedCount} failed\n`,
      );
    }
  });

  describe("Label Creation and Retrieval", () => {
    test("should create a new label and retrieve it by name", async () => {
      const testLabelName = `E2E Test ${Date.now()}`;
      createdTestLabels.push(testLabelName);

      // Create the label
      const createdLabel = await provider.createLabel(testLabelName);

      expect(createdLabel).toBeDefined();
      expect(createdLabel.id).toBeDefined();
      expect(createdLabel.name).toBe(testLabelName);

      console.log("   ✅ Created label:", testLabelName);
      console.log("      ID:", createdLabel.id);

      // Retrieve the label by name
      const retrievedLabel = await provider.getLabelByName(testLabelName);

      expect(retrievedLabel).toBeDefined();
      expect(retrievedLabel?.id).toBe(createdLabel.id);
      expect(retrievedLabel?.name).toBe(testLabelName);

      console.log("   ✅ Retrieved label by name:", retrievedLabel?.name);
    });

    test("should retrieve label by ID", async () => {
      const testLabelName = `E2E Test ID ${Date.now()}`;
      createdTestLabels.push(testLabelName);

      // Create the label
      const createdLabel = await provider.createLabel(testLabelName);
      const labelId = createdLabel.id;

      console.log("   📝 Created label with ID:", labelId);

      // Retrieve by ID
      const retrievedLabel = await provider.getLabelById(labelId);

      expect(retrievedLabel).toBeDefined();
      expect(retrievedLabel?.id).toBe(labelId);
      expect(retrievedLabel?.name).toBe(testLabelName);

      console.log("   ✅ Retrieved label by ID:", retrievedLabel?.name);
    });

    test("should return null for non-existent label name", async () => {
      const nonExistentName = `NonExistent ${Date.now()}`;

      const label = await provider.getLabelByName(nonExistentName);

      expect(label).toBeNull();
      console.log("   ✅ Correctly returned null for non-existent label");
    });

    test("should list all labels", async () => {
      const labels = await provider.getLabels();

      expect(labels).toBeDefined();
      expect(Array.isArray(labels)).toBe(true);
      expect(labels.length).toBeGreaterThan(0);

      console.log(`   ✅ Retrieved ${labels.length} labels`);
      console.log("      Sample labels:");
      labels.slice(0, 5).forEach((label) => {
        console.log(`      - ${label.name} (${label.id})`);
      });
    });

    test("should handle duplicate label creation gracefully", async () => {
      const testLabelName = `E2E Duplicate ${Date.now()}`;
      createdTestLabels.push(testLabelName);

      // Create the label first time
      const firstLabel = await provider.createLabel(testLabelName);
      expect(firstLabel).toBeDefined();

      console.log("   📝 Created label first time:", testLabelName);

      // Try to create it again
      const secondLabel = await provider.createLabel(testLabelName);

      // Should return the existing label without error
      expect(secondLabel).toBeDefined();
      expect(secondLabel.id).toBe(firstLabel.id);
      expect(secondLabel.name).toBe(testLabelName);

      console.log(
        "   ✅ Duplicate creation handled gracefully - returned existing label",
      );
    });
  });

  describe("Label Application to Messages", () => {
    test("should apply label to a single message", async () => {
      const testLabelName = `E2E Apply ${Date.now()}`;
      createdTestLabels.push(testLabelName);

      // Create the label
      const label = await provider.createLabel(testLabelName);
      console.log("   📝 Created label:", label.name, `(${label.id})`);

      // Apply label to message
      await provider.labelMessage({
        messageId: TEST_OUTLOOK_MESSAGE_ID,
        labelId: label.id,
      });

      console.log("   ✅ Applied label to message:", TEST_OUTLOOK_MESSAGE_ID);

      // Verify by fetching the message
      const message = await provider.getMessage(TEST_OUTLOOK_MESSAGE_ID);

      expect(message.labelIds).toBeDefined();
      expect(message.labelIds).toContain(label.name);

      console.log("   ✅ Verified label is on message");
      console.log(`      Message labels: ${message.labelIds?.join(", ")}`);

      // Clean up - remove the label from the message (use the message's actual threadId)
      await provider.removeThreadLabel(message.threadId, label.id);
      console.log("   🧹 Cleaned up label from thread");
    });

    test("should apply multiple labels to a message", async () => {
      const testLabel1Name = `E2E Multi 1 ${Date.now()}`;
      const testLabel2Name = `E2E Multi 2 ${Date.now()}`;
      createdTestLabels.push(testLabel1Name, testLabel2Name);

      // Create two labels
      const label1 = await provider.createLabel(testLabel1Name);
      const label2 = await provider.createLabel(testLabel2Name);

      console.log("   📝 Created labels:");
      console.log(`      - ${label1.name} (${label1.id})`);
      console.log(`      - ${label2.name} (${label2.id})`);

      // Apply first label
      await provider.labelMessage({
        messageId: TEST_OUTLOOK_MESSAGE_ID,
        labelId: label1.id,
      });

      // Apply second label
      await provider.labelMessage({
        messageId: TEST_OUTLOOK_MESSAGE_ID,
        labelId: label2.id,
      });

      console.log("   ✅ Applied both labels to message");

      // Verify both labels are on the message
      const message = await provider.getMessage(TEST_OUTLOOK_MESSAGE_ID);

      expect(message.labelIds).toBeDefined();
      expect(message.labelIds).toContain(label1.name);
      expect(message.labelIds).toContain(label2.name);

      console.log("   ✅ Verified both labels are on message");
      console.log(`      Message labels: ${message.labelIds?.join(", ")}`);

      // Clean up - remove both labels (use the message's actual threadId)
      await provider.removeThreadLabel(message.threadId, label1.id);
      await provider.removeThreadLabel(message.threadId, label2.id);
      console.log("   🧹 Cleaned up both labels from thread");
    });

    test("should handle applying label to non-existent message", async () => {
      const testLabelName = `E2E Invalid ${Date.now()}`;
      createdTestLabels.push(testLabelName);

      const label = await provider.createLabel(testLabelName);
      const fakeMessageId = "FAKE_MESSAGE_ID_123";

      // Should throw an error
      await expect(
        provider.labelMessage({
          messageId: fakeMessageId,
          labelId: label.id,
        }),
      ).rejects.toThrow();

      console.log("   ✅ Correctly threw error for non-existent message");
    });
  });

  describe("Label Removal from Threads", () => {
    test("should remove label from all messages in a thread", async () => {
      const testLabelName = `E2E Remove ${Date.now()}`;
      createdTestLabels.push(testLabelName);

      // Create and apply label
      const label = await provider.createLabel(testLabelName);
      console.log(`   📝 Created label: ${label.name} (${label.id})`);

      // Apply label to message
      await provider.labelMessage({
        messageId: TEST_OUTLOOK_MESSAGE_ID,
        labelId: label.id,
      });
      console.log("   📝 Applied label to message");

      // Verify label is applied
      const messageBefore = await provider.getMessage(TEST_OUTLOOK_MESSAGE_ID);
      expect(messageBefore.labelIds).toContain(label.name);
      console.log("   ✅ Verified label is on message before removal");

      // Remove label from thread - use the message's actual conversationId
      await provider.removeThreadLabel(messageBefore.threadId, label.id);
      console.log("   ✅ Removed label from thread");

      // Verify label is removed
      const messageAfter = await provider.getMessage(TEST_OUTLOOK_MESSAGE_ID);
      expect(messageAfter.labelIds).not.toContain(label.name);
      console.log("   ✅ Verified label is removed from message");
    });

    test("should handle removing non-existent label from thread", async () => {
      const fakeLabel = "FAKE_LABEL_ID_123";

      // Should not throw error
      await expect(
        provider.removeThreadLabel(TEST_CONVERSATION_ID, fakeLabel),
      ).resolves.not.toThrow();

      console.log("   ✅ Handled removing non-existent label gracefully");
    });

    test("should handle removing label from thread with multiple messages", async () => {
      const testLabelName = `E2E Thread ${Date.now()}`;
      createdTestLabels.push(testLabelName);

      // Create label
      const label = await provider.createLabel(testLabelName);
      console.log(`   📝 Created label: ${label.name}`);

      // Get all messages in the thread
      const threadMessages =
        await provider.getThreadMessages(TEST_CONVERSATION_ID);
      console.log(`   📝 Thread has ${threadMessages.length} message(s)`);

      if (threadMessages.length === 0) {
        console.log("   ⚠️  No messages in thread, skipping test");
        return;
      }

      // Apply label to first message
      await provider.labelMessage({
        messageId: threadMessages[0].id,
        labelId: label.id,
      });
      console.log("   📝 Applied label to first message in thread");

      // Remove label from entire thread
      await provider.removeThreadLabel(TEST_CONVERSATION_ID, label.id);
      console.log("   ✅ Removed label from thread");

      // Verify all messages in thread don't have the label
      for (const msg of threadMessages) {
        const message = await provider.getMessage(msg.id);
        expect(message.labelIds).not.toContain(label.name);
      }

      console.log(
        `   ✅ Verified label removed from all ${threadMessages.length} message(s)`,
      );
    });

    test("should handle empty label ID gracefully", async () => {
      await expect(
        provider.removeThreadLabel(TEST_CONVERSATION_ID, ""),
      ).resolves.not.toThrow();

      console.log("   ✅ Handled empty label ID gracefully");
    });
  });

  describe("Complete Label Lifecycle", () => {
    test("should complete full label lifecycle: create, apply, verify, remove, verify", async () => {
      const testLabelName = `E2E Lifecycle ${Date.now()}`;
      createdTestLabels.push(testLabelName);

      console.log(`\n   🔄 Starting full lifecycle test for: ${testLabelName}`);

      // Step 1: Create label
      console.log("   📝 Step 1: Creating label...");
      const label = await provider.createLabel(testLabelName);
      expect(label).toBeDefined();
      expect(label.id).toBeDefined();
      console.log(`      ✅ Label created: ${label.id}`);

      // Step 2: Verify label exists in list
      console.log("   📝 Step 2: Verifying label in list...");
      const labels = await provider.getLabels();
      const foundInList = labels.find((l) => l.id === label.id);
      expect(foundInList).toBeDefined();
      console.log("      ✅ Label found in list");

      // Step 3: Apply label to message
      console.log("   📝 Step 3: Applying label to message...");
      await provider.labelMessage({
        messageId: TEST_OUTLOOK_MESSAGE_ID,
        labelId: label.id,
      });
      console.log("      ✅ Label applied");

      // Step 4: Verify label on message
      console.log("   📝 Step 4: Verifying label on message...");
      const messageWithLabel = await provider.getMessage(
        TEST_OUTLOOK_MESSAGE_ID,
      );
      expect(messageWithLabel.labelIds).toContain(label.name);
      console.log(
        `      ✅ Label verified on message (${messageWithLabel.labelIds?.length} total labels)`,
      );

      // Step 5: Remove label from thread (use the message's actual threadId)
      console.log("   📝 Step 5: Removing label from thread...");
      await provider.removeThreadLabel(messageWithLabel.threadId, label.id);
      console.log("      ✅ Label removed");

      // Step 6: Verify label no longer on message
      console.log("   📝 Step 6: Verifying label removed from message...");
      const messageWithoutLabel = await provider.getMessage(
        TEST_OUTLOOK_MESSAGE_ID,
      );
      expect(messageWithoutLabel.labelIds).not.toContain(label.name);
      console.log("      ✅ Label confirmed removed from message");

      console.log("\n   ✅ Full lifecycle test completed successfully!");
    });
  });

  describe("Label State Consistency", () => {
    test("should maintain label state across multiple operations", async () => {
      const label1Name = `E2E State 1 ${Date.now()}`;
      const label2Name = `E2E State 2 ${Date.now()}`;
      createdTestLabels.push(label1Name, label2Name);

      // Create two labels
      const label1 = await provider.createLabel(label1Name);
      const label2 = await provider.createLabel(label2Name);

      console.log("   📝 Created two labels");

      // Apply label1
      await provider.labelMessage({
        messageId: TEST_OUTLOOK_MESSAGE_ID,
        labelId: label1.id,
      });

      // Verify only label1 is present
      let message = await provider.getMessage(TEST_OUTLOOK_MESSAGE_ID);
      expect(message.labelIds).toContain(label1.name);
      expect(message.labelIds).not.toContain(label2.name);
      console.log("   ✅ State check 1: Only label1 present");

      // Apply label2
      await provider.labelMessage({
        messageId: TEST_OUTLOOK_MESSAGE_ID,
        labelId: label2.id,
      });

      // Verify both labels are present
      message = await provider.getMessage(TEST_OUTLOOK_MESSAGE_ID);
      expect(message.labelIds).toContain(label1.name);
      expect(message.labelIds).toContain(label2.name);
      console.log("   ✅ State check 2: Both labels present");

      // Remove label1 (use the message's actual threadId)
      await provider.removeThreadLabel(message.threadId, label1.id);

      // Verify only label2 is present
      message = await provider.getMessage(TEST_OUTLOOK_MESSAGE_ID);
      expect(message.labelIds).not.toContain(label1.name);
      expect(message.labelIds).toContain(label2.name);
      console.log("   ✅ State check 3: Only label2 present");

      // Remove label2 (use the message's actual threadId)
      await provider.removeThreadLabel(message.threadId, label2.id);

      // Verify neither label is present
      message = await provider.getMessage(TEST_OUTLOOK_MESSAGE_ID);
      expect(message.labelIds).not.toContain(label1.name);
      expect(message.labelIds).not.toContain(label2.name);
      console.log("   ✅ State check 4: No test labels present");

      console.log("   ✅ Label state consistency maintained!");
    });
  });
});
