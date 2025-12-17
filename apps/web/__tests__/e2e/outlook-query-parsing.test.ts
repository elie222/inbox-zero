/**
 * E2E tests for Outlook Gmail-style query handling
 *
 * Tests that Gmail-style queries (subject:, from:, to:) are handled correctly
 * by stripping prefixes and using plain text search with Microsoft Graph.
 *
 * Usage:
 * pnpm test-e2e outlook-query-parsing
 *
 * Required env vars:
 * - RUN_E2E_TESTS=true
 * - TEST_OUTLOOK_EMAIL=<your outlook email>
 */

import { describe, test, expect, beforeAll, vi } from "vitest";
import { subMonths } from "date-fns/subMonths";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";

const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS)(
  "Outlook Query Parsing E2E",
  { timeout: 15_000 },
  () => {
    let provider: EmailProvider;

    beforeAll(async () => {
      if (!TEST_OUTLOOK_EMAIL) {
        console.warn("\n⚠️  Set TEST_OUTLOOK_EMAIL env var to run these tests");
        return;
      }

      const emailAccount = await prisma.emailAccount.findFirst({
        where: {
          email: TEST_OUTLOOK_EMAIL,
          account: {
            provider: "microsoft",
          },
        },
        include: {
          account: true,
        },
      });

      if (!emailAccount) {
        throw new Error(`No Outlook account found for ${TEST_OUTLOOK_EMAIL}`);
      }

      provider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: "microsoft",
      });

      console.log(`\n✅ Using account: ${emailAccount.email}\n`);
    });

    describe("getMessagesWithPagination handles Gmail-style queries", () => {
      test("should handle subject: prefix by stripping and searching", async () => {
        // subject:test gets stripped to just "test" for $search
        const result = await provider.getMessagesWithPagination({
          query: "subject:test",
          maxResults: 5,
        });

        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ subject:test returned ${result.messages.length} messages`,
        );
      });

      test('should handle subject:"quoted term" by stripping prefix', async () => {
        // subject:"meeting" gets stripped to just "meeting"
        const result = await provider.getMessagesWithPagination({
          query: 'subject:"meeting"',
          maxResults: 5,
        });

        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ subject:"meeting" returned ${result.messages.length} messages`,
        );
      });

      test("should handle from: prefix by stripping and searching", async () => {
        // from:email gets stripped to just the email for $search
        const result = await provider.getMessagesWithPagination({
          query: `from:${TEST_OUTLOOK_EMAIL}`,
          maxResults: 5,
        });

        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ from:${TEST_OUTLOOK_EMAIL} returned ${result.messages.length} messages`,
        );
      });

      test("should handle plain text query directly", async () => {
        const result = await provider.getMessagesWithPagination({
          query: "order status",
          maxResults: 5,
        });

        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ Plain "order status" returned ${result.messages.length} messages`,
        );
      });

      test("should handle OR queries", async () => {
        const result = await provider.getMessagesWithPagination({
          query: '"order" OR "shipment"',
          maxResults: 5,
        });

        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ OR query returned ${result.messages.length} messages`,
        );
      });

      test("should strip label: prefix", async () => {
        // label:inbox gets stripped, leaving just "meeting"
        const result = await provider.getMessagesWithPagination({
          query: "label:inbox meeting",
          maxResults: 5,
        });

        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ label:inbox meeting returned ${result.messages.length} messages`,
        );
      });

      test("should handle query with date filters", async () => {
        const oneMonthAgo = subMonths(new Date(), 1);

        const result = await provider.getMessagesWithPagination({
          query: "test",
          maxResults: 5,
          after: oneMonthAgo,
        });

        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ Query with date filter returned ${result.messages.length} messages`,
        );
      });

      test("should handle empty query", async () => {
        const result = await provider.getMessagesWithPagination({
          maxResults: 5,
        });

        expect(result.messages).toBeDefined();
        expect(Array.isArray(result.messages)).toBe(true);
        console.log(
          `   ✅ Empty query returned ${result.messages.length} messages`,
        );
      });
    });
  },
);
