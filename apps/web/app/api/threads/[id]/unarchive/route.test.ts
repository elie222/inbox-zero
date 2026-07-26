import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEmailProvider = vi.hoisted(() => ({
  unarchiveThread: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailProviderTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailProviderTestMiddleware(mockEmailProvider);
});

import { POST } from "./route";

function unarchive() {
  return POST(
    new NextRequest("http://localhost:3000/api/threads/thread-1/unarchive", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "thread-1" }) } as never,
  );
}

describe("POST /api/threads/[id]/unarchive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves the thread back to the inbox", async () => {
    mockEmailProvider.unarchiveThread.mockResolvedValue(undefined);

    const response = await unarchive();

    expect(mockEmailProvider.unarchiveThread).toHaveBeenCalledWith("thread-1");
    expect(response.status).toBe(200);
  });

  it("returns 404 when the thread no longer exists", async () => {
    mockEmailProvider.unarchiveThread.mockRejectedValue(
      new Error("Requested entity was not found."),
    );

    const response = await unarchive();

    expect(response.status).toBe(404);
  });

  it("returns 500 when the provider fails for another reason", async () => {
    mockEmailProvider.unarchiveThread.mockRejectedValue(
      new Error("Provider unavailable"),
    );

    const response = await unarchive();

    expect(response.status).toBe(500);
  });
});
