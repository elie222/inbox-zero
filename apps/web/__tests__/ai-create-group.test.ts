import { describe, it, expect, vi } from "vitest";
import { gmail_v1 } from "@googleapis/gmail";
import { aiGenerateGroupItems } from "@/utils/ai/group/create-group";
import { queryBatchMessages } from "@/utils/gmail/message";
import { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/gmail/message", () => ({
  queryBatchMessages: vi.fn(),
}));

describe("aiGenerateGroupItems", () => {
  it("should generate group items based on user prompt", async () => {
    const user = {
      email: "user@test.com",
      aiProvider: null,
      aiModel: null,
      aiApiKey: null,
    };

    const gmail = {} as gmail_v1.Gmail;
    const accessToken = "fake-access-token";
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

    const result = await aiGenerateGroupItems(user, gmail, accessToken, group);

    expect(result).toEqual({
      senders: expect.arrayContaining(["@mycompany.com"]),
      subjects: expect.arrayContaining(["Project Update:", "Team Meeting:"]),
    });

    expect(queryBatchMessages).toHaveBeenCalled();
  }, 15_000); // Increased timeout for AI call
});
