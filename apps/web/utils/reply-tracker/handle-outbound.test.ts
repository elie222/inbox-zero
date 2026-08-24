import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEmailAccount,
  getMockMessage,
  createTestLogger,
} from "@/__tests__/helpers";
import { clearFollowUpLabel } from "@/utils/follow-up/labels";
import { excludeRepliedSendersFromColdEmail } from "@/utils/cold-email/exclude-replied-sender";
import { enqueueRepliedSenderExclusionRetry } from "@/utils/cold-email/exclude-replied-sender-retry";
import {
  acquireOutboundMessageLock,
  clearOutboundMessageLock,
  markOutboundMessageProcessed,
} from "@/utils/redis/message-processing";
import { cleanupThreadAIDrafts, trackSentDraftStatus } from "./draft-tracking";
import { handleOutboundMessage } from "./handle-outbound";
import { handleOutboundReply } from "./outbound";

vi.mock("./draft-tracking", () => ({
  cleanupThreadAIDrafts: vi.fn(),
  trackSentDraftStatus: vi.fn(),
}));
vi.mock("./outbound", () => ({
  handleOutboundReply: vi.fn(),
}));
vi.mock("./error-logging", () => ({
  logReplyTrackerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/follow-up/labels", () => ({
  clearFollowUpLabel: vi.fn(),
}));
vi.mock("@/utils/cold-email/exclude-replied-sender", () => ({
  excludeRepliedSendersFromColdEmail: vi.fn(),
}));
vi.mock("@/utils/cold-email/exclude-replied-sender-retry", () => ({
  enqueueRepliedSenderExclusionRetry: vi.fn(),
}));
vi.mock("@/utils/redis/message-processing", () => ({
  acquireOutboundMessageLock: vi.fn(),
  clearOutboundMessageLock: vi.fn(),
  markOutboundMessageProcessed: vi.fn(),
}));

describe("handleOutboundMessage", () => {
  const logger = createTestLogger();
  const emailAccount = getEmailAccount();
  const message = getMockMessage({ id: "message-1", threadId: "thread-1" });
  const provider = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquireOutboundMessageLock).mockResolvedValue("lock-token-1");
    vi.mocked(trackSentDraftStatus).mockResolvedValue(undefined);
    vi.mocked(handleOutboundReply).mockResolvedValue(undefined);
    vi.mocked(cleanupThreadAIDrafts).mockResolvedValue(undefined);
    vi.mocked(clearFollowUpLabel).mockResolvedValue(undefined);
    vi.mocked(excludeRepliedSendersFromColdEmail).mockResolvedValue(undefined);
    vi.mocked(enqueueRepliedSenderExclusionRetry).mockResolvedValue(true);
    vi.mocked(markOutboundMessageProcessed).mockResolvedValue(true);
    vi.mocked(clearOutboundMessageLock).mockResolvedValue(true);
  });

  it("skips when the outbound message is already processed", async () => {
    vi.mocked(acquireOutboundMessageLock).mockResolvedValue(null);

    await handleOutboundMessage({
      emailAccount,
      message: message as any,
      provider,
      logger,
    });

    expect(trackSentDraftStatus).not.toHaveBeenCalled();
    expect(handleOutboundReply).not.toHaveBeenCalled();
    expect(markOutboundMessageProcessed).not.toHaveBeenCalled();
  });

  it("marks the outbound message as processed when core tracking succeeds", async () => {
    await handleOutboundMessage({
      emailAccount,
      message: message as any,
      provider,
      logger,
    });

    expect(trackSentDraftStatus).toHaveBeenCalled();
    expect(handleOutboundReply).toHaveBeenCalled();
    expect(markOutboundMessageProcessed).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      messageId: message.id,
      lockToken: "lock-token-1",
    });
    expect(clearOutboundMessageLock).not.toHaveBeenCalled();
  });

  it("keeps the processed marker even if cleanup fails after tracking succeeds", async () => {
    vi.mocked(cleanupThreadAIDrafts).mockRejectedValue(
      new Error("cleanup failed"),
    );

    await handleOutboundMessage({
      emailAccount,
      message: message as any,
      provider,
      logger,
    });

    expect(markOutboundMessageProcessed).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      messageId: message.id,
      lockToken: "lock-token-1",
    });
    expect(clearOutboundMessageLock).not.toHaveBeenCalled();
  });

  it("un-pins cold email senders the user has replied to", async () => {
    await handleOutboundMessage({
      emailAccount,
      message: message as any,
      provider,
      logger,
    });

    expect(excludeRepliedSendersFromColdEmail).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      message,
      provider,
      logger: expect.anything(),
    });
  });

  it("queues a focused retry if un-pinning the sender fails", async () => {
    vi.mocked(excludeRepliedSendersFromColdEmail).mockRejectedValue(
      new Error("exclude failed"),
    );

    await handleOutboundMessage({
      emailAccount,
      message: message as any,
      provider,
      logger,
    });

    expect(clearFollowUpLabel).toHaveBeenCalled();
    expect(enqueueRepliedSenderExclusionRetry).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      messageId: message.id,
      attempt: 1,
    });
    expect(markOutboundMessageProcessed).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      messageId: message.id,
      lockToken: "lock-token-1",
    });
    expect(clearOutboundMessageLock).not.toHaveBeenCalled();
  });

  it("clears the outbound message lock when core tracking fails", async () => {
    vi.mocked(handleOutboundReply).mockRejectedValue(new Error("reply failed"));

    await handleOutboundMessage({
      emailAccount,
      message: message as any,
      provider,
      logger,
    });

    expect(markOutboundMessageProcessed).not.toHaveBeenCalled();
    expect(clearOutboundMessageLock).toHaveBeenCalledWith({
      emailAccountId: emailAccount.id,
      messageId: message.id,
      lockToken: "lock-token-1",
    });
  });
});
