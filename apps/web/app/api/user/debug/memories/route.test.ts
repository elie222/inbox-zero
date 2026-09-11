import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

import { GET } from "./route";

describe("user/debug/memories route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns chat memories and drafting reply memories separately", async () => {
    const chatMemoryCreatedAt = new Date("2026-05-01T10:00:00.000Z");
    const replyMemoryCreatedAt = new Date("2026-05-02T10:00:00.000Z");
    const replyMemoryUpdatedAt = new Date("2026-05-03T10:00:00.000Z");

    prisma.chatMemory.findMany.mockResolvedValue([
      {
        id: "chat-memory-1",
        content: "Use concise responses.",
        createdAt: chatMemoryCreatedAt,
        updatedAt: chatMemoryCreatedAt,
        chatId: "chat-1",
      },
    ]);
    prisma.chatMemory.count.mockResolvedValue(1);
    prisma.replyMemory.findMany.mockResolvedValue([
      {
        id: "reply-memory-1",
        content: "Mention the next step first.",
        createdAt: replyMemoryCreatedAt,
        updatedAt: replyMemoryUpdatedAt,
        kind: "PREFERENCE",
        scopeType: "GLOBAL",
        scopeValue: "",
        isLearnedStyleEvidence: true,
        _count: { sources: 2 },
      },
    ]);
    prisma.replyMemory.count.mockResolvedValue(1);

    const request = new NextRequest(
      "http://localhost:3000/api/user/debug/memories",
    );

    const response = await GET(request, {} as never);
    const body = await response.json();

    expect(body).toEqual({
      chatMemories: [
        {
          id: "chat-memory-1",
          content: "Use concise responses.",
          createdAt: chatMemoryCreatedAt.toISOString(),
          updatedAt: chatMemoryCreatedAt.toISOString(),
          chatId: "chat-1",
        },
      ],
      replyMemories: [
        {
          id: "reply-memory-1",
          content: "Mention the next step first.",
          createdAt: replyMemoryCreatedAt.toISOString(),
          updatedAt: replyMemoryUpdatedAt.toISOString(),
          kind: "PREFERENCE",
          scopeType: "GLOBAL",
          scopeValue: "",
          isLearnedStyleEvidence: true,
          _count: { sources: 2 },
        },
      ],
      chatMemoryCount: 1,
      replyMemoryCount: 1,
      totalCount: 2,
    });
  });
});
