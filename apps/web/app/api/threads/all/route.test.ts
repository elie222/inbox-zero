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
  const getLabelsMock = vi.fn();

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
    getLabelsMock.mockResolvedValue([
      { id: "label-1", name: "Important", type: "user" },
    ]);
    createEmailProviderMock.mockResolvedValue({
      name: "google",
      getLabels: getLabelsMock,
    });
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
    expect(getLabelsMock).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toMatchObject({
      threads: [
        {
          id: "thread-1",
          account: { id: "account-1", email: "account@example.com" },
        },
      ],
      failedAccountIds: [],
      labelsByAccount: {
        "account-1": {
          "label-1": { id: "label-1", name: "Important", type: "user" },
        },
      },
      nextPageToken: expect.any(String),
    });
  });

  it("rejects an unsafe provider cursor before loading threads", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        version: 2,
        accounts: {
          "account-1": {
            pageToken: "https://example.com/messages",
            consumedThreadIds: [],
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
      nextPageToken: expect.any(String),
    });
  });

  it("keeps account threads when its labels cannot be loaded", async () => {
    getLabelsMock.mockRejectedValue(new Error("Labels unavailable"));

    const response = await GET(
      new NextRequest("http://localhost:3000/api/threads/all"),
      {} as never,
    );

    await expect(response.json()).resolves.toMatchObject({
      threads: [{ id: "thread-1" }],
      labelsByAccount: { "account-1": {} },
      failedAccountIds: [],
    });
  });

  it("resolves label filters to each account's matching label id", async () => {
    getConnectedEmailAccountsMock.mockResolvedValue([
      {
        id: "account-1",
        email: "first@example.com",
        name: "First",
        image: null,
        provider: "google",
      },
      {
        id: "account-2",
        email: "second@example.com",
        name: "Second",
        image: null,
        provider: "microsoft",
      },
      {
        id: "account-3",
        email: "third@example.com",
        name: "Third",
        image: null,
        provider: "google",
      },
    ]);
    createEmailProviderMock.mockImplementation(
      async ({ emailAccountId }: { emailAccountId: string }) => ({
        name: emailAccountId === "account-2" ? "microsoft" : "google",
        getLabels: vi
          .fn()
          .mockResolvedValue(
            emailAccountId === "account-1"
              ? [{ id: "google-label", name: "Receipts", type: "user" }]
              : emailAccountId === "account-2"
                ? [{ id: "outlook-category", name: "receipts", type: "user" }]
                : [{ id: "other-label", name: "Marketing", type: "user" }],
          ),
      }),
    );

    await GET(
      new NextRequest(
        "http://localhost:3000/api/threads/all?labelName=Receipts",
      ),
      {} as never,
    );

    expect(loadThreadsMock).toHaveBeenCalledTimes(2);
    expect(loadThreadsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        query: expect.objectContaining({
          labelIds: ["google-label", "INBOX"],
        }),
      }),
    );
    expect(loadThreadsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-2",
        query: expect.objectContaining({
          labelIds: ["outlook-category", "INBOX"],
        }),
      }),
    );
    expect(loadThreadsMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "account-3" }),
    );
  });
});
