import { describe, expect, it, vi } from "vitest";
import { processThreadMessagesFallback } from "./thread-helpers";

describe("processThreadMessagesFallback", () => {
  it("calls handler for each message matching the conversationId", async () => {
    const client = mockClient([
      { id: "msg1", conversationId: "conv1" },
      { id: "msg2", conversationId: "conv1" },
      { id: "msg3", conversationId: "other" },
    ]);
    const handler = vi.fn().mockResolvedValue(null);
    const logger = { warn: vi.fn() } as any;

    await processThreadMessagesFallback({
      client: client as any,
      threadId: "conv1",
      logger,
      messageHandler: handler,
      noMessagesMessage: "No messages",
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith("msg1");
    expect(handler).toHaveBeenCalledWith("msg2");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("logs warning when no messages match the conversationId", async () => {
    const client = mockClient([{ id: "msg1", conversationId: "other" }]);
    const handler = vi.fn();
    const logger = { warn: vi.fn() } as any;

    await processThreadMessagesFallback({
      client: client as any,
      threadId: "conv1",
      logger,
      messageHandler: handler,
      noMessagesMessage: "No messages found",
    });

    expect(handler).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("No messages found", {
      threadId: "conv1",
    });
  });

  it("logs warning for rejected message handlers", async () => {
    const client = mockClient([
      { id: "msg1", conversationId: "conv1" },
      { id: "msg2", conversationId: "conv1" },
    ]);
    const error = new Error("move failed");
    const handler = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(error);
    const logger = { warn: vi.fn() } as any;

    await processThreadMessagesFallback({
      client: client as any,
      threadId: "conv1",
      logger,
      messageHandler: handler,
      noMessagesMessage: "No messages",
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to process message in thread fallback",
      { threadId: "conv1", messageId: "msg2", error },
    );
  });
});

function mockClient(messages: { id: string; conversationId: string }[]) {
  const get = vi.fn().mockResolvedValue({ value: messages });
  return {
    getClient: () => ({
      api: () => ({
        select: () => ({ get }),
      }),
    }),
    get,
  };
}
