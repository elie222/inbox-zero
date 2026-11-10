import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { confirmAssistantBulkInboxActionForAccount } from "@/utils/actions/assistant-chat-confirmation";
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
      toolCallId: "tool-1",
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

    await expect(confirm()).rejects.toThrow("Failed to start the bulk action");

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
      estimate: { threadCount: 150, isLowerBound: true },
      samples: [],
    },
  };
}
