import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { OutlookClient } from "@/utils/outlook/client";
import { extractErrorInfo } from "@/utils/outlook/retry";
import {
  listThreadMessages,
  OutlookThreadPaginationError,
  processThreadMessagesFallback,
  runThreadMessageMutation,
} from "./thread-helpers";

vi.mock("@/utils/outlook/retry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/outlook/retry")>()),
  withMicrosoftGraphRetry: <T>(operation: () => Promise<T>) => operation(),
}));

describe("listThreadMessages", () => {
  it("lists every page of a conversation within the requested folder", async () => {
    const { client, get, filters } = createListClient([
      {
        value: [{ id: "m1" }, { id: "m2" }],
        "@odata.nextLink":
          "https://graph.microsoft.com/v1.0/me/messages?$skip=100",
      },
      { value: [{ id: "m2" }, { id: "m3" }] },
    ]);

    const messages = await listThreadMessages({
      client,
      threadId: "conv'1",
      select: "id",
      folderId: "inbox-id",
      logger: createTestLogger(),
    });

    expect(messages.map((message) => message.id)).toEqual(["m1", "m2", "m3"]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(filters).toEqual([
      "conversationId eq 'conv''1' and parentFolderId eq 'inbox-id'",
    ]);
  });

  it("refuses to follow a next page link outside Microsoft Graph", async () => {
    const { client, get } = createListClient([
      {
        value: [{ id: "m1" }],
        "@odata.nextLink": "https://attacker.example/me/messages?$skip=100",
      },
    ]);

    await expect(
      listThreadMessages({
        client,
        threadId: "conv1",
        select: "id",
        logger: createTestLogger(),
      }),
    ).rejects.toBeInstanceOf(OutlookThreadPaginationError);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("keeps a later page's Graph throttling status visible to rate-limit handling", async () => {
    const throttled = Object.assign(new Error("Too many requests"), {
      statusCode: 429,
      code: "TooManyRequests",
    });
    const { client, get } = createListClient([
      {
        value: [{ id: "m1" }],
        "@odata.nextLink":
          "https://graph.microsoft.com/v1.0/me/messages?$skip=100",
      },
    ]);
    get.mockRejectedValueOnce(throttled);

    const error = await listThreadMessages({
      client,
      threadId: "conv1",
      select: "id",
      logger: createTestLogger(),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OutlookThreadPaginationError);
    expect(extractErrorInfo(error)).toMatchObject({
      status: 429,
      code: "TooManyRequests",
    });
  });
});

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
        throwIfAllFail: true,
        messageHandler,
      }),
    ).resolves.toBeUndefined();

    expect(messageHandler).toHaveBeenCalledTimes(2);
  });

  it("throws the provider error when every attempted mutation fails", async () => {
    const messageHandler = vi.fn().mockRejectedValue("move failed");

    await expect(
      runThreadMessageMutation({
        messageIds: ["msg1", "msg2"],
        threadId: "conv1",
        logger: createTestLogger(),
        failureMessage: "Failed to mutate message",
        continueOnError: true,
        throwIfAllFail: true,
        messageHandler,
      }),
    ).rejects.toEqual(new Error("move failed"));

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

function createListClient(
  pages: { value: { id: string }[]; "@odata.nextLink"?: string }[],
) {
  const filters: string[] = [];
  const get = vi.fn();
  for (const page of pages) get.mockResolvedValueOnce(page);
  const builder = {
    filter: (value: string) => {
      filters.push(value);
      return builder;
    },
    select: () => builder,
    top: () => builder,
    get,
  };
  const client = {
    getClient: () => ({ api: () => builder }),
  } as unknown as OutlookClient;
  return { client, get, filters };
}
