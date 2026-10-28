import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  findReconnectTarget,
  isReconnectTargetMismatch,
} from "@/utils/oauth/reconnect-target";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");

describe("isReconnectTargetMismatch", () => {
  it("accepts an add-account flow, which names no target", () => {
    expect(
      isReconnectTargetMismatch({
        reconnectEmailAccountId: null,
        matchedEmailAccountId: "anything",
      }),
    ).toBe(false);
  });

  it("accepts a reconnect that came back as the same mailbox", () => {
    expect(
      isReconnectTargetMismatch({
        reconnectEmailAccountId: "mailbox",
        matchedEmailAccountId: "mailbox",
      }),
    ).toBe(false);
  });

  it("rejects a reconnect that came back as a different mailbox", () => {
    expect(
      isReconnectTargetMismatch({
        reconnectEmailAccountId: "mailbox",
        matchedEmailAccountId: "other-mailbox",
      }),
    ).toBe(true);
  });

  it("rejects a reconnect that matched no existing account", () => {
    expect(
      isReconnectTargetMismatch({
        reconnectEmailAccountId: "mailbox",
        matchedEmailAccountId: undefined,
      }),
    ).toBe(true);
  });
});

describe("findReconnectTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findFirst.mockResolvedValue(null);
  });

  it("scopes the lookup to the signed-in user and the provider", async () => {
    await findReconnectTarget({
      emailAccountId: "mailbox",
      userId: "user",
      provider: "microsoft",
    });

    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "mailbox",
          userId: "user",
          account: { provider: "microsoft" },
        },
      }),
    );
  });
});
