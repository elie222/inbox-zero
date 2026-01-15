import { describe, expect, test, vi } from "vitest";
import { aiDraftFollowUp } from "@/utils/ai/reply/draft-follow-up";
import type { EmailForLLM } from "@/utils/types";
import { getEmailAccount } from "@/__tests__/helpers";

const TIMEOUT = 60_000;

// Run with: pnpm test-ai draft-follow-up

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TEST_TIMEOUT = 15_000;

describe.runIf(isAiTest)("aiDraftFollowUp", () => {
  test(
    "successfully drafts a follow-up email",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = getMessages(2);

      const result = await aiDraftFollowUp({
        messages,
        emailAccount,
        writingStyle: null,
      });

      // Check that the result is a non-empty string
      expect(result).toBeTypeOf("string");
      if (typeof result === "string") {
        expect(result.length).toBeGreaterThan(0);
        // Follow-up emails should typically contain phrases like "following up" or "checking in"
        const lowerResult = result.toLowerCase();
        const hasFollowUpPhrase =
          lowerResult.includes("follow") ||
          lowerResult.includes("checking in") ||
          lowerResult.includes("circling back") ||
          lowerResult.includes("wanted to");
        expect(hasFollowUpPhrase).toBe(true);
      }
      console.debug("Generated follow-up:\n", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "successfully drafts a follow-up with writing style",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = getMessages(1);

      const result = await aiDraftFollowUp({
        messages,
        emailAccount,
        writingStyle: "Professional and formal tone.",
      });

      // Check that the result is a non-empty string
      expect(result).toBeTypeOf("string");
      if (typeof result === "string") {
        expect(result.length).toBeGreaterThan(0);
      }
      console.debug("Generated follow-up (with style):\n", result);
    },
    TEST_TIMEOUT,
  );
});

type TestMessage = EmailForLLM & { to: string };

function getMessages(count = 1): TestMessage[] {
  const messages: TestMessage[] = [];
  for (let i = 0; i < count; i++) {
    // For follow-up, the last message should be from the user (they're waiting for a reply)
    const isUserMessage = i === count - 1;
    messages.push({
      id: `msg-${i + 1}`,
      from: isUserMessage ? "user@example.com" : "sender@example.com",
      to: isUserMessage ? "recipient@example.com" : "user@example.com",
      subject: `Test Subject ${i + 1}`,
      date: new Date(Date.now() - (count - i) * TIMEOUT),
      content: isUserMessage
        ? "Hi, could you please send me the report by Friday?"
        : `Test Content ${i + 1}`,
    });
  }
  return messages;
}
