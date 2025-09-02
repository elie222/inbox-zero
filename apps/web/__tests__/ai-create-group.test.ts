import { describe, it, expect, vi } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import { aiGenerateGroupItems } from "@/utils/ai/group/create-group";
import { queryBatchMessages } from "@/utils/gmail/message";
import type { ParsedMessage } from "@/utils/types";
import { getEmailAccount } from "@/__tests__/helpers";

// pnpm test-ai ai-create-group

const isAiTest = process.env.RUN_AI_TESTS === "true";

const TIMEOUT = 15_000;

vi.mock("server-only", () => ({}));
vi.mock("@/utils/gmail/message", () => ({
  queryBatchMessages: vi.fn(),
}));

describe.runIf(isAiTest)("aiGenerateGroupItems", () => {
  it(
    "should generate group items based on user prompt",
    async () => {
      const emailAccount = getEmailAccount();
      const gmail = {} as gmail_v1.Gmail;
      const group = {
        name: "Work Emails",
        prompt:
          "Create a group for work-related emails from my company domain and about projects or meetings",
      };

      const mockMessages = [
        {
          headers: {
            from: "colleague@mycompany.com",
            subject: "Project Update: Q2 Goals",
          },
          snippet: "Here's the latest update on our Q2 project goals...",
        },
        {
          headers: {
            from: "boss@mycompany.com",
            subject: "Team Meeting: Strategic Planning",
          },
          snippet:
            "Let's schedule our next team meeting for strategic planning...",
        },
        {
          headers: {
            from: "newsletter@external.com",
            subject: "Industry News Digest",
          },
          snippet: "Top stories in our industry this week...",
        },
      ];

      vi.mocked(queryBatchMessages).mockResolvedValue({
        messages: mockMessages as ParsedMessage[],
        nextPageToken: null,
      });

      const result = await aiGenerateGroupItems(emailAccount, gmail, group);

      expect(result).toEqual({
        senders: expect.arrayContaining(["@mycompany.com"]),
        subjects: expect.arrayContaining(["Project Update:", "Team Meeting:"]),
      });

      expect(queryBatchMessages).toHaveBeenCalled();
    },
    TIMEOUT,
  ); // Increased timeout for AI call
});
