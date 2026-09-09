import { describe, expect, it } from "vitest";
import {
  serializeOnboardingChatMessages,
  type OnboardingChatMessage,
} from "@/app/(app)/[emailAccountId]/onboarding/chatOnboardingConfig";

describe("serializeOnboardingChatMessages", () => {
  it("keeps conversation text while excluding UI tool parts", () => {
    const messages: OnboardingChatMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-advanceStage",
            toolCallId: "call-1",
            state: "output-available",
            input: { stage: "discovery" },
            output: { stage: "discovery" },
          },
          { type: "text", text: "What is hardest about your inbox?" },
        ],
      },
      {
        id: "user-1",
        role: "user",
        metadata: { hidden: true },
        parts: [{ type: "text", text: "[panel] Keep newsletters labeled" }],
      },
    ];

    expect(serializeOnboardingChatMessages(messages)).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "What is hardest about your inbox?" }],
      },
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "[panel] Keep newsletters labeled" }],
      },
    ]);
  });
});
