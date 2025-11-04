/**
 * E2E tests for Google Gmail labeling operations
 *
 * Usage:
 * pnpm test-e2e google-labeling
 * pnpm test-e2e google-labeling -t "should apply and remove label"  # Run specific test
 *
 * Setup:
 * 1. Set TEST_GMAIL_EMAIL env var to your Gmail email
 * 2. Set getTestMessageId() with a real messageId from your logs
 * 3. Set getTestThreadId() with a real threadId from your logs
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
import type { GmailProvider } from "@/utils/email/google";

// ============================================
// TEST DATA - SET VIA ENVIRONMENT VARIABLES
// ============================================
const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_GMAIL_EMAIL = process.env.TEST_GMAIL_EMAIL;
let _TEST_GMAIL_THREAD_ID = process.env.TEST_GMAIL_THREAD_ID;
let _TEST_GMAIL_MESSAGE_ID = process.env.TEST_GMAIL_MESSAGE_ID;

vi.mock("server-only", () => ({}));

// Helper to ensure test IDs are available
function getTestMessageId(): string {
  if (!_TEST_GMAIL_MESSAGE_ID) {
    throw new Error("Test message ID not available");
  }
  return _TEST_GMAIL_MESSAGE_ID;
}

function getTestThreadId(): string {
  if (!_TEST_GMAIL_THREAD_ID) {
    throw new Error("Test thread ID not available");
  }
  return _TEST_GMAIL_THREAD_ID;
}

describe.skipIf(!RUN_E2E_TESTS)("Google Gmail Labeling E2E Tests", () => {
  let provider: GmailProvider;
  const createdTestLabels: string[] = []; // Track labels to clean up

  beforeAll(async () => {
    const testEmail = TEST_GMAIL_EMAIL;

    if (!testEmail) {
      console.warn("\n⚠️  Set TEST_GMAIL_EMAIL env var to run these tests");
      console.warn(
        "   Example: TEST_GMAIL_EMAIL=your@gmail.com pnpm test-e2e google-labeling\n",
      );
      return;
    }

    // Load account from DB
    const emailAccount = await prisma.emailAccount.findFirst({
      where: {
        email: testEmail,
        account: {
          provider: "google",
        },
      },
      include: {
        account: true,
      },
    });

    if (!emailAccount) {
      throw new Error(`No Gmail account found for ${testEmail}`);
    }

    provider = (await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: "google",
    })) as GmailProvider;

    // If message ID not provided, fetch a real message from the account
    if (!_TEST_GMAIL_MESSAGE_ID || !_TEST_GMAIL_THREAD_ID) {
      console.log("   📝 Fetching a real message from account for testing...");

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const { messages } = await provider.getMessagesByFields({
        maxResults: 1,
        after: oneWeekAgo,
        type: "all",
      });

      if (messages.length === 0) {
        throw new Error(
          "No messages found in account. Please ensure the test account has at least one message from the past week.",
        );
      }

      _TEST_GMAIL_MESSAGE_ID = messages[0].id;
      _TEST_GMAIL_THREAD_ID = messages[0].threadId;

      console.log(`   ✅ Using message from account: ${getTestMessageId()}`);
      console.log(`   ✅ Using thread from account: ${getTestThreadId()}`);
    }

    console.log(`\n✅ Using account: ${emailAccount.email}`);
    console.log(`   Account ID: ${emailAccount.id}`);
    console.log(`   Test thread ID: ${getTestThreadId()}`);
    console.log(`   Test message ID: ${getTestMessageId()}\n`);
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

      console.log("   ✅ Retrieved", labels.length, "labels");
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

      // Try to create it again - should return existing label (handled in createLabel)
      const secondLabel = await provider.createLabel(testLabelName);
      expect(secondLabel.id).toBe(firstLabel.id);

      console.log(
        "   ✅ Duplicate creation returned existing label (handled gracefully)",
      );
    });

    test("should create nested labels with parent/child hierarchy", async () => {
      const parentName = `E2E Parent ${Date.now()}`;
      const nestedLabelName = `${parentName}/Child`;
      createdTestLabels.push(parentName, nestedLabelName);

      console.log(`   📝 Creating nested label: ${nestedLabelName}`);

      // Create nested label directly (should handle parent creation internally)
      const nestedLabel = await provider.createLabel(nestedLabelName);

      expect(nestedLabel).toBeDefined();
      expect(nestedLabel.id).toBeDefined();
      expect(nestedLabel.name).toBe(nestedLabelName);

      console.log("   ✅ Created nested label:", nestedLabel.name);
      console.log("      ID:", nestedLabel.id);

      // Verify parent label was also created
      const parentLabel = await provider.getLabelByName(parentName);
      expect(parentLabel).toBeDefined();
      expect(parentLabel?.name).toBe(parentName);

      console.log("   ✅ Parent label also exists:", parentLabel?.name);

      // Verify we can retrieve the nested label by name
      const retrievedNested = await provider.getLabelByName(nestedLabelName);
      expect(retrievedNested).toBeDefined();
      expect(retrievedNested?.id).toBe(nestedLabel.id);
      expect(retrievedNested?.name).toBe(nestedLabelName);

      console.log(
        "   ✅ Retrieved nested label by full name:",
        retrievedNested?.name,
      );
    });

    test("should create deeply nested labels", async () => {
      const level1 = `E2E Deep ${Date.now()}`;
      const level2 = `${level1}/Level2`;
      const level3 = `${level2}/Level3`;
      createdTestLabels.push(level1, level2, level3);

      console.log(`   📝 Creating deeply nested label: ${level3}`);

      // Create the deeply nested label
      const deepLabel = await provider.createLabel(level3);

      expect(deepLabel).toBeDefined();
      expect(deepLabel.name).toBe(level3);

      console.log("   ✅ Created deeply nested label:", deepLabel.name);

      // Verify all parent levels were created
      const parent1 = await provider.getLabelByName(level1);
      const parent2 = await provider.getLabelByName(level2);

      expect(parent1).toBeDefined();
      expect(parent2).toBeDefined();

      console.log("   ✅ All parent levels created:");
      console.log(`      - ${level1}`);
      console.log(`      - ${level2}`);
      console.log(`      - ${level3}`);
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
        messageId: getTestMessageId(),
        labelId: label.id,
        labelName: null,
      });

      console.log("   ✅ Applied label to message:", getTestMessageId());

      // Verify by fetching the message
      const message = await provider.getMessage(getTestMessageId());

      expect(message.labelIds).toBeDefined();
      expect(message.labelIds).toContain(label.id);

      console.log("   ✅ Verified label is on message");
      console.log("      Message labels:", message.labelIds?.join(", "));

      // Clean up - remove the label from the message
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
      console.log("      -", label1.name, `(${label1.id})`);
      console.log("      -", label2.name, `(${label2.id})`);

      // Apply first label
      await provider.labelMessage({
        messageId: getTestMessageId(),
        labelId: label1.id,
        labelName: null,
      });

      // Apply second label
      await provider.labelMessage({
        messageId: getTestMessageId(),
        labelId: label2.id,
        labelName: null,
      });

      console.log("   ✅ Applied both labels to message");

      // Verify both labels are on the message
      const message = await provider.getMessage(getTestMessageId());

      expect(message.labelIds).toBeDefined();
      expect(message.labelIds).toContain(label1.id);
      expect(message.labelIds).toContain(label2.id);

      console.log("   ✅ Verified both labels are on message");
      console.log("      Message labels:", message.labelIds?.join(", "));

      // Clean up - remove both labels
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
          labelName: null,
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
        messageId: getTestMessageId(),
        labelId: label.id,
        labelName: null,
      });
      console.log("   📝 Applied label to message");

      // Verify label is applied
      const messageBefore = await provider.getMessage(getTestMessageId());
      expect(messageBefore.labelIds).toContain(label.id);
      console.log("   ✅ Verified label is on message before removal");

      // Remove label from thread
      await provider.removeThreadLabel(messageBefore.threadId, label.id);
      console.log("   ✅ Removed label from thread");

      // Verify label is removed
      const messageAfter = await provider.getMessage(getTestMessageId());
      expect(messageAfter.labelIds).not.toContain(label.id);
      console.log("   ✅ Verified label is removed from message");
    });

    test("should handle removing non-existent label from thread", async () => {
      const fakeLabel = "FAKE_LABEL_ID_123";

      // Should not throw error
      await expect(
        provider.removeThreadLabel(getTestThreadId(), fakeLabel),
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
      const threadMessages = await provider.getThreadMessages(
        getTestThreadId(),
      );
      console.log(`   📝 Thread has ${threadMessages.length} message(s)`);

      if (threadMessages.length === 0) {
        console.log("   ⚠️  No messages in thread, skipping test");
        return;
      }

      // Apply label to first message
      await provider.labelMessage({
        messageId: threadMessages[0].id,
        labelId: label.id,
        labelName: null,
      });
      console.log("   📝 Applied label to first message in thread");

      // Remove label from entire thread
      await provider.removeThreadLabel(getTestThreadId(), label.id);
      console.log("   ✅ Removed label from thread");

      // Verify all messages in thread don't have the label
      for (const msg of threadMessages) {
        const message = await provider.getMessage(msg.id);
        expect(message.labelIds).not.toContain(label.id);
      }

      console.log(
        `   ✅ Verified label removed from all ${threadMessages.length} message(s)`,
      );
    });

    test("should handle empty label ID gracefully", async () => {
      await expect(
        provider.removeThreadLabel(getTestThreadId(), ""),
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
      console.log("      ✅ Label created:", label.id);

      // Step 2: Verify label exists in list
      console.log("   📝 Step 2: Verifying label in list...");
      const labels = await provider.getLabels();
      const foundInList = labels.find((l) => l.id === label.id);
      expect(foundInList).toBeDefined();
      console.log("      ✅ Label found in list");

      // Step 3: Apply label to message
      console.log("   📝 Step 3: Applying label to message...");
      await provider.labelMessage({
        messageId: getTestMessageId(),
        labelId: label.id,
        labelName: null,
      });
      console.log("      ✅ Label applied");

      // Step 4: Verify label on message
      console.log("   📝 Step 4: Verifying label on message...");
      const messageWithLabel = await provider.getMessage(getTestMessageId());
      expect(messageWithLabel.labelIds).toContain(label.id);
      console.log(
        `      ✅ Label verified on message (${messageWithLabel.labelIds?.length} total labels)`,
      );

      // Step 5: Remove label from thread
      console.log("   📝 Step 5: Removing label from thread...");
      await provider.removeThreadLabel(messageWithLabel.threadId, label.id);
      console.log("      ✅ Label removed");

      // Step 6: Verify label no longer on message
      console.log("   📝 Step 6: Verifying label removed from message...");
      const messageWithoutLabel = await provider.getMessage(getTestMessageId());
      expect(messageWithoutLabel.labelIds).not.toContain(label.id);
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
        messageId: getTestMessageId(),
        labelId: label1.id,
        labelName: null,
      });

      // Verify only label1 is present
      let message = await provider.getMessage(getTestMessageId());
      expect(message.labelIds).toContain(label1.id);
      expect(message.labelIds).not.toContain(label2.id);
      console.log("   ✅ State check 1: Only label1 present");

      // Apply label2
      await provider.labelMessage({
        messageId: getTestMessageId(),
        labelId: label2.id,
        labelName: null,
      });

      // Verify both labels are present
      message = await provider.getMessage(getTestMessageId());
      expect(message.labelIds).toContain(label1.id);
      expect(message.labelIds).toContain(label2.id);
      console.log("   ✅ State check 2: Both labels present");

      // Remove label1
      await provider.removeThreadLabel(message.threadId, label1.id);

      // Verify only label2 is present
      message = await provider.getMessage(getTestMessageId());
      expect(message.labelIds).not.toContain(label1.id);
      expect(message.labelIds).toContain(label2.id);
      console.log("   ✅ State check 3: Only label2 present");

      // Remove label2
      await provider.removeThreadLabel(message.threadId, label2.id);

      // Verify neither label is present
      message = await provider.getMessage(getTestMessageId());
      expect(message.labelIds).not.toContain(label1.id);
      expect(message.labelIds).not.toContain(label2.id);
      console.log("   ✅ State check 4: No test labels present");

      console.log("   ✅ Label state consistency maintained!");
    });
  });
});
