import { describe, expect, it } from "vitest";
import {
  generateMessagingLinkCode,
  parseMessagingLinkCode,
} from "@/utils/messaging/chat-sdk/link-code";

describe("messaging link code", () => {
  it("round-trips a valid code for the same provider", () => {
    const code = generateMessagingLinkCode({
      emailAccountId: "email-account-1",
      provider: "TEAMS",
    });

    const parsed = parseMessagingLinkCode({
      code,
      provider: "TEAMS",
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        emailAccountId: "email-account-1",
      }),
    );
    expect(parsed?.nonce.length).toBeGreaterThanOrEqual(8);
  });

  it("rejects a valid code when provider does not match", () => {
    const code = generateMessagingLinkCode({
      emailAccountId: "email-account-1",
      provider: "TEAMS",
    });

    const parsed = parseMessagingLinkCode({
      code,
      provider: "TELEGRAM",
    });

    expect(parsed).toBeNull();
  });
});
