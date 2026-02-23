import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleOutboundReply } from "./outbound";
import prisma from "@/utils/__mocks__/prisma";
import { aiDetermineThreadStatus } from "@/utils/ai/reply/determine-thread-status";
import { applyThreadStatusLabel } from "./label-helpers";
import { updateThreadTrackers } from "@/utils/reply-tracker/handle-conversation-status";
import { getEmailAccount, getMockMessage } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";
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
  const logger = createScopedLogger("test");
  const emailAccount = getEmailAccount();
  const provider = {
    getThreadMessages: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquireOutboundThreadStatusLock).mockResolvedValue(true);
    vi.mocked(markOutboundThreadStatusProcessed).mockResolvedValue();
    vi.mocked(clearOutboundThreadStatusLock).mockResolvedValue();
  });

  it("should proceed with processing even if the message is not the latest in the thread", async () => {
    const message = getMockMessage({ id: "sent-msg-1", threadId: "thread1" });
    const latestMessage = getMockMessage({
      id: "newer-msg-2",
      threadId: "thread1",
    });

    // Mock tracking enabled
    prisma.rule.findFirst.mockResolvedValue({ id: "rule1" } as any);

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
    });
    expect(clearOutboundThreadStatusLock).not.toHaveBeenCalled();
  });

  it("should return early if outbound tracking is disabled", async () => {
    const message = getMockMessage({ id: "sent-msg-1", threadId: "thread1" });

    // Mock tracking disabled
    prisma.rule.findFirst.mockResolvedValue(null);

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

    prisma.rule.findFirst.mockResolvedValue({ id: "rule1" } as any);
    vi.mocked(acquireOutboundThreadStatusLock).mockResolvedValue(false);

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

  it("should clear idempotency lock if processing exits early", async () => {
    const message = getMockMessage({ id: "sent-msg-1", threadId: "thread1" });

    prisma.rule.findFirst.mockResolvedValue({ id: "rule1" } as any);
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
    });
  });
});
