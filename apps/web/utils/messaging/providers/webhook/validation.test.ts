import { describe, expect, it } from "vitest";
import {
  assertWebhookSecretUsesHttps,
  WEBHOOK_SECRET_REQUIRES_HTTPS_MESSAGE,
} from "./validation";

describe("assertWebhookSecretUsesHttps", () => {
  it("allows HTTP when no secret is configured", () => {
    expect(() =>
      assertWebhookSecretUsesHttps({
        url: "http://example.com/hook",
        secret: null,
      }),
    ).not.toThrow();
  });

  it("allows HTTPS with a secret", () => {
    expect(() =>
      assertWebhookSecretUsesHttps({
        url: "https://example.com/hook",
        secret: "shh",
      }),
    ).not.toThrow();
  });

  it("rejects HTTP when a secret is configured", () => {
    expect(() =>
      assertWebhookSecretUsesHttps({
        url: "http://example.com/hook",
        secret: "shh",
      }),
    ).toThrow(WEBHOOK_SECRET_REQUIRES_HTTPS_MESSAGE);
  });
});
