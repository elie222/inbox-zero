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
    prisma.bulkInboxActionJob.upsert.mockResolvedValue({ id: "job-1" } as any);
  });

  it("starts one background job for the confirmed action and records its id", async () => {
    mockChatMessage(buildPendingPart());

    const result = await confirm();

    expect(prisma.bulkInboxActionJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId_toolCallId: {
            emailAccountId: "ea_1",
            toolCallId: "tool-1",
          },
        },
        create: expect.objectContaining({
          chatId: "chat-1",
          action: "archive_threads",
          search: { query: "in:inbox category:promotions" },
          instruction: "only newsletters",
        }),
      }),
    );
    const chunkToken = vi.mocked(enqueueBulkInboxActionChunk).mock.calls[0][0]
      .chunkToken;
    expect(
      vi.mocked(prisma.bulkInboxActionJob.upsert).mock.calls[0][0].create,
    ).toMatchObject({ chunkToken });
    expect(result.confirmationResult?.jobId).toBe("job-1");

    const confirmedParts = (
      prisma.chatMessage.updateMany.mock.calls[1][0] as any
    ).data.parts;
    expect(confirmedParts[0].output).toMatchObject({
      confirmationState: "confirmed",
      confirmationResult: { jobId: "job-1" },
    });
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
    expect(prisma.bulkInboxActionJob.upsert).not.toHaveBeenCalled();
    expect(enqueueBulkInboxActionChunk).not.toHaveBeenCalled();
  });

  it("returns the card to pending when the job cannot be queued", async () => {
    mockChatMessage(buildPendingPart());
    vi.mocked(enqueueBulkInboxActionChunk).mockRejectedValue(
      new Error("queue down"),
    );

    await expect(confirm()).rejects.toThrow("Failed to start the bulk action");
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
  prisma.chatMessage.findFirst.mockResolvedValue({
    id: "chat-message-1",
    chatId: "chat-1",
    updatedAt: new Date("2026-11-10T00:00:00.000Z"),
    parts: [part],
  } as any);
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
