import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { REDACTED_TEXT, softDeleteChat } from "./soft-delete";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("softDeleteChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when no chat is owned by the email account", async () => {
    prisma.chat.findFirst.mockResolvedValue(null);

    const result = await softDeleteChat({
      chatId: "chat-1",
      emailAccountId: "ea_1",
    });

    expect(result).toBe(false);
    expect(prisma.chat.update).not.toHaveBeenCalled();
    expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
    expect(prisma.chatCompaction.updateMany).not.toHaveBeenCalled();
    expect(prisma.chatMemory.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent for an already soft-deleted chat", async () => {
    prisma.chat.findFirst.mockResolvedValue({
      id: "chat-1",
      deletedAt: new Date("2026-01-01"),
    } as never);

    const result = await softDeleteChat({
      chatId: "chat-1",
      emailAccountId: "ea_1",
    });

    expect(result).toBe(true);
    expect(prisma.chat.update).not.toHaveBeenCalled();
    expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
  });

  it("redacts messages, compactions, memories, and clears the name", async () => {
    prisma.chat.findFirst.mockResolvedValue({
      id: "chat-1",
      deletedAt: null,
    } as never);
    prisma.chat.update.mockResolvedValue({} as never);
    prisma.chatMessage.updateMany.mockResolvedValue({ count: 3 } as never);
    prisma.chatCompaction.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.chatMemory.updateMany.mockResolvedValue({ count: 2 } as never);

    const result = await softDeleteChat({
      chatId: "chat-1",
      emailAccountId: "ea_1",
    });

    expect(result).toBe(true);

    expect(prisma.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "chat-1" },
        data: expect.objectContaining({
          name: null,
          deletedAt: expect.any(Date),
        }),
      }),
    );

    expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1" },
      data: { parts: [{ type: "text", text: REDACTED_TEXT }] },
    });
    expect(prisma.chatCompaction.updateMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1" },
      data: { summary: REDACTED_TEXT },
    });
    expect(prisma.chatMemory.updateMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1" },
      data: { content: REDACTED_TEXT },
    });
  });
});
