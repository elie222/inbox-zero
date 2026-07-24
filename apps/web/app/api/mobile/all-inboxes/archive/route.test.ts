import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { bulkArchiveThreadsMock, createEmailProviderMock } = vi.hoisted(() => ({
  bulkArchiveThreadsMock: vi.fn(),
  createEmailProviderMock: vi.fn(),
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

import { POST } from "./route";

describe("POST /api/mobile/all-inboxes/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEmailProviderMock.mockResolvedValue({
      bulkArchiveThreads: bulkArchiveThreadsMock,
    });
    bulkArchiveThreadsMock.mockImplementation(async (threads) => ({
      succeededThreadIds: threads.map(
        (thread: { threadId: string }) => thread.threadId,
      ),
      failedThreadIds: [],
    }));
  });

  it("archives only accounts owned by the authenticated user", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "owned-account",
        email: "owner@example.com",
        account: { provider: "google" },
      },
    ] as never);

    const response = await POST(
      new NextRequest("http://localhost:3000/api/mobile/all-inboxes/archive", {
        method: "POST",
        body: JSON.stringify({
          threads: [
            {
              accountId: "owned-account",
              threadId: "thread-1",
              messageIds: ["message-1", "message-2"],
            },
            {
              accountId: "owned-account",
              threadId: "thread-1",
              messageIds: ["message-2", "message-3"],
            },
            {
              accountId: "other-account",
              threadId: "thread-2",
              messageIds: ["message-4"],
            },
          ],
        }),
      }),
      {} as never,
    );

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["owned-account", "other-account"] },
          userId: "user-1",
        }),
      }),
    );
    expect(bulkArchiveThreadsMock).toHaveBeenCalledTimes(1);
    expect(bulkArchiveThreadsMock).toHaveBeenCalledWith(
      [
        {
          threadId: "thread-1",
          messageIds: ["message-1", "message-2", "message-3"],
        },
      ],
      "owner@example.com",
    );
    await expect(response.json()).resolves.toEqual({
      archived: 1,
      total: 2,
      succeeded: [{ accountId: "owned-account", threadId: "thread-1" }],
      failed: [{ accountId: "other-account", threadId: "thread-2" }],
    });
  });

  it("reports partial bulk provider failures without failing the whole request", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "owned-account",
        email: "owner@example.com",
        account: { provider: "google" },
      },
    ] as never);
    bulkArchiveThreadsMock.mockResolvedValueOnce({
      succeededThreadIds: ["thread-1"],
      failedThreadIds: ["thread-2"],
    });

    const response = await POST(
      new NextRequest("http://localhost:3000/api/mobile/all-inboxes/archive", {
        method: "POST",
        body: JSON.stringify({
          threads: [
            {
              accountId: "owned-account",
              threadId: "thread-1",
              messageIds: ["message-1"],
            },
            {
              accountId: "owned-account",
              threadId: "thread-2",
              messageIds: ["message-2"],
            },
          ],
        }),
      }),
      {} as never,
    );

    await expect(response.json()).resolves.toEqual({
      archived: 1,
      total: 2,
      succeeded: [{ accountId: "owned-account", threadId: "thread-1" }],
      failed: [{ accountId: "owned-account", threadId: "thread-2" }],
    });
  });

  it("reports every account thread when provider initialization fails", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "owned-account",
        email: "owner@example.com",
        account: { provider: "google" },
      },
    ] as never);
    createEmailProviderMock.mockRejectedValueOnce(
      new Error("Provider unavailable"),
    );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/mobile/all-inboxes/archive", {
        method: "POST",
        body: JSON.stringify({
          threads: [
            {
              accountId: "owned-account",
              threadId: "thread-1",
              messageIds: ["message-1"],
            },
            {
              accountId: "owned-account",
              threadId: "thread-2",
              messageIds: ["message-2"],
            },
          ],
        }),
      }),
      {} as never,
    );

    expect(bulkArchiveThreadsMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      archived: 0,
      total: 2,
      succeeded: [],
      failed: [
        { accountId: "owned-account", threadId: "thread-1" },
        { accountId: "owned-account", threadId: "thread-2" },
      ],
    });
  });
});
