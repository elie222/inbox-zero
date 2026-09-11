import { describe, expect, it } from "vitest";
import { onboardingChatInputSchema } from "@/app/api/chat/onboarding/validation";
import { getOnboardingChatInput } from "@/app/api/chat/onboarding/test-utils";

describe("onboardingChatInputSchema", () => {
  it("accepts text-only messages", () => {
    const result = onboardingChatInputSchema.safeParse(
      getOnboardingChatInput([
        { type: "text", text: "Help me organize my inbox" },
      ]),
    );

    expect(result.success).toBe(true);
  });

  it("rejects non-text message parts", () => {
    const result = onboardingChatInputSchema.safeParse(
      getOnboardingChatInput([
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
