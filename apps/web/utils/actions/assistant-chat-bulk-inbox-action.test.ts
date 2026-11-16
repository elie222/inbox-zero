import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  confirmAssistantBulkInboxActionForAccount,
  dismissAssistantBulkInboxActionForAccount,
} from "@/utils/actions/assistant-chat-confirmation";
import { enqueueBulkInboxActionChunk } from "@/utils/bulk-inbox-action/enqueue";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/bulk-inbox-action/enqueue", () => ({
  enqueueBulkInboxActionChunk: vi.fn(),
}));

describe("confirmAssistantBulkInboxActionForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 });
    prisma.bulkInboxActionJob.findUnique.mockResolvedValue(null);
    vi.mocked(enqueueBulkInboxActionChunk).mockResolvedValue(undefined);
    prisma.bulkInboxActionJob.create.mockImplementation((async ({
      data,
    }: any) => ({ id: "job-1", chunkToken: data.chunkToken })) as any);
  });

  it("starts one background job for the confirmed action and records its id", async () => {
    mockChatMessage(buildPendingPart());

    const result = await confirm();

    const created = vi.mocked(prisma.bulkInboxActionJob.create).mock
      .calls[0][0] as any;
    expect(created.data).toMatchObject({
      emailAccountId: "ea_1",
      chatId: "chat-1",
      confirmationKey: "chat-message-1:tool-1",
      action: "archive_threads",
      search: { query: "in:inbox category:promotions" },
      instruction: "only newsletters",
    });
    expect(enqueueBulkInboxActionChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        chunkToken: created.data.chunkToken,
      }),
    );
    expect(result.confirmationResult?.jobId).toBe("job-1");

    const confirmedParts = (
      prisma.chatMessage.updateMany.mock.calls[1][0] as any
    ).data.parts;
    expect(confirmedParts[0].output).toMatchObject({
      confirmationState: "confirmed",
      confirmationResult: { jobId: "job-1" },
    });
  });

  it("reuses the job of an earlier attempt instead of starting another", async () => {
    mockChatMessage(buildPendingPart());
    prisma.bulkInboxActionJob.findUnique.mockResolvedValue({
      id: "job-1",
      chunkToken: "existing-token",
    } as any);

    await confirm();

    expect(prisma.bulkInboxActionJob.create).not.toHaveBeenCalled();
    expect(enqueueBulkInboxActionChunk).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", chunkToken: "existing-token" }),
    );
  });

  it("keeps a reused job when queueing it again fails", async () => {
    const pending = buildPendingPart();
    prisma.chatMessage.findFirst.mockResolvedValue(chatMessage(pending) as any);
    prisma.bulkInboxActionJob.findUnique.mockResolvedValue({
      id: "job-1",
      chunkToken: "existing-token",
    } as any);
    vi.mocked(enqueueBulkInboxActionChunk).mockRejectedValue(
      new Error("queue down"),
    );

    await expect(confirm()).rejects.toThrow(
      "Couldn't queue the cleanup. Nothing changed",
    );

    expect(prisma.bulkInboxActionJob.delete).not.toHaveBeenCalled();
  });

  it("returns the running job even when saving the card's state fails", async () => {
    mockChatMessage(buildPendingPart());
    // The reservation succeeds, then every attempt to save the result loses.
    prisma.chatMessage.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });

    const result = await confirm();

    expect(enqueueBulkInboxActionChunk).toHaveBeenCalled();
    expect(result.confirmationResult?.jobId).toBe("job-1");
  });

  it("does not start another job when the action was already confirmed", async () => {
    mockChatMessage({
      ...buildPendingPart(),
      output: {
        ...buildPendingPart().output,
        confirmationState: "confirmed",
        confirmationResult: {
          jobId: "job-1",
          confirmedAt: "2026-11-10T00:00:00.000Z",
        },
      },
    });

    const result = await confirm();

    expect(result.confirmationResult?.jobId).toBe("job-1");
    expect(prisma.bulkInboxActionJob.create).not.toHaveBeenCalled();
    expect(enqueueBulkInboxActionChunk).not.toHaveBeenCalled();
  });

  it("removes the new job and returns the card to pending when queueing fails", async () => {
    const pending = buildPendingPart();
    prisma.chatMessage.findFirst
      .mockResolvedValueOnce(chatMessage(pending) as any)
      .mockResolvedValue(
        chatMessage({
          ...pending,
          output: { ...pending.output, confirmationState: "processing" },
        }) as any,
      );
    vi.mocked(enqueueBulkInboxActionChunk).mockRejectedValue(
      new Error("queue down"),
    );
    prisma.bulkInboxActionJob.delete.mockResolvedValue({} as any);

    await expect(confirm()).rejects.toThrow(
      "Couldn't queue the cleanup. Nothing changed",
    );

    expect(prisma.bulkInboxActionJob.delete).toHaveBeenCalledWith({
      where: { id: "job-1" },
    });
    const restoredParts = (
      prisma.chatMessage.updateMany.mock.calls.at(-1)?.[0] as any
    ).data.parts;
    expect(restoredParts[0].output.confirmationState).toBe("pending");
  });
});

