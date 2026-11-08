import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { CHAT_ACCOUNT_MISMATCH_ERROR_CODE } from "@/utils/config";

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

import { GET, PATCH } from "./route";

describe("PATCH /api/chats/[chatId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when only unknown fields are provided", async () => {
    const request = new Request("http://localhost/api/chats/chat-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unsupportedField: true }),
    });

    const response = await PATCH(request as never, {
      params: Promise.resolve({ chatId: "chat-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "At least one field must be provided.",
    });
    expect(prisma.chat.updateMany).not.toHaveBeenCalled();
  });

  it("returns 400 when no updatable fields are provided", async () => {
    const request = new Request("http://localhost/api/chats/chat-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await PATCH(request as never, {
      params: Promise.resolve({ chatId: "chat-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "At least one field must be provided.",
    });
  });
});

describe("GET /api/chats/[chatId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for a chat that has not been created yet", async () => {
    prisma.chat.findFirst.mockResolvedValue(null);

    const response = await getChat("new-chat");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
  });

  it("tells the client when the chat belongs to another of the user's accounts", async () => {
    prisma.chat.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "other-account-chat" } as never);

    const response = await getChat("other-account-chat");

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: CHAT_ACCOUNT_MISMATCH_ERROR_CODE,
    });
    expect(prisma.chat.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ emailAccount: { userId: "user-1" } }),
      }),
    );
  });
});

function getChat(chatId: string) {
  return GET(new Request(`http://localhost/api/chats/${chatId}`) as never, {
    params: Promise.resolve({ chatId }),
  });
}
