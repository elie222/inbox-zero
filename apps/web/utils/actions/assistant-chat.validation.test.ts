import { describe, expect, it } from "vitest";
import {
  ASSISTANT_CHAT_MAX_TEXT_LENGTH,
  assistantInputSchema,
} from "./assistant-chat.validation";

describe("assistantInputSchema", () => {
  it("rejects blank chat and message ids", () => {
    const result = assistantInputSchema.safeParse({
      id: "   ",
      message: {
        id: "   ",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["id"] }),
        expect.objectContaining({ path: ["message", "id"] }),
      ]),
    );
  });

  it("accepts large messages up to the chat text limit", () => {
    const result = assistantInputSchema.safeParse(
      createInput("a".repeat(ASSISTANT_CHAT_MAX_TEXT_LENGTH)),
    );

    expect(result.success).toBe(true);
  });

  it("rejects messages above the chat text limit", () => {
    const result = assistantInputSchema.safeParse(
      createInput("a".repeat(ASSISTANT_CHAT_MAX_TEXT_LENGTH + 1)),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "too_big",
          maximum: ASSISTANT_CHAT_MAX_TEXT_LENGTH,
          path: ["message", "parts", 0, "text"],
        }),
      ]),
    );
  });
});

function createInput(text: string) {
  return {
    id: "chat-1",
    message: {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text }],
    },
  };
}
