import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidMailboxSyncCursorError } from "@/utils/email/mailbox-sync";

const { getMailboxSyncPageMock } = vi.hoisted(() => ({
  getMailboxSyncPageMock: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailProviderTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailProviderTestMiddleware({
    getMailboxSyncPage: getMailboxSyncPageMock,
  });
});

import { POST } from "./route";

describe("POST /api/mobile/mailbox-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMailboxSyncPageMock.mockResolvedValue({
      cursor: "next-cursor",
      deletedMessageIds: ["deleted-1"],
      hasMore: false,
      reset: false,
      upsertedMessages: [],
    });
  });

  it("starts a bounded account sync from the requested date", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/mobile/mailbox-sync", {
        method: "POST",
        body: JSON.stringify({
          after: "2026-07-01T00:00:00.000Z",
          limit: 50,
        }),
      }),
      {} as never,
    );

    expect(getMailboxSyncPageMock).toHaveBeenCalledWith({
      after: new Date("2026-07-01T00:00:00.000Z"),
      cursor: undefined,
      limit: 50,
    });
    await expect(response.json()).resolves.toEqual({
      accountId: "email-account-1",
      cursor: "next-cursor",
      deletedMessageIds: ["deleted-1"],
      hasMore: false,
      reset: false,
      upsertedMessages: [],
    });
  });

  it("continues from an opaque cursor without requiring a date", async () => {
    const response = await POST(
      new NextRequest("http://localhost:3000/api/mobile/mailbox-sync", {
        method: "POST",
        body: JSON.stringify({ cursor: "opaque-cursor" }),
      }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(getMailboxSyncPageMock).toHaveBeenCalledWith({
      after: undefined,
      cursor: "opaque-cursor",
      limit: 100,
    });
  });

  it("rejects a null initial sync date", async () => {
    await expect(
      POST(
        new NextRequest("http://localhost:3000/api/mobile/mailbox-sync", {
          method: "POST",
          body: JSON.stringify({ after: null }),
        }),
        {} as never,
      ),
    ).rejects.toThrow();
    expect(getMailboxSyncPageMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid cursor without exposing provider errors", async () => {
    getMailboxSyncPageMock.mockRejectedValue(
      new InvalidMailboxSyncCursorError(),
    );

    const response = await POST(
      new NextRequest("http://localhost:3000/api/mobile/mailbox-sync", {
        method: "POST",
        body: JSON.stringify({ cursor: "tampered" }),
      }),
      {} as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid mailbox sync cursor",
    });
  });
});
