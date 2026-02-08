import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { updateAboutTool, searchConversationsTool } from "./memory";

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({
  tool: (definition: any) => definition,
}));
vi.mock("@/utils/prisma");

const logger = createScopedLogger("test");
vi.spyOn(logger, "with").mockReturnValue(logger);

const baseContext = {
  emailAccountId: "ea-1",
  emailAccountEmail: "user@example.com",
  provider: "google",
  resourceType: "email",
  logger,
} as any;

describe("updateAboutTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, "with").mockReturnValue(logger);
  });

  it("appends atomically via raw SQL", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { about: "Works at Acme Corp\nPrefers short replies" },
    ] as any);

    const tool = updateAboutTool(baseContext);
    const result = await tool.execute({
      action: "append",
      content: "Prefers short replies",
    });

    expect(result).toEqual({
      success: true,
      about: "Works at Acme Corp\nPrefers short replies",
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
  });

  it("replaces the about text entirely", async () => {
    vi.mocked(prisma.emailAccount.update).mockResolvedValue({} as any);

    const tool = updateAboutTool(baseContext);
    const result = await tool.execute({
      action: "replace",
      content: "New info",
    });

    expect(result).toEqual({
      success: true,
      about: "New info",
    });
    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "ea-1" },
      data: { about: "New info" },
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("searchConversationsTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(logger, "with").mockReturnValue(logger);
  });

  it("returns matching messages with snippets", async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      {
        id: "msg-1",
        role: "user",
        parts: JSON.stringify([
          { type: "text", text: "I prefer newsletter emails to be archived" },
        ]),
        createdAt: new Date("2025-01-15T10:00:00Z"),
        chatId: "chat-1",
      },
    ] as any);

    const tool = searchConversationsTool(baseContext);
    const result = await tool.execute({ query: "newsletter", limit: 5 });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].chatId).toBe("chat-1");
    expect(result.results[0].role).toBe("user");
    expect(result.results[0].snippet).toContain("newsletter");
  });

  it("returns empty results when no matches found", async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([]);

    const tool = searchConversationsTool(baseContext);
    const result = await tool.execute({ query: "nonexistent", limit: 5 });

    expect(result.results).toHaveLength(0);
  });

  it("queries with correct filters", async () => {
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([]);

    const tool = searchConversationsTool(baseContext);
    await tool.execute({ query: "test query", limit: 3 });

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith({
      where: {
        chat: { emailAccountId: "ea-1" },
        parts: { string_contains: "test query" },
      },
      select: {
        id: true,
        role: true,
        parts: true,
        createdAt: true,
        chatId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
  });
});
