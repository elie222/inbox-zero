/** biome-ignore-all lint/style/noMagicNumbers: test */
import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiExtractFromEmailHistory } from "@/utils/ai/knowledge/extract-from-email-history";
import type { EmailForLLM } from "@/utils/types";
import { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai extract-from-email-history

const TIMEOUT = 15_000;

vi.mock("server-only", () => ({}));

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

function getMockMessage(overrides = {}): EmailForLLM {
  return {
    id: "msg1",
    from: "sender@test.com",
    subject: "Test Subject",
    content: "This is a test email content.",
    date: new Date("2024-03-20T10:00:00Z"),
    to: "recipient@test.com",
    ...overrides,
  };
}

function getTestMessages(count = 2) {
  return Array.from({ length: count }, (_, i) =>
    getMockMessage({
      id: `msg${i + 1}`,
      content: `Test email content ${i + 1}`,
      from: i % 2 === 0 ? "sender@test.com" : "recipient@test.com",
      date: new Date(2024, 2, 20 + i),
    }),
  );
}

describe.runIf(isAiTest)("aiExtractFromEmailHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test(
    "successfully extracts information from email thread",
    async () => {
      const messages = getTestMessages();
      const emailAccount = getEmailAccount();

      const result = await aiExtractFromEmailHistory({
        currentThreadMessages: messages.slice(0, 1),
        historicalMessages: messages.slice(1),
        emailAccount,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(typeof result).toBe("string");
        expect(result.length).toBeLessThanOrEqual(500);
        console.debug("Extracted summary:", result);
      }
    },
    TIMEOUT,
  );

  test("handles empty historical message array", async () => {
    const currentMessages = getTestMessages(1);

    const result = await aiExtractFromEmailHistory({
      currentThreadMessages: currentMessages,
      historicalMessages: [],
      emailAccount: getEmailAccount(),
    });

    expect(result).toBeDefined();
    expect(result).toBe("No relevant historical context available.");
  });

  test(
    "extracts time-sensitive information",
    async () => {
      const currentMessages = getTestMessages(1);
      const historicalMessages = getTestMessages(2);
      historicalMessages[0].content =
        "Let's meet next Friday at 3 PM to discuss this.";
      historicalMessages[1].content =
        "The deadline for this project is March 31st.";

      const result = await aiExtractFromEmailHistory({
        currentThreadMessages: currentMessages,
        historicalMessages,
        emailAccount: getEmailAccount(),
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result).toContain("Friday");
        expect(result).toContain("March 31st");
        console.debug("Summary with time context:", result);
      }
    },
    TIMEOUT,
  );
});