function confirm() {
  return confirmAssistantBulkInboxActionForAccount({
    chatId: "chat-1",
    chatMessageId: "chat-message-1",
    toolCallId: "tool-1",
    emailAccountId: "ea_1",
    logger: createTestLogger(),
  });
}

function mockChatMessage(part: Record<string, unknown>) {
  prisma.chatMessage.findFirst.mockResolvedValue(chatMessage(part) as any);
}

function chatMessage(part: Record<string, unknown>) {
  return {
    id: "chat-message-1",
    chatId: "chat-1",
    updatedAt: new Date("2026-11-10T00:00:00.000Z"),
    parts: [part],
  };
}

function buildPendingPart() {
  return {
    type: "tool-bulkManageInbox",
    toolCallId: "tool-1",
    state: "output-available",
    input: {},
    output: {
      success: true,
      actionType: "bulk_inbox_action",
      requiresConfirmation: true,
      confirmationState: "pending",
      pendingAction: {
        search: { query: "in:inbox category:promotions" },
        action: "archive_threads",
        labelId: null,
        labelName: null,
        instruction: "only newsletters",
      },
      estimate: {
        threadCount: 150,
        isApproximate: true,
        searchThreadCount: 150,
      },
      samples: [],
    },
  };
}

describe("dismissAssistantBulkInboxActionForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.chatMessage.updateMany.mockResolvedValue({ count: 1 });
  });

  it("marks a pending action cancelled without starting a job", async () => {
    mockChatMessage(buildPendingPart());

    const result = await dismiss();

    expect(result.confirmationState).toBe("cancelled");
    const parts = (prisma.chatMessage.updateMany.mock.calls[0][0] as any).data
      .parts;
    expect(parts[0].output.confirmationState).toBe("cancelled");
    expect(prisma.bulkInboxActionJob.create).not.toHaveBeenCalled();
  });

  it("refuses to cancel an action that already started", async () => {
    const pending = buildPendingPart();
    mockChatMessage({
      ...pending,
      output: {
        ...pending.output,
        confirmationState: "confirmed",
        confirmationResult: { jobId: "job-1", confirmedAt: "2026-11-11" },
      },
    });

    await expect(dismiss()).rejects.toThrow("already started");
  });

  it("cancels a start that never finished and stops any job it queued", async () => {
    const pending = buildPendingPart();
    mockChatMessage({
      ...pending,
      output: {
        ...pending.output,
        confirmationState: "processing",
        confirmationProcessingAt: new Date(
          Date.now() - 10 * 60 * 1000,
        ).toISOString(),
      },
    });
    prisma.bulkInboxActionJob.updateMany.mockResolvedValue({ count: 1 });

    const result = await dismiss();

    expect(result.confirmationState).toBe("cancelled");
    expect(prisma.bulkInboxActionJob.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "ea_1",
        confirmationKey: "chat-message-1:tool-1",
        status: "RUNNING",
      },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
    const parts = (prisma.chatMessage.updateMany.mock.calls[0][0] as any).data
      .parts;
    expect(parts[0].output.confirmationState).toBe("cancelled");
  });

  it("does not cancel a start that is still in progress", async () => {
    const pending = buildPendingPart();
    mockChatMessage({
      ...pending,
      output: {
        ...pending.output,
        confirmationState: "processing",
        confirmationProcessingAt: new Date().toISOString(),
      },
    });

    await expect(dismiss()).rejects.toThrow("already started");
  });

  it("does not let a cancelled action be confirmed later", async () => {
    const pending = buildPendingPart();
    mockChatMessage({
      ...pending,
      output: { ...pending.output, confirmationState: "cancelled" },
    });

    await expect(confirm()).rejects.toThrow("cancelled");
    expect(enqueueBulkInboxActionChunk).not.toHaveBeenCalled();
  });
});

function dismiss() {
  return dismissAssistantBulkInboxActionForAccount({
    chatId: "chat-1",
    chatMessageId: "chat-message-1",
    toolCallId: "tool-1",
    emailAccountId: "ea_1",
    logger: createTestLogger(),
  });
}
