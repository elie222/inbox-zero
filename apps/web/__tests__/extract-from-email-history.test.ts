import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiExtractFromEmailHistory } from "@/utils/ai/knowledge/extract-from-email-history";
import type { ParsedMessage } from "@/utils/types";

// pnpm test-ai extract-from-email-history

vi.mock("server-only", () => ({}));

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

function getUser() {
  return {
    id: "test-user-id",
    email: "user@test.com",
    aiModel: null,
    aiProvider: null,
    aiApiKey: null,
    about: null,
  };
}

function getMockMessage(overrides = {}): ParsedMessage {
  return {
    id: "msg1",
    threadId: "thread1",
    snippet: "Test email content",
    historyId: "hist1",
    attachments: [],
    inline: [],
    headers: {
      from: "sender@test.com",
      to: "recipient@test.com",
      subject: "Test Subject",
      date: "2024-03-20T10:00:00Z",
      "message-id": "msg1",
    },
    textPlain: "This is a test email content.",
    ...overrides,
  };
}

function getTestMessages(count = 2) {
  return Array.from({ length: count }, (_, i) =>
    getMockMessage({
      id: `msg${i + 1}`,
      textPlain: `Test email content ${i + 1}`,
      headers: {
        from: i % 2 === 0 ? "sender@test.com" : "recipient@test.com",
        date: new Date(2024, 2, 20 + i).toISOString(),
      },
    }),
  );
}

describe.skipIf(!isAiTest)("aiExtractFromEmailHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("successfully extracts information from email thread", async () => {
    const messages = getTestMessages();
    const user = getUser();

    const result = await aiExtractFromEmailHistory({
      currentThreadMessages: messages.slice(0, 1),
      historicalMessages: messages.slice(1),
      user,
    });

    expect(result.data).toBeDefined();
    if (result.data) {
      expect(result.data.summary).toBeTypeOf("string");
      expect(result.data.summary.length).toBeLessThanOrEqual(500);
      console.debug("Extracted summary:", result.data.summary);
    }
  }, 15_000);

  test("handles empty historical message array", async () => {
    const currentMessages = getTestMessages(1);

    const result = await aiExtractFromEmailHistory({
      currentThreadMessages: currentMessages,
      historicalMessages: [],
      user: getUser(),
    });

    expect(result.data).toBeDefined();
    expect(result.data?.summary).toBe(
      "No relevant historical context available.",
    );
  });

  test("extracts time-sensitive information", async () => {
    const currentMessages = getTestMessages(1);
    const historicalMessages = getTestMessages(2);
    historicalMessages[0].textPlain =
      "Let's meet next Friday at 3 PM to discuss this.";
    historicalMessages[1].textPlain =
      "The deadline for this project is March 31st.";

    const result = await aiExtractFromEmailHistory({
      currentThreadMessages: currentMessages,
      historicalMessages: historicalMessages,
      user: getUser(),
    });

    expect(result.data).toBeDefined();
    if (result.data) {
      expect(result.data.summary).toContain("Friday");
      expect(result.data.summary).toContain("March 31st");
      console.debug("Summary with time context:", result.data.summary);
    }
  }, 15_000);
});
