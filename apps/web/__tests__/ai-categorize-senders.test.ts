import { describe, it, expect, vi } from "vitest";
import {
  aiCategorizeSenders,
  REQUEST_MORE_INFORMATION_CATEGORY,
} from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { defaultCategory } from "@/utils/categories";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai ai-categorize-senders

const isAiTest = process.env.RUN_AI_TESTS === "true";

const TIMEOUT = 15_000;

vi.mock("server-only", () => ({}));

const emailAccount = getEmailAccount();

const testSenders = [
  {
    emailAddress: "newsletter@company.com",
    emails: [
      { subject: "Latest updates and news from our company", snippet: "" },
    ],
    expectedCategory: "Newsletter",
  },
  {
    emailAddress: "support@service.com",
    emails: [{ subject: "Your ticket #1234 has been updated", snippet: "" }],
    expectedCategory: "Support",
  },
  {
    emailAddress: "unknown@example.com",
    emails: [],
    expectedCategory: "Unknown",
  },
  {
    emailAddress: "sales@business.com",
    emails: [
      { subject: "Special offer: 20% off our enterprise plan", snippet: "" },
    ],
    expectedCategory: "Marketing",
  },
  {
    emailAddress: "noreply@socialnetwork.com",
    emails: [{ subject: "John Smith mentioned you in a comment", snippet: "" }],
    expectedCategory: "Social",
  },
];

describe.runIf(isAiTest)("AI Sender Categorization", () => {
  describe("Bulk Categorization", () => {
    it(
      "should categorize senders with snippets using AI",
      async () => {
        const result = await aiCategorizeSenders({
          emailAccount,
          senders: testSenders,
          categories: getEnabledCategories(),
        });

        expect(result).toHaveLength(testSenders.length);

        // Test newsletter categorization with snippet
        const newsletterResult = result.find(
          (r) => r.sender === "newsletter@company.com",
        );
        expect(newsletterResult?.category).toBe("Newsletter");

        // Test support categorization with ticket snippet
        const supportResult = result.find(
          (r) => r.sender === "support@service.com",
        );
        expect(supportResult?.category).toBe("Support");

        // Test sales categorization with offer snippet
        const salesResult = result.find(
          (r) => r.sender === "sales@business.com",
        );
        expect(salesResult?.category).toBe("Marketing");
      },
      TIMEOUT,
    );

    it("should handle empty senders list", async () => {
      const result = await aiCategorizeSenders({
        emailAccount,
        senders: [],
        categories: [],
      });

      expect(result).toEqual([]);
    });

    it(
      "should categorize senders for all valid SenderCategory values",
      async () => {
        const senders = getEnabledCategories()
          .filter((category) => category.name !== "Unknown")
          .map((category) => `${category.name}@example.com`);

        const result = await aiCategorizeSenders({
          emailAccount,
          senders: senders.map((sender) => ({
            emailAddress: sender,
            emails: [],
          })),
          categories: getEnabledCategories(),
        });

        expect(result).toHaveLength(senders.length);

        for (const sender of senders) {
          const category = sender.split("@")[0];
          const senderResult = result.find((r) => r.sender === sender);
          expect(senderResult).toBeDefined();
          expect(senderResult?.category).toBe(category);
        }
      },
      TIMEOUT,
    );
  });

  describe("Single Sender Categorization", () => {
    it(
      "should categorize individual senders with snippets",
      async () => {
        for (const { emailAddress, emails, expectedCategory } of testSenders) {
          const result = await aiCategorizeSender({
            emailAccount,
            sender: emailAddress,
            previousEmails: emails,
            categories: getEnabledCategories(),
          });

          if (expectedCategory === "Unknown") {
            expect([REQUEST_MORE_INFORMATION_CATEGORY, "Unknown"]).toContain(
              result?.category,
            );
          } else {
            expect(result?.category).toBe(expectedCategory);
          }
        }
      },
      TIMEOUT * 2,
    );

    it(
      "should handle unknown sender appropriately",
      async () => {
        const unknownSender = testSenders.find(
          (s) => s.expectedCategory === "Unknown",
        );
        if (!unknownSender) throw new Error("No unknown sender in test data");

        const result = await aiCategorizeSender({
          emailAccount,
          sender: unknownSender.emailAddress,
          previousEmails: [],
          categories: getEnabledCategories(),
        });

        expect([REQUEST_MORE_INFORMATION_CATEGORY, "Unknown"]).toContain(
          result?.category,
        );
      },
      TIMEOUT,
    );
  });

  describe("Comparison Tests", () => {
    it(
      "should produce consistent results between bulk and single categorization",
      async () => {
        // Run bulk categorization
        const bulkResults = await aiCategorizeSenders({
          emailAccount,
          senders: testSenders,
          categories: getEnabledCategories(),
        });

        // Run individual categorizations and pair with senders
        const singleResults = await Promise.all(
          testSenders.map(async ({ emailAddress, emails }) => {
            const result = await aiCategorizeSender({
              emailAccount,
              sender: emailAddress,
              previousEmails: emails,
              categories: getEnabledCategories(),
            });
            return {
              sender: emailAddress,
              category: result?.category,
            };
          }),
        );

        // Compare results for each sender
        for (const { emailAddress, expectedCategory } of testSenders) {
          const bulkResult = bulkResults.find((r) => r.sender === emailAddress);
          const singleResult = singleResults.find(
            (r) => r.sender === emailAddress,
          );

          // Both should either have a category or both be undefined
          if (bulkResult?.category || singleResult?.category) {
            expect(bulkResult?.category).toBeDefined();
            expect(singleResult?.category).toBeDefined();
            expect(bulkResult?.category).toBe(singleResult?.category);

            // If not Unknown, check against expected category
            if (expectedCategory !== "Unknown") {
              expect(bulkResult?.category).toBe(expectedCategory);
              expect(singleResult?.category).toBe(expectedCategory);
            }
          }
        }
      },
      TIMEOUT * 2,
    );
  });
});

const getEnabledCategories = () => {
  return Object.entries(defaultCategory)
    .filter(([_, value]) => value.enabled)
    .map(([_, value]) => ({
      name: value.name,
      description: value.description,
    }));
};
