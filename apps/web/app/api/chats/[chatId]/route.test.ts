import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

import { PATCH } from "./route";

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
