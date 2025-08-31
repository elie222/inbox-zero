import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiAnalyzeWritingStyle } from "@/utils/ai/knowledge/writing-style";
import { getEmailAccount } from "@/__tests__/helpers";

// Run with: pnpm test-ai writing-style

const TIMEOUT = 15_000;

vi.mock("server-only", () => ({}));

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)(
  "analyzeWritingStyle",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test("successfully analyzes writing style from emails", async () => {
      const result = await aiAnalyzeWritingStyle({
        emails: getTestEmails(),
        emailAccount: getEmailAccount(),
      });

      expect(result).toHaveProperty("typicalLength");
      expect(result).toHaveProperty("formality");
      expect(result).toHaveProperty("commonGreeting");
      expect(result?.notableTraits).toBeInstanceOf(Array);
      expect(result?.examples).toBeInstanceOf(Array);
    });

    test("handles empty emails array gracefully", async () => {
      const result = await aiAnalyzeWritingStyle({
        emails: [],
        emailAccount: getEmailAccount(),
      });

      expect(result).toBeNull();
    });
  },
  TIMEOUT,
);

function getTestEmails() {
  return [
    {
      id: "1",
      from: "user@test.com",
      subject: "Check in about the project status",
      content:
        "Hi team, Just wanted to check in about the project status. Let me know how things are going! Thanks, User",
      date_sent: "2023-06-15T10:30:00Z",
      to: "team@example.com",
    },
    {
      id: "2",
      from: "user@test.com",
      subject: "Report on the project status",
      content:
        "Here's the report you requested. Let me know if you need anything else.",
      date_sent: "2023-06-14T15:45:00Z",
      to: "client@example.com",
    },
    {
      id: "3",
      from: "user@test.com",
      subject: "Can we reschedule today's meeting to tomorrow?",
      content:
        "Can we reschedule today's meeting to tomorrow? I have a conflict.",
      date_sent: "2023-06-13T09:15:00Z",
      to: "colleague@example.com",
    },
  ];
}
