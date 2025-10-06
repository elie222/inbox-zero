/**
 * Manual integration tests for Outlook operations
 *
 * Setup:
 * 1. Set TEST_OUTLOOK_EMAIL env var to your Outlook email
 * 2. Set TEST_CONVERSATION_ID with a real conversationId from your logs (optional)
 * 3. Set TEST_CATEGORY_NAME for category/label testing (optional, defaults to "To Reply")
 *
 * Usage:
 *   TEST_OUTLOOK_EMAIL=your@email.com pnpm test outlook-operations
 *   TEST_OUTLOOK_EMAIL=your@email.com TEST_CONVERSATION_ID=AAMk... pnpm test outlook-operations
 *   pnpm test outlook-operations -t "getThread"  # Run specific test
 */

import { describe, test, expect, beforeAll, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { OutlookProvider } from "@/utils/email/microsoft";

// ============================================
// TEST DATA - SET VIA ENVIRONMENT VARIABLES
// ============================================
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;
const TEST_CONVERSATION_ID =
  process.env.TEST_CONVERSATION_ID ||
  "AQQkADAwATNiZmYAZS05YWEAYy1iNWY0LTAwAi0wMAoAEABuo-fmt9KvQ4u55KlWB32H"; // Real conversation ID from demoinboxzero@outlook.com
const TEST_CATEGORY_NAME = process.env.TEST_CATEGORY_NAME || "To Reply";

vi.mock("server-only", () => ({}));

describe.skipIf(!TEST_OUTLOOK_EMAIL)(
  "Outlook Operations Integration Tests",
  () => {
    let provider: OutlookProvider;

    beforeAll(async () => {
      const testEmail = TEST_OUTLOOK_EMAIL;

      if (!testEmail) {
        console.warn("\n⚠️  Set TEST_OUTLOOK_EMAIL env var to run these tests");
        console.warn(
          "   Example: TEST_OUTLOOK_EMAIL=your@email.com pnpm test outlook-operations\n",
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
      console.log(`   Test conversation ID: ${TEST_CONVERSATION_ID}\n`);
    });

    describe("getThread", () => {
      test("should fetch messages by conversationId", async () => {
        const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);

        expect(messages).toBeDefined();
        expect(Array.isArray(messages)).toBe(true);

        if (messages.length > 0) {
          console.log(`   ✅ Got ${messages.length} messages`);
          console.log(
            `   First message: ${messages[0].subject || "(no subject)"}`,
          );
          expect(messages[0]).toHaveProperty("id");
          expect(messages[0]).toHaveProperty("subject");
        } else {
          console.log(
            "   ℹ️  No messages found (may be expected if conversationId is old)",
          );
        }
      });

      test("should handle conversationId with special characters", async () => {
        // Conversation IDs can contain base64-like characters including -, _, and sometimes =
        // Test that these don't cause URL encoding issues
        const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);

        expect(messages).toBeDefined();
        expect(Array.isArray(messages)).toBe(true);
        console.log(
          `   ✅ Handled conversationId with special characters (${TEST_CONVERSATION_ID.slice(0, 20)}...)`,
        );
      });
    });

    describe("removeThreadLabel", () => {
      test("should add and remove category from thread messages", async () => {
        // Get or create the category
        let label = await provider.getLabelByName(TEST_CATEGORY_NAME);

        if (!label) {
          console.log(
            `   📝 Category "${TEST_CATEGORY_NAME}" doesn't exist, creating it`,
          );
          label = await provider.createLabel(TEST_CATEGORY_NAME);
        }

        console.log(`   📝 Using category: ${label.name} (ID: ${label.id})`);

        // Get the thread messages
        const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);
        if (messages.length === 0) {
          console.log("   ⚠️  No messages in thread, skipping test");
          return;
        }

        const firstMessage = messages[0];

        // Add the category to the message
        await provider.labelMessage({
          messageId: firstMessage.id,
          labelId: label.id,
        });
        console.log("   ✅ Added category to message");

        // Now remove the category from the thread
        await provider.removeThreadLabel(TEST_CONVERSATION_ID, label.id);
        console.log("   ✅ Removed category from thread");
      });

      test("should handle empty category name gracefully", async () => {
        await expect(
          provider.removeThreadLabel(TEST_CONVERSATION_ID, ""),
        ).resolves.not.toThrow();

        console.log("   ✅ Handled empty category name");
      });
    });

    describe("Label operations", () => {
      test("should list all categories", async () => {
        const labels = await provider.getLabels();

        expect(labels).toBeDefined();
        expect(Array.isArray(labels)).toBe(true);
        expect(labels.length).toBeGreaterThan(0);

        console.log(`   ✅ Found ${labels.length} categories`);
        labels.slice(0, 3).forEach((label) => {
          console.log(`      - ${label.name}`);
        });
      });

      test("should create a new label", async () => {
        const testLabelName = `Test Label ${Date.now()}`;
        const newLabel = await provider.createLabel(testLabelName);

        expect(newLabel).toBeDefined();
        expect(newLabel.id).toBeDefined();
        expect(newLabel.name).toBe(testLabelName);

        console.log(`   ✅ Created label: ${testLabelName}`);
        console.log(`      ID: ${newLabel.id}`);
        console.log("      (You may want to delete this test label manually)");
      });

      test("should get label by name", async () => {
        const label = await provider.getLabelByName(TEST_CATEGORY_NAME);

        if (label) {
          expect(label).toBeDefined();
          expect(label.name).toBe(TEST_CATEGORY_NAME);
          expect(label.id).toBeDefined();
          console.log(`   ✅ Found label: ${label.name} (ID: ${label.id})`);
        } else {
          console.log(`   ℹ️  Label "${TEST_CATEGORY_NAME}" not found`);
        }
      });
    });

    describe("Thread messages", () => {
      test("should get thread messages", async () => {
        const messages = await provider.getThreadMessages(TEST_CONVERSATION_ID);

        expect(messages).toBeDefined();
        expect(Array.isArray(messages)).toBe(true);

        if (messages.length > 0) {
          console.log(`   ✅ Got ${messages.length} messages`);
          expect(messages[0]).toHaveProperty("threadId");
          expect(messages[0].threadId).toBe(TEST_CONVERSATION_ID);
        }
      });
    });

    describe("Search queries", () => {
      test("should handle search queries with colons", async () => {
        // Known issue: Outlook search doesn't support "field:" syntax like Gmail
        // The query "subject:lunch tomorrow?" causes:
        // "Syntax error: character ':' is not valid at position 7"
        // Instead, Outlook uses KQL syntax or plain text search

        const invalidQuery = "subject:lunch tomorrow?";
        const validQuery = "lunch tomorrow"; // Plain text search

        // Test that invalid query throws an error
        await expect(
          provider.getMessagesWithPagination({
            query: invalidQuery,
            maxResults: 10,
          }),
        ).rejects.toThrow();

        // Test that valid query works
        const result = await provider.getMessagesWithPagination({
          query: validQuery,
          maxResults: 10,
        });
        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ Plain text search returned ${result.messages.length} messages`,
        );
      });

      test("should handle special characters in search queries", async () => {
        // Test various special characters
        // Note: Outlook KQL has restrictions - some chars like ? and : cause syntax errors
        const validQueries = [
          "lunch tomorrow", // Plain text (should work)
          "test example", // Multiple words (should work)
        ];

        const invalidQueries = [
          "meeting?", // Question mark causes syntax error
          "test:query", // Colon causes syntax error
        ];

        // Test valid queries
        for (const query of validQueries) {
          const result = await provider.getMessagesWithPagination({
            query,
            maxResults: 5,
          });
          expect(result.messages).toBeDefined();
          expect(Array.isArray(result.messages)).toBe(true);
          console.log(
            `   ✅ Query "${query}" returned ${result.messages.length} messages`,
          );
        }

        // Test that invalid queries throw errors
        for (const query of invalidQueries) {
          await expect(
            provider.getMessagesWithPagination({
              query,
              maxResults: 5,
            }),
          ).rejects.toThrow();
          console.log(`   ✅ Query "${query}" correctly threw an error`);
        }
      });
    });
  },
);
