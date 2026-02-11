import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWhatsAppSignature } from "./verify";

describe("verifyWhatsAppSignature", () => {
  it("returns true for valid signature", () => {
    const appSecret = "secret";
    const body = JSON.stringify({ event: "message" });
    const signature = crypto
      .createHmac("sha256", appSecret)
      .update(body)
      .digest("hex");

    expect(
      verifyWhatsAppSignature(appSecret, body, `sha256=${signature}`),
    ).toBe(true);
  });

  it("returns false for invalid signature", () => {
    const appSecret = "secret";
    const body = JSON.stringify({ event: "message" });

    expect(
      verifyWhatsAppSignature(appSecret, body, "sha256=invalid-signature"),
    ).toBe(false);
  });

  it("returns false when signature is missing", () => {
    expect(verifyWhatsAppSignature("secret", "{}", null)).toBe(false);
  });
});
