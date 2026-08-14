import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createEmailProviderMock,
  getConnectedEmailAccountsMock,
  loadThreadsMock,
  toListThreadsMock,
} = vi.hoisted(() => ({
  createEmailProviderMock: vi.fn(),
  getConnectedEmailAccountsMock: vi.fn(),
  loadThreadsMock: vi.fn(),
  toListThreadsMock: vi.fn((value) => value),
}));

vi.mock("@/utils/email/connected-accounts", () => ({
  getConnectedEmailAccounts: getConnectedEmailAccountsMock,
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: createEmailProviderMock,
}));
vi.mock("@/utils/threads/load", () => ({
  loadThreads: loadThreadsMock,
  toListThreads: toListThreadsMock,
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware();
});

import { GET } from "./route";

describe("GET /api/threads/all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConnectedEmailAccountsMock.mockResolvedValue([
      {
        id: "account-1",
        email: "account@example.com",
        name: "Account",
        image: null,
        provider: "google",
      },
    ]);
    createEmailProviderMock.mockResolvedValue({ name: "google" });
    loadThreadsMock.mockResolvedValue({
      threads: [
        {
          id: "thread-1",
          snippet: "Thread",
          plan: undefined,
          plans: [],
          messages: [],
        },
      ],
      nextPageToken: "provider-next",
    });
  });

  it("loads connected accounts with the shared list contract", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/threads/all?limit=12&isUnread=true",
      ),
      {} as never,
    );

    expect(getConnectedEmailAccountsMock).toHaveBeenCalledWith({
      userId: "user-1",
    });
    expect(createEmailProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        provider: "google",
      }),
    );
    expect(loadThreadsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        messageFormat: "metadata",
        query: {
          type: "inbox",
          isUnread: true,
          limit: 12,
          nextPageToken: undefined,
        },
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      threads: [
        {
          id: "thread-1",
          account: { id: "account-1", email: "account@example.com" },
        },
      ],
      failedAccountIds: [],
      nextPageToken: expect.any(String),
    });
  });

  it("rejects an unsafe provider cursor before loading threads", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        version: 1,
        accounts: {
          "account-1": {
            pageToken: "https://example.com/messages",
            offset: 0,
            done: false,
          },
        },
      }),
    ).toString("base64url");
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/threads/all?cursor=${cursor}`),
      {} as never,
    );

    expect(loadThreadsMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      threads: [],
      failedAccountIds: ["account-1"],
      nextPageToken: null,
    });
  });
});
