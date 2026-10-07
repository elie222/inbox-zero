import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { GET } from "./route";

const { mockGetChatStreamContext } = vi.hoisted(() => ({
  mockGetChatStreamContext: vi.fn(),
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware({
    auth: {
      userId: "user-1",
      emailAccountId: "email-account-id",
      email: "user@test.com",
    },
  });
});

vi.mock("@/utils/chat/active-run", async (importActual) => ({
  ...(await importActual<typeof import("@/utils/chat/active-run")>()),
  getChatStreamContext: mockGetChatStreamContext,
}));

vi.mock("@/utils/sleep", () => ({ sleep: vi.fn() }));

describe("GET /api/chat/[id]/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resumes the chat's active reply stream", async () => {
    const resumeExistingStream = vi
      .fn()
      .mockResolvedValue(streamOf(['data: {"type":"start"}\n\n']));
    mockGetChatStreamContext.mockReturnValue({ resumeExistingStream });
    prisma.chat.findFirst.mockResolvedValue(activeChat("stream-1"));

    const response = await resume("chat-1");

    expect(prisma.chat.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "chat-1",
          emailAccountId: "email-account-id",
        }),
      }),
    );
    expect(resumeExistingStream).toHaveBeenCalledWith("stream-1");
    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('data: {"type":"start"}\n\n');
  });

  it("returns no content when the chat has no active reply", async () => {
    const resumeExistingStream = vi.fn();
    mockGetChatStreamContext.mockReturnValue({ resumeExistingStream });
    prisma.chat.findFirst.mockResolvedValue(activeChat(null));

    const response = await resume("chat-1");

    expect(response.status).toBe(204);
    expect(resumeExistingStream).not.toHaveBeenCalled();
  });

  it("returns no content when Redis is not configured", async () => {
    mockGetChatStreamContext.mockReturnValue(null);
    prisma.chat.findFirst.mockResolvedValue(activeChat("stream-1"));

    const response = await resume("chat-1");

    expect(response.status).toBe(204);
  });

  it("returns no content when the stream already finished", async () => {
    mockGetChatStreamContext.mockReturnValue({
      resumeExistingStream: vi.fn().mockResolvedValue(null),
    });
    prisma.chat.findFirst.mockResolvedValue(activeChat("stream-1"));

    const response = await resume("chat-1");

    expect(response.status).toBe(204);
  });

  it("waits for a reply still being set up to start streaming", async () => {
    const resumeExistingStream = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(streamOf(['data: {"type":"start"}\n\n']));
    mockGetChatStreamContext.mockReturnValue({ resumeExistingStream });
    prisma.chat.findFirst.mockResolvedValue(activeChat("stream-1"));

    const response = await resume("chat-1");

    expect(response.status).toBe(200);
    expect(resumeExistingStream).toHaveBeenCalledTimes(2);
  });

  it("stops waiting once the reply is no longer active", async () => {
    const resumeExistingStream = vi.fn().mockResolvedValue(undefined);
    mockGetChatStreamContext.mockReturnValue({ resumeExistingStream });
    prisma.chat.findFirst
      .mockResolvedValueOnce(activeChat("stream-1"))
      .mockResolvedValueOnce(activeChat(null));

    const response = await resume("chat-1");

    expect(response.status).toBe(204);
    expect(resumeExistingStream).toHaveBeenCalledTimes(1);
  });

  it("gives up after a bounded wait for a stream that never appears", async () => {
    const resumeExistingStream = vi.fn().mockResolvedValue(undefined);
    mockGetChatStreamContext.mockReturnValue({ resumeExistingStream });
    prisma.chat.findFirst.mockResolvedValue(activeChat("stream-1"));

    const response = await resume("chat-1");

    expect(response.status).toBe(204);
    expect(resumeExistingStream.mock.calls.length).toBeLessThanOrEqual(31);
  });

  it("ignores a marker left by a run that outlived the time limit", async () => {
    const resumeExistingStream = vi.fn();
    mockGetChatStreamContext.mockReturnValue({ resumeExistingStream });
    prisma.chat.findFirst.mockResolvedValue({
      activeStreamId: "stream-1",
      activeStreamStartedAt: new Date(Date.now() - 801_000),
    });

    const response = await resume("chat-1");

    expect(response.status).toBe(204);
    expect(resumeExistingStream).not.toHaveBeenCalled();
  });

  it("does not resume another account's chat", async () => {
    const resumeExistingStream = vi.fn();
    mockGetChatStreamContext.mockReturnValue({ resumeExistingStream });
    prisma.chat.findFirst.mockResolvedValue(null);

    const response = await resume("someone-elses-chat");

    expect(response.status).toBe(404);
    expect(resumeExistingStream).not.toHaveBeenCalled();
  });
});

function resume(id: string) {
  return GET(new NextRequest(`http://localhost/api/chat/${id}/stream`), {
    params: Promise.resolve({ id }),
  });
}

function streamOf(chunks: string[]) {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function activeChat(activeStreamId: string | null) {
  return {
    activeStreamId,
    activeStreamStartedAt: activeStreamId ? new Date() : null,
  };
}
