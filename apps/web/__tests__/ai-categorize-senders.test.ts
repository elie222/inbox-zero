import { describe, it, expect, vi } from "vitest";
import { aiCategorizeSenders } from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { SenderCategory } from "@/utils/categories";

vi.mock("server-only", () => ({}));

describe("aiCategorizeSenders", () => {
  const user = {
    email: "user@test.com",
    aiProvider: null,
    aiModel: null,
    aiApiKey: null,
  };

  it("should categorize senders using AI", async () => {
    const senders = [
      "newsletter@company.com",
      "support@service.com",
      "unknown@example.com",
      "sales@business.com",
      "noreply@socialnetwork.com",
    ];

    const result = await aiCategorizeSenders({
      user,
      senders: senders.map((sender) => ({ emailAddress: sender, snippet: "" })),
    });

    expect(result).toHaveLength(senders.length);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sender: expect.any(String),
          category: expect.any(String),
        }),
      ]),
    );

    // Check specific senders
    const newsletterResult = result.find(
      (r) => r.sender === "newsletter@company.com",
    );
    expect(newsletterResult?.category).toBe("newsletter");

    const supportResult = result.find(
      (r) => r.sender === "support@service.com",
    );
    expect(supportResult?.category).toBe("support");

    // The unknown sender might be categorized as "request_more_information"
    const unknownResult = result.find(
      (r) => r.sender === "unknown@example.com",
    );
    expect(unknownResult?.category).toBe("request_more_information");
  }, 15_000); // Increased timeout for AI call

  it("should handle empty senders list", async () => {
    const result = await aiCategorizeSenders({ user, senders: [] });

    expect(result).toEqual([]);
  });

  it("should categorize senders for all valid SenderCategory values", async () => {
    const senders = Object.values(SenderCategory)
      .filter((category) => category !== "unknown")
      .map((category) => `${category}@example.com`);

    const result = await aiCategorizeSenders({
      user,
      senders: senders.map((sender) => ({ emailAddress: sender, snippet: "" })),
    });

    expect(result).toHaveLength(senders.length);

    for (const sender of senders) {
      const category = sender.split("@")[0];
      const senderResult = result.find((r) => r.sender === sender);
      expect(senderResult).toBeDefined();
      expect(senderResult?.category).toBe(category);
    }
  }, 15_000);
});
