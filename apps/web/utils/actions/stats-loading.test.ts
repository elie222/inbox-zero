import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import prisma from "@/utils/__mocks__/prisma";
import { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import { loadEmails, saveBatch } from "./stats-loading";

vi.mock("@/utils/prisma");

describe("loadEmails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$executeRaw.mockResolvedValue(20);
  });

  it("reports older history as unloaded when newer mail uses the page budget", async () => {
    prisma.emailMessage.findFirst.mockResolvedValue({
      date: new Date("2026-10-01T00:00:00Z"),
    } as never);
    const messages = Array.from({ length: 20 }, (_, i) => ({
      ...getMockMessage({ id: `message-${i}` }),
      internalDate: "1700000000000",
    }));
    const getMessages = vi
      .fn()
      .mockResolvedValue({ messages, nextPageToken: "next-page" });

    const result = await loadEmails(
      {
        emailAccountId: "account-1",
        emailProvider: createMockEmailProvider({
          getMessagesWithPagination: getMessages,
        }),
        logger: createTestLogger(),
      },
      { loadBefore: true, maxPages: 2 },
    );

    expect(getMessages).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      pages: 2,
      loadedBeforeMessages: 0,
      hasMoreAfter: true,
      hasMoreBefore: true,
    });
  });
});

describe("saveBatch account deletion", () => {
  it.each([
    false,
    true,
  ])("only treats a foreign key failure as expected if the account was deleted (exists: %s)", async (exists) => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Foreign key violation",
      {
        code: "P2010",
        clientVersion: "test",
        meta: { code: "23503" },
      },
    );
    prisma.$executeRaw.mockRejectedValueOnce(error);
    prisma.emailAccount.findUnique.mockResolvedValueOnce(
      exists ? ({ id: "account-1" } as never) : null,
    );

    const result = saveBatch({
      emailAccountId: "account-1",
      emailProvider: createMockEmailProvider({
        getMessagesWithPagination: vi.fn().mockResolvedValue({
          messages: [{ ...getMockMessage(), internalDate: "1700000000000" }],
        }),
      }),
      logger: createTestLogger(),
      before: undefined,
      after: undefined,
    });

    if (exists) await expect(result).rejects.toBe(error);
    else
      await expect(result).rejects.toMatchObject(
        new SafeError("Email account not found", 404),
      );
  });
});
