import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateMessagingLinkCode } from "@/utils/messaging/chat-sdk/link-code";
import { consumeMessagingLinkCode } from "@/utils/messaging/chat-sdk/link-code-consume";

const { consumeMessagingLinkNonceMock } = vi.hoisted(() => ({
  consumeMessagingLinkNonceMock: vi.fn(),
}));

vi.mock("@/utils/redis/messaging-link-code", () => ({
  consumeMessagingLinkNonce: (nonce: string) =>
    consumeMessagingLinkNonceMock(nonce),
}));

describe("consumeMessagingLinkCode", () => {
  beforeEach(() => {
    consumeMessagingLinkNonceMock.mockReset();
  });

  it("returns email account id for valid code and unused nonce", async () => {
    consumeMessagingLinkNonceMock.mockResolvedValueOnce(true);
    const code = generateMessagingLinkCode({
      emailAccountId: "email-account-1",
      provider: "TEAMS",
    });

    const result = await consumeMessagingLinkCode({
      code,
      provider: "TEAMS",
    });

    expect(result).toEqual({ emailAccountId: "email-account-1" });
    expect(consumeMessagingLinkNonceMock).toHaveBeenCalledTimes(1);
  });

  it("returns null without consuming nonce when provider does not match", async () => {
    consumeMessagingLinkNonceMock.mockResolvedValueOnce(true);
    const code = generateMessagingLinkCode({
      emailAccountId: "email-account-1",
      provider: "TEAMS",
    });

    const result = await consumeMessagingLinkCode({
      code,
      provider: "TELEGRAM",
    });

    expect(result).toBeNull();
    expect(consumeMessagingLinkNonceMock).not.toHaveBeenCalled();
  });

  it("returns null when nonce has already been consumed", async () => {
    consumeMessagingLinkNonceMock.mockResolvedValueOnce(false);
    const code = generateMessagingLinkCode({
      emailAccountId: "email-account-1",
      provider: "TELEGRAM",
    });

    const result = await consumeMessagingLinkCode({
      code,
      provider: "TELEGRAM",
    });

    expect(result).toBeNull();
    expect(consumeMessagingLinkNonceMock).toHaveBeenCalledTimes(1);
  });
});
