import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { mockSoftDeleteChat } = vi.hoisted(() => ({
  mockSoftDeleteChat: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/chat/soft-delete", () => ({
  softDeleteChat: mockSoftDeleteChat,
}));

vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (
      _scope: string,
      handler: (
        request: Request & { auth: { emailAccountId: string } },
        context: { params: Promise<{ chatId: string }> },
      ) => Promise<Response>,
    ) =>
    async (
      request: Request,
      context: { params: Promise<{ chatId: string }> },
    ) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "email-account-1" },
        }),
        context,
      ),
}));

import { DELETE, GET, PATCH } from "./route";

describe("/api/chats/[chatId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only active chats for the current email account", async () => {
    prisma.chat.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "Important chat",
      messages: [{ id: "message-1", role: "user", parts: [] }],
    } as never);

    const response = await GET(new Request("http://localhost/api/chats/chat-1") as never, {
      params: Promise.resolve({ chatId: "chat-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "chat-1",
      name: "Important chat",
      messages: [{ id: "message-1", role: "user", parts: [] }],
    });
    expect(prisma.chat.findFirst).toHaveBeenCalledWith({
      where: {
        id: "chat-1",
        emailAccountId: "email-account-1",
        deletedAt: null,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });
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

  it("returns 404 when renaming a soft-deleted or missing chat", async () => {
    prisma.chat.updateMany.mockResolvedValue({ count: 0 } as never);

    const request = new Request("http://localhost/api/chats/chat-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed chat" }),
    });

    const response = await PATCH(request as never, {
      params: Promise.resolve({ chatId: "chat-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Chat not found.",
    });
    expect(prisma.chat.updateMany).toHaveBeenCalledWith({
      where: {
        id: "chat-1",
        emailAccountId: "email-account-1",
        deletedAt: null,
      },
      data: {
        name: "Renamed chat",
      },
    });
    expect(prisma.chat.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when soft deletion does not find an active owned chat", async () => {
    mockSoftDeleteChat.mockResolvedValue(false);

    const response = await DELETE(
      new Request("http://localhost/api/chats/chat-1", {
        method: "DELETE",
      }) as never,
      {
        params: Promise.resolve({ chatId: "chat-1" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Chat not found.",
    });
    expect(mockSoftDeleteChat).toHaveBeenCalledWith({
      chatId: "chat-1",
      emailAccountId: "email-account-1",
    });
  });
});
