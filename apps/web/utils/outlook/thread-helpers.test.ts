import { describe, expect, it, vi } from "vitest";
import {
  processThreadMessagesFallback,
  runThreadMessageMutation,
} from "./thread-helpers";

describe("runThreadMessageMutation", () => {
  it("limits concurrent thread mutations", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const logger = { warn: vi.fn() } as any;

    await runThreadMessageMutation({
      messageIds: ["msg1", "msg2", "msg3", "msg4"],
      threadId: "conv1",
      logger,
      failureMessage: "Failed to mutate message",
      messageHandler: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      },
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("continues when continueOnError is enabled", async () => {
    const logger = { warn: vi.fn() } as any;
    const error = new Error("move failed");

    await expect(
      runThreadMessageMutation({
        messageIds: ["msg1", "msg2"],
        threadId: "conv1",
        logger,
        failureMessage: "Failed to mutate message",
        continueOnError: true,
        messageHandler: async (messageId) => {
          if (messageId === "msg2") throw error;
        },
      }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith("Failed to mutate message", {
      threadId: "conv1",
      messageId: "msg2",
      error,
    });
  });
});

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

  it("uses bounded concurrency for fallback message processing", async () => {
    const client = mockClient([
      { id: "msg1", conversationId: "conv1" },
      { id: "msg2", conversationId: "conv1" },
      { id: "msg3", conversationId: "conv1" },
      { id: "msg4", conversationId: "conv1" },
    ]);
    const logger = { warn: vi.fn() } as any;
    let inFlight = 0;
    let maxInFlight = 0;
    const handler = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });

    await processThreadMessagesFallback({
      client: client as any,
      threadId: "conv1",
      logger,
      messageHandler: handler,
      noMessagesMessage: "No messages",
    });

    expect(handler).toHaveBeenCalledTimes(4);
    expect(maxInFlight).toBeLessThanOrEqual(3);
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
