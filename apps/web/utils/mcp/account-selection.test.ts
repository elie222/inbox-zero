import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  listMcpEmailAccounts,
  resolveMcpEmailAccount,
} from "@/utils/mcp/account-selection";

vi.mock("@/utils/prisma");

describe("account-selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists linked email accounts with provider metadata", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "account_1",
        email: "first@example.com",
        name: "First Account",
        account: { provider: "google" },
      },
    ] as never);

    await expect(listMcpEmailAccounts("user_1")).resolves.toEqual([
      {
        id: "account_1",
        email: "first@example.com",
        name: "First Account",
        provider: "google",
      },
    ]);
  });

  it("resolves the first linked account when no selector is provided", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue({
      id: "account_1",
      email: "first@example.com",
      name: "First Account",
      account: { provider: "google" },
    } as never);

    await expect(resolveMcpEmailAccount({ userId: "user_1" })).resolves.toEqual(
      {
        id: "account_1",
        email: "first@example.com",
        name: "First Account",
        provider: "google",
      },
    );
  });

  it("resolves an explicitly selected email address", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue({
      id: "account_2",
      email: "selected@example.com",
      name: null,
      account: { provider: "microsoft" },
    } as never);

    await expect(
      resolveMcpEmailAccount({
        userId: "user_1",
        emailAddress: "selected@example.com",
      }),
    ).resolves.toEqual({
      id: "account_2",
      email: "selected@example.com",
      name: null,
      provider: "microsoft",
    });
  });

  it("rejects ambiguous selectors", async () => {
    await expect(
      resolveMcpEmailAccount({
        userId: "user_1",
        emailAccountId: "account_1",
        emailAddress: "selected@example.com",
      }),
    ).rejects.toThrow(
      "Provide either emailAccountId or emailAddress, not both.",
    );
  });
});
