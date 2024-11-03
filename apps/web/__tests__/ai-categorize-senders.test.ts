import { describe, it, expect, vi } from "vitest";
import {
  aiCategorizeSenders,
  REQUEST_MORE_INFORMATION_CATEGORY,
} from "@/utils/ai/categorize-sender/ai-categorize-senders";
import { defaultCategory } from "@/utils/categories";

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
      categories: getEnabledCategories(),
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
    expect(newsletterResult?.category).toBe("Newsletter");

    const supportResult = result.find(
      (r) => r.sender === "support@service.com",
    );
    expect(supportResult?.category).toBe("Support");

    // The unknown sender might be categorized as "Unknown"
    const unknownResult = result.find(
      (r) => r.sender === "unknown@example.com",
    );
    expect([REQUEST_MORE_INFORMATION_CATEGORY, "Unknown"]).toContain(
      unknownResult?.category,
    );
  }, 15_000); // Increased timeout for AI call

  it("should handle empty senders list", async () => {
    const result = await aiCategorizeSenders({
      user,
      senders: [],
      categories: [],
    });

    expect(result).toEqual([]);
  });

  it("should categorize senders for all valid SenderCategory values", async () => {
    const senders = getEnabledCategories()
      .filter((category) => category.name !== "Unknown")
      .map((category) => `${category.name}@example.com`);

    const result = await aiCategorizeSenders({
      user,
      senders: senders.map((sender) => ({ emailAddress: sender, snippet: "" })),
      categories: getEnabledCategories(),
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

const getEnabledCategories = () => {
  return Object.entries(defaultCategory)
    .filter(([_, value]) => value.enabled)
    .map(([_, value]) => ({
      name: value.name,
      description: value.description,
    }));
};
