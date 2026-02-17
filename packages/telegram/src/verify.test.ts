import { describe, expect, it } from "vitest";
import { verifyTelegramWebhookToken } from "./verify";

describe("verifyTelegramWebhookToken", () => {
  it("returns true when token matches", () => {
    expect(verifyTelegramWebhookToken("secret", "secret")).toBe(true);
  });

  it("returns false when token differs", () => {
    expect(verifyTelegramWebhookToken("secret", "wrong")).toBe(false);
  });

  it("returns false when token is missing", () => {
    expect(verifyTelegramWebhookToken("secret", null)).toBe(false);
  });
});
