import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEmailProvider = vi.hoisted(() => ({
  archiveThreadWithLabel: vi.fn(),
  unarchiveThread: vi.fn(),
  trashThread: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailProviderTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailProviderTestMiddleware(mockEmailProvider);
});

import { POST } from "./route";

function postBatch(body: unknown) {
  return POST(
    new NextRequest("http://localhost:3000/api/mobile/threads/batch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    {} as never,
  );
}

describe("POST /api/mobile/threads/batch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailProvider.archiveThreadWithLabel.mockResolvedValue(undefined);
    mockEmailProvider.unarchiveThread.mockResolvedValue(undefined);
    mockEmailProvider.trashThread.mockResolvedValue(undefined);
  });

  it("reports failures per thread instead of failing the whole batch", async () => {
    mockEmailProvider.unarchiveThread.mockImplementation(
      async (threadId: string) => {
        if (threadId === "thread-2") throw new Error("Provider rejected");
      },
    );

    const response = await postBatch({
      action: "unarchive",
      threadIds: ["thread-1", "thread-2", "thread-3"],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      succeeded: ["thread-1", "thread-3"],
      failed: ["thread-2"],
    });
  });

  it("treats a thread that no longer exists as succeeded", async () => {
    mockEmailProvider.unarchiveThread.mockRejectedValue(
      new Error("Requested entity was not found."),
    );

    const response = await postBatch({
      action: "unarchive",
      threadIds: ["thread-1"],
    });

    await expect(response.json()).resolves.toEqual({
      succeeded: ["thread-1"],
      failed: [],
    });
  });

  it("dispatches each action to the matching provider call", async () => {
    await postBatch({ action: "archive", threadIds: ["thread-1"] });
    expect(mockEmailProvider.archiveThreadWithLabel).toHaveBeenCalledWith(
      "thread-1",
      "user@example.com",
    );

    await postBatch({ action: "trash", threadIds: ["thread-1"] });
    expect(mockEmailProvider.trashThread).toHaveBeenCalledWith(
      "thread-1",
      "user@example.com",
      "user",
    );
  });

  it("acts on each thread once when the caller repeats a thread id", async () => {
    const response = await postBatch({
      action: "archive",
      threadIds: ["thread-1", "thread-1"],
    });

    expect(mockEmailProvider.archiveThreadWithLabel).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      succeeded: ["thread-1"],
      failed: [],
    });
  });
});
