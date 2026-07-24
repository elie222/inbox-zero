import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { createEmailProviderMock, getThreadsMock } = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
  getThreadsMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware();
});

import { GET } from "./route";

describe("GET /api/mobile/all-inboxes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getThreadsMock.mockResolvedValue({ threads: [] });
    createEmailProviderMock.mockResolvedValue({
      getLabels: vi.fn().mockResolvedValue([]),
      getThreadsWithQuery: getThreadsMock,
    });
  });

  it("loads only connected accounts owned by the authenticated user", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "account-1",
        email: "one@example.com",
        account: { provider: "google" },
      },
    ] as never);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/mobile/all-inboxes?after=2026-07-23T00%3A00%3A00.000Z",
      ),
      {} as never,
    );

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          account: { disconnectedAt: null },
        },
      }),
    );
    expect(createEmailProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        provider: "google",
      }),
    );
    expect(getThreadsMock).toHaveBeenCalledWith({
      query: {
        type: "inbox",
        after: new Date("2026-07-23T00:00:00.000Z"),
      },
      maxResults: 20,
    });
    await expect(response.json()).resolves.toMatchObject({
      accounts: [
        {
          accountId: "account-1",
          email: "one@example.com",
          status: "ok",
        },
      ],
      failedAccountIds: [],
    });
  });

  it("can scope the summary to one owned account", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "account-2",
        email: "two@example.com",
        account: { provider: "microsoft" },
      },
    ] as never);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/mobile/all-inboxes?accountId=account-2&after=2026-07-23T00%3A00%3A00.000Z",
      ),
      {} as never,
    );

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "account-2",
          userId: "user-1",
          account: { disconnectedAt: null },
        },
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      accounts: [
        {
          accountId: "account-2",
          email: "two@example.com",
          status: "ok",
        },
      ],
    });
  });
});
