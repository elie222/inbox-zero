import { describe, expect, it } from "vitest";
import { onboardingChatInputSchema } from "@/app/api/chat/onboarding/validation";

describe("onboardingChatInputSchema", () => {
  it("accepts text-only messages", () => {
    const result = onboardingChatInputSchema.safeParse(
      getInput([{ type: "text", text: "Help me organize my inbox" }]),
    );

    expect(result.success).toBe(true);
  });

  it("rejects non-text message parts", () => {
    const result = onboardingChatInputSchema.safeParse(
      getInput([
        {
          type: "file",
          url: "https://example.com/image.png",
          mediaType: "image/png",
        },
      ]),
    );

    expect(result.success).toBe(false);
  });
});

function getInput(parts: unknown[]) {
  return {
    messages: [
      {
        id: "message-1",
        role: "user",
        parts,
      },
    ],
    setup: {
      rules: [],
      status: "draft",
    },
    scan: {
      status: "pending",
      emailsPerDay: null,
      emailsLastMonth: null,
      cleanupSuggestions: [],
      totalCleanupSuggestions: 0,
    },
    isPremium: false,
  };
}
