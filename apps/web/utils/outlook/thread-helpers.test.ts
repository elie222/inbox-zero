import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import {
  processThreadMessagesFallback,
  runThreadMessageMutation,
} from "./thread-helpers";

describe("runThreadMessageMutation", () => {
  it("limits concurrent thread mutations", async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    await runThreadMessageMutation({
      messageIds: ["msg1", "msg2", "msg3", "msg4"],
      threadId: "conv1",
      logger: createTestLogger(),
      failureMessage: "Failed to mutate message",
      messageHandler: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      },
    });

    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("continues when continueOnError is enabled", async () => {
    const error = new Error("move failed");
    const messageHandler = vi.fn(async (messageId: string) => {
      if (messageId === "msg2") throw error;
    });

    await expect(
      runThreadMessageMutation({
        messageIds: ["msg1", "msg2"],
        threadId: "conv1",
        logger: createTestLogger(),
        failureMessage: "Failed to mutate message",
        continueOnError: true,
        messageHandler,
      }),
    ).resolves.toBeUndefined();

    expect(messageHandler).toHaveBeenCalledTimes(2);
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

    await processThreadMessagesFallback({
      client: client as any,
      threadId: "conv1",
      logger: createTestLogger(),
      messageHandler: handler,
      noMessagesMessage: "No messages",
    });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith("msg1");
    expect(handler).toHaveBeenCalledWith("msg2");
  });

  it("does not call handler when no messages match the conversationId", async () => {
    const client = mockClient([{ id: "msg1", conversationId: "other" }]);
    const handler = vi.fn();

    await processThreadMessagesFallback({
      client: client as any,
      threadId: "conv1",
      logger: createTestLogger(),
      messageHandler: handler,
      noMessagesMessage: "No messages found",
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("continues after rejected message handlers", async () => {
    const client = mockClient([
      { id: "msg1", conversationId: "conv1" },
      { id: "msg2", conversationId: "conv1" },
    ]);
    const error = new Error("move failed");
    const handler = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(error);

    await processThreadMessagesFallback({
      client: client as any,
      threadId: "conv1",
      logger: createTestLogger(),
      messageHandler: handler,
      noMessagesMessage: "No messages",
    });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("uses bounded concurrency for fallback message processing", async () => {
    const client = mockClient([
      { id: "msg1", conversationId: "conv1" },
      { id: "msg2", conversationId: "conv1" },
      { id: "msg3", conversationId: "conv1" },
      { id: "msg4", conversationId: "conv1" },
    ]);
    const logger = createTestLogger();
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
