/**
 * E2E tests for cold email detection - Microsoft (Outlook)
 *
 * Tests hasPreviousCommunicationsWithSenderOrDomain which determines if
 * we've communicated with a sender before (used to skip AI checks for known contacts).
 *
 * Usage:
 * pnpm test-e2e cold-email/microsoft
 *
 * Required env vars:
 * - RUN_E2E_TESTS=true
 * - TEST_OUTLOOK_EMAIL=<your outlook email>
 */

import { describe, test, expect, beforeAll, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { extractEmailAddress, extractDomainFromEmail } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";

const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;

vi.mock("server-only", () => ({}));

const PUBLIC_DOMAINS = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "live.com",
  "msn.com",
  "aol.com",
];

describe.skipIf(!RUN_E2E_TESTS || !TEST_OUTLOOK_EMAIL)(
  "Cold Email Detection - Microsoft",
  { timeout: 60_000 },
  () => {
    let provider: EmailProvider;
    let userEmail: string;
    let realMessages: ParsedMessage[];
    let sentMessages: ParsedMessage[];
    let knownSenderEmail: string;
    let companyDomain: string | undefined;
    let companySenderEmail: string | undefined;
    let sentToEmail: string | undefined;
    let sentToCompanyDomain: string | undefined;

    beforeAll(async () => {
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

      provider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: "microsoft",
      });

      userEmail = emailAccount.email;

      // Fetch received and sent messages
      const [receivedResult, sentResult] = await Promise.all([
        provider.getMessagesWithPagination({ maxResults: 30 }),
        provider.getSentMessages(20),
      ]);
      realMessages = receivedResult.messages;
      sentMessages = sentResult;

      // Find an external sender (received email)
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

      // Find a company domain sender (non-public domain) from received emails
      const companyMessage = realMessages.find((m) => {
        const from = extractEmailAddress(m.headers.from);
        if (!from) return false;
        const domain = extractDomainFromEmail(from);
        return domain && !PUBLIC_DOMAINS.includes(domain.toLowerCase());
      });

      if (companyMessage) {
        companySenderEmail =
          extractEmailAddress(companyMessage.headers.from) || undefined;
        companyDomain = companySenderEmail
          ? extractDomainFromEmail(companySenderEmail)
          : undefined;
      }

      // Find a sent email recipient for sent detection tests
      const sentMessage = sentMessages.find((m) => {
        const to = extractEmailAddress(m.headers.to);
        return to && to.toLowerCase() !== userEmail.toLowerCase();
      });

      if (sentMessage) {
        sentToEmail = extractEmailAddress(sentMessage.headers.to) || undefined;
        // Check if sent to a company domain
        if (sentToEmail) {
          const domain = extractDomainFromEmail(sentToEmail);
          if (domain && !PUBLIC_DOMAINS.includes(domain.toLowerCase())) {
            sentToCompanyDomain = domain;
          }
        }
      }

      // Log test data availability for debugging
      console.log("Test data summary:", {
        knownSenderEmail,
        companyDomain,
        companySenderEmail,
        sentToEmail,
        sentToCompanyDomain,
        receivedCount: realMessages.length,
        sentCount: sentMessages.length,
      });
    }, 60_000);

    describe("hasPreviousCommunicationsWithSenderOrDomain", () => {
      describe("received email detection", () => {
        test("returns TRUE for a sender we have received email from", async () => {
          const result =
            await provider.hasPreviousCommunicationsWithSenderOrDomain({
              from: knownSenderEmail,
              date: new Date(),
              messageId: "fake-new-message-id",
            });

          expect(result).toBe(true);
        });

        test("returns FALSE for random unknown sender at public domain", async () => {
          const randomEmail = `unknown-${Date.now()}@gmail.com`;

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
      });

      describe("domain-based detection (company domains)", () => {
        test("returns TRUE for exact sender at company domain we received from", async ({
          skip,
        }) => {
          if (!companySenderEmail || !companyDomain) {
            console.warn(
              "SKIPPED: No company domain emails found. Ensure inbox has emails from non-public domains.",
            );
            skip();
            return;
          }

          const result =
            await provider.hasPreviousCommunicationsWithSenderOrDomain({
              from: companySenderEmail,
              date: new Date(),
              messageId: "fake-message-id",
            });

          expect(result).toBe(true);
        });

        test("returns TRUE for fake colleague at same company domain (domain-based search)", async ({
          skip,
        }) => {
          if (!companyDomain) {
            console.warn(
              "SKIPPED: No company domain found. Ensure inbox has emails from non-public domains.",
            );
            skip();
            return;
          }

          // We've never received email from this person, but we have from their domain
          const fakeColleague = `different-person-${Date.now()}@${companyDomain}`;

          const result =
            await provider.hasPreviousCommunicationsWithSenderOrDomain({
              from: fakeColleague,
              date: new Date(),
              messageId: "fake-message-id",
            });

          expect(result).toBe(true);
        });

        test("returns FALSE for unknown company domain", async () => {
          const unknownCompanyEmail = `someone@unknown-company-${Date.now()}.io`;

          const result =
            await provider.hasPreviousCommunicationsWithSenderOrDomain({
              from: unknownCompanyEmail,
              date: new Date(),
              messageId: "fake-message-id",
            });

          expect(result).toBe(false);
        });

        test("returns FALSE for company domain when date is before communications", async ({
          skip,
        }) => {
          if (!companyDomain) {
            skip();
            return;
          }

          const fakeColleague = `someone@${companyDomain}`;
          const veryOldDate = new Date("2000-01-01");

          const result =
            await provider.hasPreviousCommunicationsWithSenderOrDomain({
              from: fakeColleague,
              date: veryOldDate,
              messageId: "fake-message-id",
            });

          expect(result).toBe(false);
        });
      });

      describe("sent email detection", () => {
        test("returns TRUE for someone we have sent email TO", async ({
          skip,
        }) => {
          if (!sentToEmail) {
            console.warn(
              "SKIPPED: No sent emails found. Ensure account has sent emails.",
            );
            skip();
            return;
          }

          const result =
            await provider.hasPreviousCommunicationsWithSenderOrDomain({
              from: sentToEmail,
              date: new Date(),
              messageId: "fake-message-id",
            });

          expect(result).toBe(true);
        });

        test("returns TRUE for fake colleague at domain we have sent email TO (domain-based)", async ({
          skip,
        }) => {
          if (!sentToCompanyDomain) {
            console.warn(
              "SKIPPED: No sent emails to company domains found. Ensure account has sent emails to non-public domains.",
            );
            skip();
            return;
          }

          // We've sent to someone@domain, check if we detect a different person at same domain
          const fakeColleague = `different-person-${Date.now()}@${sentToCompanyDomain}`;

          const result =
            await provider.hasPreviousCommunicationsWithSenderOrDomain({
              from: fakeColleague,
              date: new Date(),
              messageId: "fake-message-id",
            });

          expect(result).toBe(true);
        });
      });
    });
  },
);
