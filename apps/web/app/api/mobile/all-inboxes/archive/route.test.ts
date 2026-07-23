import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { archiveThreadMock, createEmailProviderMock } = vi.hoisted(() => ({
  archiveThreadMock: vi.fn(),
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
      archiveThreadWithLabel: archiveThreadMock,
    });
    archiveThreadMock.mockResolvedValue(undefined);
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
            { accountId: "owned-account", threadId: "thread-1" },
            { accountId: "owned-account", threadId: "thread-1" },
            { accountId: "other-account", threadId: "thread-2" },
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
    expect(archiveThreadMock).toHaveBeenCalledTimes(1);
    expect(archiveThreadMock).toHaveBeenCalledWith(
      "thread-1",
      "owner@example.com",
    );
    await expect(response.json()).resolves.toMatchObject({
      archived: 1,
      total: 2,
      succeeded: [{ accountId: "owned-account", threadId: "thread-1" }],
      failed: [{ accountId: "other-account", threadId: "thread-2" }],
    });
  });

  it("reports individual provider failures without failing the whole request", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "owned-account",
        email: "owner@example.com",
        account: { provider: "google" },
      },
    ] as never);
    archiveThreadMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Provider failure"));

    const response = await POST(
      new NextRequest("http://localhost:3000/api/mobile/all-inboxes/archive", {
        method: "POST",
        body: JSON.stringify({
          threads: [
            { accountId: "owned-account", threadId: "thread-1" },
            { accountId: "owned-account", threadId: "thread-2" },
          ],
        }),
      }),
      {} as never,
    );

    await expect(response.json()).resolves.toMatchObject({
      archived: 1,
      total: 2,
      failed: [{ accountId: "owned-account", threadId: "thread-2" }],
    });
  });
});
