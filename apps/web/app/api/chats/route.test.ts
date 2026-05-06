import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", () => ({
  withEmailAccount:
    (
      _scope: string,
      handler: (request: Request & { auth: { emailAccountId: string } }) => Promise<Response>,
    ) =>
    async (request: Request) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "email-account-1" },
        }),
      ),
}));

import { GET } from "./route";

describe("GET /api/chats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only active chats for the current email account", async () => {
    prisma.chat.findMany.mockResolvedValue([
      { id: "chat-1", name: "Important chat" },
    ] as never);

    const response = await GET(new Request("http://localhost/api/chats") as never);

    expect(prisma.chat.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-1",
        deletedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    });
    await expect(response.json()).resolves.toEqual({
      chats: [{ id: "chat-1", name: "Important chat" }],
    });
  });
});
