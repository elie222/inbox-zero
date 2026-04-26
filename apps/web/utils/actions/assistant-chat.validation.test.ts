import { describe, expect, it } from "vitest";
import { assistantInputSchema } from "./assistant-chat.validation";

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
});
