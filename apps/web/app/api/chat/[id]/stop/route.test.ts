import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { startChatRun } from "@/utils/chat/active-run";
import { POST } from "./route";

vi.mock("@/utils/prisma");

vi.mock("@/utils/sleep", () => ({ sleep: vi.fn() }));

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

// Without REDIS_URL the stop reaches runs on this instance directly; the
// cross-instance broadcast is covered in utils/chat/active-run.test.ts.
vi.mock("@/env", async (importActual) => ({
  env: {
    ...(await importActual<typeof import("@/env")>()).env,
    REDIS_URL: undefined,
  },
}));

describe("POST /api/chat/[id]/stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.assistantChatRuns?.clear();
    prisma.chat.updateMany.mockResolvedValue({ count: 1 });
  });

  it("cancels the active run and waits for it to save its reply", async () => {
    const run = startChatRun("stream-1");
    prisma.chat.findFirst.mockResolvedValue({ activeStreamId: "stream-1" });
    // The run clears its stream once it has saved the stopped reply.
    prisma.chat.findUnique
      .mockResolvedValueOnce({ activeStreamId: "stream-1" })
      .mockResolvedValueOnce({ activeStreamId: null });

    const response = await stop("chat-1", { activeStreamId: "stream-1" });

    expect(response.status).toBe(200);
    expect(prisma.chat.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "chat-1", emailAccountId: "email-account-id" },
      }),
    );
    expect(run.abortSignal.aborted).toBe(true);
    expect(prisma.chat.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.chat.updateMany).not.toHaveBeenCalled();
  });

  it("clears the stream itself, only if unchanged, when the run never ends", async () => {
    prisma.chat.findFirst.mockResolvedValue({ activeStreamId: "stream-1" });
    prisma.chat.findUnique.mockResolvedValue({ activeStreamId: "stream-1" });

    const response = await stop("chat-1", { activeStreamId: "stream-1" });

    expect(response.status).toBe(200);
    expect(prisma.chat.updateMany).toHaveBeenCalledWith({
      where: { id: "chat-1", activeStreamId: "stream-1" },
      data: { activeStreamId: null },
    });
  });

  it("cancels the active run when the client does not know its id yet", async () => {
    const run = startChatRun("stream-1");
    prisma.chat.findFirst.mockResolvedValue({ activeStreamId: "stream-1" });
    prisma.chat.findUnique.mockResolvedValue({ activeStreamId: null });

    await stop("chat-1", {});

    expect(run.abortSignal.aborted).toBe(true);
  });

  it("ignores a stop for an earlier reply", async () => {
    const newerRun = startChatRun("stream-2");
    prisma.chat.findFirst.mockResolvedValue({ activeStreamId: "stream-2" });

    const response = await stop("chat-1", { activeStreamId: "stream-1" });

    expect(response.status).toBe(200);
    expect(newerRun.abortSignal.aborted).toBe(false);
    expect(prisma.chat.updateMany).not.toHaveBeenCalled();
  });

  it("does nothing when no reply is running", async () => {
    prisma.chat.findFirst.mockResolvedValue({ activeStreamId: null });

    const response = await stop("chat-1", { activeStreamId: "stream-1" });

    expect(response.status).toBe(200);
    expect(prisma.chat.updateMany).not.toHaveBeenCalled();
  });

  it("does not stop another account's chat", async () => {
    const run = startChatRun("stream-1");
    prisma.chat.findFirst.mockResolvedValue(null);

    const response = await stop("someone-elses-chat", {});

    expect(response.status).toBe(404);
    expect(run.abortSignal.aborted).toBe(false);
    expect(prisma.chat.updateMany).not.toHaveBeenCalled();
  });
});

function stop(id: string, body: Record<string, unknown>) {
  return POST(
    new NextRequest(`http://localhost/api/chat/${id}/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}
