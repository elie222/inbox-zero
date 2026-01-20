import { describe, expect, test, vi } from "vitest";
import { aiDraftReply } from "@/utils/ai/reply/draft-reply";
import type { EmailForLLM } from "@/utils/types";
import { getEmailAccount } from "@/__tests__/helpers";

const TIMEOUT = 60_000;

// Run with: pnpm test-ai draft-reply

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
    "drafts reply in Spanish when thread is in Spanish",
    async () => {
      const emailAccount = getEmailAccount();
      const messages: TestMessage[] = [
        {
          id: "msg-1",
          from: "cliente@example.com",
          to: "user@example.com",
          subject: "Consulta sobre servicios",
          date: new Date(Date.now() - TIMEOUT),
          content:
            "Buenos días, estoy interesado en sus servicios de consultoría. ¿Podrían proporcionarme más información sobre sus tarifas y disponibilidad?",
        },
      ];

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

      expect(result).toBeTypeOf("string");
      if (typeof result === "string") {
        expect(result.length).toBeGreaterThan(0);
        const hasSpanishIndicators =
          result.includes("Hola") ||
          result.includes("Buenos") ||
          result.includes("gracias") ||
          result.includes("información") ||
          result.includes("servicios") ||
          /[áéíóúñ¿¡]/i.test(result);
        expect(hasSpanishIndicators).toBe(true);
      }
      console.debug("Generated Spanish reply:\n", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "drafts reply in German when thread is in German",
    async () => {
      const emailAccount = getEmailAccount();
      const messages: TestMessage[] = [
        {
          id: "msg-1",
          from: "kunde@example.com",
          to: "user@example.com",
          subject: "Anfrage zu Ihren Dienstleistungen",
          date: new Date(Date.now() - TIMEOUT),
          content:
            "Guten Tag, ich interessiere mich für Ihre Beratungsdienstleistungen. Könnten Sie mir weitere Informationen zu Ihren Preisen und Ihrer Verfügbarkeit geben?",
        },
      ];

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

      expect(result).toBeTypeOf("string");
      if (typeof result === "string") {
        expect(result.length).toBeGreaterThan(0);
        const hasGermanIndicators =
          result.includes("Guten") ||
          result.includes("Hallo") ||
          result.includes("danke") ||
          result.includes("Informationen") ||
          result.includes("freuen") ||
          /[äöüß]/i.test(result);
        expect(hasGermanIndicators).toBe(true);
      }
      console.debug("Generated German reply:\n", result);
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
