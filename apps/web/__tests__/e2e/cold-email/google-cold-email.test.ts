/**
 * E2E tests for cold email detection - Google (Gmail)
 *
 * Tests hasPreviousCommunicationsWithSenderOrDomain which determines if
 * we've communicated with a sender before (used to skip AI checks for known contacts).
 *
 * Usage:
 * pnpm test-e2e cold-email/google
 *
 * Required env vars:
 * - RUN_E2E_TESTS=true
 * - TEST_GMAIL_EMAIL=<your gmail email>
 */

import { describe, test, expect, beforeAll, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { extractEmailAddress, extractDomainFromEmail } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";

const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_GMAIL_EMAIL = process.env.TEST_GMAIL_EMAIL;

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS || !TEST_GMAIL_EMAIL)(
  "Cold Email Detection - Google",
  { timeout: 30_000 },
  () => {
    let provider: EmailProvider;
    let userEmail: string;
    let realMessages: ParsedMessage[];
    let knownSenderEmail: string;
    let companyDomain: string | undefined;

    beforeAll(async () => {
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

      provider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: "google",
      });

      userEmail = emailAccount.email;

      const { messages } = await provider.getMessagesWithPagination({
        maxResults: 20,
      });
      realMessages = messages;

      // Find an external sender
      const externalMessage = realMessages.find((m) => {
        const from = extractEmailAddress(m.headers.from);
        return from && from.toLowerCase() !== userEmail.toLowerCase();
      });

      if (!externalMessage) {
        throw new Error("No external sender found in inbox - cannot run tests");
      }

      knownSenderEmail =
        extractEmailAddress(externalMessage.headers.from) ||
        externalMessage.headers.from;

      // Find a company domain sender
      const publicDomains = [
        "gmail.com",
        "yahoo.com",
        "hotmail.com",
        "outlook.com",
        "icloud.com",
      ];
      const companyMessage = realMessages.find((m) => {
        const from = extractEmailAddress(m.headers.from);
        if (!from) return false;
        const domain = extractDomainFromEmail(from);
        return domain && !publicDomains.includes(domain.toLowerCase());
      });

      if (companyMessage) {
        const senderEmail = extractEmailAddress(companyMessage.headers.from)!;
        companyDomain = extractDomainFromEmail(senderEmail) || undefined;
      }
    }, 30_000);

    describe("hasPreviousCommunicationsWithSenderOrDomain", () => {
      test("returns TRUE for a sender we have received email from", async () => {
        const result =
          await provider.hasPreviousCommunicationsWithSenderOrDomain({
            from: knownSenderEmail,
            date: new Date(),
            messageId: "fake-new-message-id",
          });

        expect(result).toBe(true);
      });

      test("returns FALSE for random unknown sender", async () => {
        const randomEmail = `unknown-${Date.now()}@random-domain-xyz-${Date.now()}.com`;

        const result =
          await provider.hasPreviousCommunicationsWithSenderOrDomain({
            from: randomEmail,
            date: new Date(),
            messageId: "fake-message-id",
          });

        expect(result).toBe(false);
      });

      test("returns FALSE when checking before any emails existed", async () => {
        const veryOldDate = new Date("2000-01-01");

        const result =
          await provider.hasPreviousCommunicationsWithSenderOrDomain({
            from: knownSenderEmail,
            date: veryOldDate,
            messageId: "fake-message-id",
          });

        expect(result).toBe(false);
      });

      test("returns TRUE for colleague at same company domain", async ({
        skip,
      }) => {
        if (!companyDomain) {
          skip();
          return;
        }

        const fakeColleague = `different-person-${Date.now()}@${companyDomain}`;

        const result =
          await provider.hasPreviousCommunicationsWithSenderOrDomain({
            from: fakeColleague,
            date: new Date(),
            messageId: "fake-message-id",
          });

        expect(result).toBe(true);
      });
    });
  },
);
