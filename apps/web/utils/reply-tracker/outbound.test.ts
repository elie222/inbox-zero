import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleOutboundReply } from "./outbound";
import prisma from "@/utils/__mocks__/prisma";
import { aiDetermineThreadStatus } from "@/utils/ai/reply/determine-thread-status";
import { applyThreadStatusLabel } from "./label-helpers";
import { updateThreadTrackers } from "@/utils/reply-tracker/handle-conversation-status";
import {
  getEmailAccount,
  getMockMessage,
  createTestLogger,
} from "@/__tests__/helpers";
import { SystemType } from "@/generated/prisma/enums";
import {
  acquireOutboundThreadStatusLock,
  clearOutboundThreadStatusLock,
  markOutboundThreadStatusProcessed,
} from "@/utils/redis/outbound-thread-status";

vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/reply/determine-thread-status");
vi.mock("./label-helpers");
vi.mock("@/utils/reply-tracker/handle-conversation-status");
vi.mock("@/utils/redis/outbound-thread-status", () => ({
  acquireOutboundThreadStatusLock: vi.fn(),
  clearOutboundThreadStatusLock: vi.fn(),
  markOutboundThreadStatusProcessed: vi.fn(),
}));
vi.mock("server-only", () => ({}));

describe("handleOutboundReply", () => {
  const logger = createTestLogger();
  const emailAccount = getEmailAccount();
  const provider = {
    getThreadMessages: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquireOutboundThreadStatusLock).mockResolvedValue(
      "lock-token-1",
    );
    vi.mocked(markOutboundThreadStatusProcessed).mockResolvedValue(true);
    vi.mocked(clearOutboundThreadStatusLock).mockResolvedValue(true);
  });

  it("should proceed with processing even if the message is not the latest in the thread", async () => {
    const message = getMockMessage({ id: "sent-msg-1", threadId: "thread1" });
    const latestMessage = getMockMessage({
      id: "newer-msg-2",
      threadId: "thread1",
    });

    // Mock all conversation status rules enabled
    prisma.rule.findMany.mockResolvedValue([
      { systemType: SystemType.AWAITING_REPLY },
      { systemType: SystemType.TO_REPLY },
      { systemType: SystemType.ACTIONED },
    ] as any);

    // Mock thread messages - sortByInternalDate sorts asc by default (oldest first)
    // We mock getThreadMessages to return messages that our internal sortByInternalDate will sort
    provider.getThreadMessages.mockResolvedValue([message, latestMessage]);

    // Mock AI status
    vi.mocked(aiDetermineThreadStatus).mockResolvedValue({
      status: SystemType.AWAITING_REPLY,
      rationale: "Waiting for response",
    });

    await handleOutboundReply({
      emailAccount,
      message: message as any,
      provider: provider as any,
      logger,
    });

    // Verify it didn't return early
    expect(aiDetermineThreadStatus).toHaveBeenCalled();
    expect(applyThreadStatusLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        systemType: SystemType.AWAITING_REPLY,
      }),
    );
    expect(updateThreadTrackers).toHaveBeenCalled();
    expect(markOutboundThreadStatusProcessed).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      lockToken: "lock-token-1",
    });
    expect(clearOutboundThreadStatusLock).not.toHaveBeenCalled();
  });

  it("should return early if outbound tracking is disabled", async () => {
    const message = getMockMessage({ id: "sent-msg-1", threadId: "thread1" });

    // Mock no enabled rules
    prisma.rule.findMany.mockResolvedValue([]);

    await handleOutboundReply({
      emailAccount,
      message: message as any,
      provider: provider as any,
      logger,
    });

    expect(provider.getThreadMessages).not.toHaveBeenCalled();
    expect(aiDetermineThreadStatus).not.toHaveBeenCalled();
    expect(acquireOutboundThreadStatusLock).not.toHaveBeenCalled();
  });

  it("should return early when outbound thread status is already processed", async () => {
    const message = getMockMessage({ id: "sent-msg-1", threadId: "thread1" });

    prisma.rule.findMany.mockResolvedValue([
      { systemType: SystemType.TO_REPLY },
    ] as any);
    vi.mocked(acquireOutboundThreadStatusLock).mockResolvedValue(null);

    await handleOutboundReply({
      emailAccount,
      message: message as any,
      provider: provider as any,
      logger,
    });

    expect(provider.getThreadMessages).not.toHaveBeenCalled();
    expect(aiDetermineThreadStatus).not.toHaveBeenCalled();
    expect(markOutboundThreadStatusProcessed).not.toHaveBeenCalled();
    expect(clearOutboundThreadStatusLock).not.toHaveBeenCalled();
  });

  it("should skip labeling when the determined status rule is disabled", async () => {
    const message = getMockMessage({ id: "sent-msg-1", threadId: "thread1" });

    // Only TO_REPLY is enabled — AWAITING_REPLY is not
    prisma.rule.findMany.mockResolvedValue([
      { systemType: SystemType.TO_REPLY },
    ] as any);

    provider.getThreadMessages.mockResolvedValue([message]);

    // AI picks AWAITING_REPLY, but that rule is disabled
    vi.mocked(aiDetermineThreadStatus).mockResolvedValue({
      status: SystemType.AWAITING_REPLY,
      rationale: "Waiting for response",
    });

    await handleOutboundReply({
      emailAccount,
      message: message as any,
      provider: provider as any,
      logger,
    });

    expect(aiDetermineThreadStatus).toHaveBeenCalled();
    expect(applyThreadStatusLabel).not.toHaveBeenCalled();
    expect(updateThreadTrackers).not.toHaveBeenCalled();
  });

  it("should clear idempotency lock if processing exits early", async () => {
    const message = getMockMessage({ id: "sent-msg-1", threadId: "thread1" });

    prisma.rule.findMany.mockResolvedValue([
      { systemType: SystemType.TO_REPLY },
    ] as any);
    provider.getThreadMessages.mockResolvedValue([]);

    await handleOutboundReply({
      emailAccount,
      message: message as any,
      provider: provider as any,
      logger,
    });

    expect(aiDetermineThreadStatus).not.toHaveBeenCalled();
    expect(markOutboundThreadStatusProcessed).not.toHaveBeenCalled();
    expect(clearOutboundThreadStatusLock).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      lockToken: "lock-token-1",
    });
  });
});
