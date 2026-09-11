import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getConnectedEmailAccounts } from "./connected-accounts";

vi.mock("@/utils/prisma");

describe("getConnectedEmailAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findMany.mockResolvedValue([]);
  });

  it("loads only accounts included in the combined mailbox", async () => {
    await getConnectedEmailAccounts({
      userId: "user-1",
      includeInAllAccounts: true,
    });

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          includeInAllAccounts: true,
          account: { disconnectedAt: null },
        },
      }),
    );
  });

  it("allows a specific account lookup regardless of the combined mailbox preference", async () => {
    await getConnectedEmailAccounts({
      userId: "user-1",
      accountId: "account-1",
    });

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "account-1",
          userId: "user-1",
          account: { disconnectedAt: null },
        },
      }),
    );
  });
});
