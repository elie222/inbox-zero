import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEmailProvider = vi.hoisted(() => ({
  untrashThread: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailProviderTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailProviderTestMiddleware(mockEmailProvider);
});

import { POST } from "./route";

function untrash() {
  return POST(
    new NextRequest("http://localhost:3000/api/threads/thread-1/untrash", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "thread-1" }) } as never,
  );
}

describe("POST /api/threads/[id]/untrash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves the thread back to the inbox", async () => {
    mockEmailProvider.untrashThread.mockResolvedValue(undefined);

    const response = await untrash();

    expect(mockEmailProvider.untrashThread).toHaveBeenCalledWith("thread-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 404 when the thread no longer exists", async () => {
    mockEmailProvider.untrashThread.mockRejectedValue(
      new Error("Requested entity was not found."),
    );

    const response = await untrash();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Thread not found",
    });
  });

  it("returns 404 when Outlook reports the item as missing", async () => {
    mockEmailProvider.untrashThread.mockRejectedValue(
      Object.assign(new Error("item missing"), { code: "ErrorItemNotFound" }),
    );

    const response = await untrash();

    expect(response.status).toBe(404);
  });

  it("lets other provider failures reach the middleware's error mapping", async () => {
    const providerError = new Error("Provider unavailable");
    mockEmailProvider.untrashThread.mockRejectedValue(providerError);

    await expect(untrash()).rejects.toThrow(providerError);
  });
});
