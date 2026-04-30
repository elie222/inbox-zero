import { describe, expect, test, vi } from "vitest";
import { aiDraftReply } from "@/utils/ai/reply/draft-reply";
import type { EmailForLLM } from "@/utils/types";
import { getEmailAccount } from "@/__tests__/helpers";

const TIMEOUT = 60_000;

// Run with: pnpm test-ai ai-regression/reply/draft-reply

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TEST_TIMEOUT = 15_000;

describe.runIf(isAiTest)("aiDraftReply", () => {
  test(
    "successfully drafts a reply with knowledge and history",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = getMessages(2);
      const knowledgeBaseContent = "Relevant knowledge point.";
      const emailHistorySummary = "Previous interaction summary.";

      const result = await aiDraftReply({
        messages,
        emailAccount,
        knowledgeBaseContent,
        emailHistorySummary,
        writingStyle: null,
        emailHistoryContext: null,
        calendarAvailability: null,
        mcpContext: null,
        meetingContext: null,
      });

      // Check that the result is a non-empty string
      expect(result).toBeTypeOf("string");
      if (typeof result === "string") {
        expect(result.length).toBeGreaterThan(0);
      }
      console.debug("Generated reply (with knowledge/history):\n", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "successfully drafts a reply without knowledge or history",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = getMessages(1);

      const result = await aiDraftReply({
        messages,
        emailAccount,
        knowledgeBaseContent: null,
        emailHistorySummary: null,
        writingStyle: null,
        emailHistoryContext: null,
        calendarAvailability: null,
        mcpContext: null,
        meetingContext: null,
      });

      // Check that the result is a non-empty string
      expect(result).toBeTypeOf("string");
      if (typeof result === "string") {
        expect(result.length).toBeGreaterThan(0);
      }
      console.debug("Generated reply (no knowledge/history):\n", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "converts user-local availability into sender timezone",
    async () => {
      const emailAccount = getEmailAccount({
        email: "user@example.com",
        timezone: "America/Los_Angeles",
      });
      const messages: TestMessage[] = [
        {
          id: "msg-1",
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Project sync",
          date: new Date("2026-04-30T08:48:00.000Z"),
          content:
            "This week is fairly stacked. Let's aim for Monday. Let me know when works for you. Any time except 7-8 pm BST is ok for me.",
        },
      ];

      const result = await aiDraftReply({
        messages,
        emailAccount,
        knowledgeBaseContent: null,
        emailHistorySummary: null,
        writingStyle: null,
        emailHistoryContext: null,
        calendarAvailability: {
          timezone: "America/Los_Angeles",
          suggestedTimes: [
            {
              start: "2026-05-04 10:30",
              end: "2026-05-04 11:00",
            },
          ],
        },
        mcpContext: null,
        meetingContext: null,
      });

      expect(result).toMatch(/(6:30|6\.30|18:30)[\s\S]{0,40}BST/i);
      expect(result).not.toMatch(/10:30\s*(am|a\.m\.)?\s*BST/i);
      console.debug("Generated reply (timezone conversion):\n", result);
    },
    TEST_TIMEOUT,
  );
});

type TestMessage = EmailForLLM & { to: string };

function getMessages(count = 1): TestMessage[] {
  const messages: TestMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      id: `msg-${i + 1}`,
      from: i % 2 === 0 ? "sender@example.com" : "user@example.com",
      to: i % 2 === 0 ? "user@example.com" : "recipient@example.com",
      subject: `Test Subject ${i + 1}`,
      date: new Date(Date.now() - (count - i) * TIMEOUT), // Messages spaced 1 minute apart
      content: `Test Content ${i + 1}`,
    });
  }
  return messages;
}
