import { describe, expect, it } from "vitest";
import { unsubscribeSenderRequestSchema } from "./validation";

describe("unsubscribe sender API validation", () => {
  it("requires a sender email", () => {
    expect(unsubscribeSenderRequestSchema.safeParse({}).success).toBe(false);
    expect(
      unsubscribeSenderRequestSchema.safeParse({
        senderEmail: "news@example.com",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid optional URLs", () => {
    expect(
      unsubscribeSenderRequestSchema.safeParse({
        senderEmail: "news@example.com",
        unsubscribeLink: "not-a-url",
      }).success,
    ).toBe(false);
  });
});
