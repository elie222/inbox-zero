import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasPriorContactOrAssumeYes } from "./has-prior-contact";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

describe("hasPriorContactOrAssumeYes", () => {
  const provider = {
    hasPreviousCommunicationsWithSenderOrDomain: vi.fn(),
  };

  const check = (overrides: Record<string, unknown> = {}) =>
    hasPriorContactOrAssumeYes({
      provider: provider as never,
      from: "sender@example.com",
      date: new Date(),
      messageId: "msg-1",
      logger,
      ...overrides,
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports what the provider found", async () => {
    provider.hasPreviousCommunicationsWithSenderOrDomain.mockResolvedValue(
      false,
    );

    await expect(check()).resolves.toBe(false);
  });

  // Each of these would otherwise read as "no prior contact", which is the input that
  // pushes the cold email blocker toward blocking a sender we could not verify.
  it.each([
    [
      "the provider errors",
      {},
      () =>
        provider.hasPreviousCommunicationsWithSenderOrDomain.mockRejectedValue(
          new Error("api down"),
        ),
    ],
    ["the date is missing", { date: undefined }, () => {}],
    ["the message id is missing", { messageId: undefined }, () => {}],
  ])("assumes contact when %s", async (_name, overrides, arrange) => {
    provider.hasPreviousCommunicationsWithSenderOrDomain.mockResolvedValue(
      false,
    );
    arrange();

    await expect(check(overrides)).resolves.toBe(true);
  });

  it("does not call the provider when the message cannot be identified", async () => {
    await check({ messageId: undefined });

    expect(
      provider.hasPreviousCommunicationsWithSenderOrDomain,
    ).not.toHaveBeenCalled();
  });
});
