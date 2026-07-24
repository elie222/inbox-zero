import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutlookClient } from "@/utils/outlook/client";
import { createTestLogger } from "@/__tests__/helpers";
import { moveMessagesForSenders, moveThreadsInBatches } from "./batch";

const mockGetFolderIds = vi.fn();
const mockUpdateEmailMessagesForSender = vi.fn();
const mockPublishBulkActionToTinybird = vi.fn();

vi.mock("@/utils/outlook/message", () => ({
  getFolderIds: (...args: Parameters<typeof mockGetFolderIds>) =>
    mockGetFolderIds(...args),
}));

vi.mock("@/utils/email/bulk-action-tracking", () => ({
  updateEmailMessagesForSender: (
    ...args: Parameters<typeof mockUpdateEmailMessagesForSender>
  ) => mockUpdateEmailMessagesForSender(...args),
  publishBulkActionToTinybird: (
    ...args: Parameters<typeof mockPublishBulkActionToTinybird>
  ) => mockPublishBulkActionToTinybird(...args),
}));

describe("moveMessagesForSenders", () => {
  beforeEach(() => {
    mockGetFolderIds.mockReset();
    mockUpdateEmailMessagesForSender.mockReset();
    mockPublishBulkActionToTinybird.mockReset();
  });

  it("tracks successful Outlook message moves before surfacing a partial batch failure", async () => {
    mockGetFolderIds.mockResolvedValue({
      inbox: "inbox-folder-id",
    });

    const client = createMockOutlookClient({
      listMessages: async () => ({
        value: [
          { id: "message-1", conversationId: "thread-1" },
          { id: "message-2", conversationId: "thread-2" },
        ],
      }),
      batchPost: async () => ({
        responses: [
          { id: "archive-0", status: 201, body: {} },
          {
            id: "archive-1",
            status: 429,
            body: { error: { message: "Rate limited" } },
          },
        ],
      }),
    });

    await expect(
      moveMessagesForSenders({
        client,
        senders: ["sender@example.com"],
        destinationId: "archive",
        action: "archive",
        ownerEmail: "owner@example.com",
        emailAccountId: "account-1",
        continueOnError: false,
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("Graph batch returned one or more error responses.");

    expect(mockUpdateEmailMessagesForSender).toHaveBeenCalledWith({
      sender: "sender@example.com",
      messageIds: ["message-1"],
      emailAccountId: "account-1",
      action: "archive",
    });
    expect(mockPublishBulkActionToTinybird).toHaveBeenCalledWith({
      threadIds: ["thread-1"],
      action: "archive",
      ownerEmail: "owner@example.com",
    });
  });

  it("moves Outlook messages in small batches to avoid mailbox concurrency throttling", async () => {
    const messages = Array.from({ length: 9 }, (_, index) => ({
      id: `message-${index + 1}`,
      conversationId: `thread-${index + 1}`,
    }));
    const batchPost = vi.fn(
      async (body: {
        requests: Array<{ id: string; url: string; method: string }>;
      }) => ({
        responses: body.requests.map((request) => ({
          id: request.id,
          status: 201,
          body: {},
        })),
      }),
    );
    const client = createMockOutlookClient({
      listMessages: async () => ({
        value: messages,
      }),
      batchPost,
    });

    const movedCount = await moveMessagesForSenders({
      client,
      senders: ["sender@example.com"],
      destinationId: "deleteditems",
      action: "trash",
      ownerEmail: "owner@example.com",
      emailAccountId: "account-1",
      logger: createTestLogger(),
    });

    expect(movedCount).toBe(9);
    expect(batchPost).toHaveBeenCalledTimes(3);
    expect(batchPost.mock.calls.map(([body]) => body.requests.length)).toEqual([
      4, 4, 1,
    ]);
    expect(mockUpdateEmailMessagesForSender).toHaveBeenCalledWith({
      sender: "sender@example.com",
      messageIds: messages.map((message) => message.id),
      emailAccountId: "account-1",
      action: "trash",
    });
  });
});

describe("moveThreadsInBatches", () => {
  beforeEach(() => {
    mockPublishBulkActionToTinybird.mockReset();
  });

  it("returns thread-level results from Outlook batch responses", async () => {
    const client = createMockOutlookClient({
      listMessages: async () => ({ value: [] }),
      batchPost: async () => ({
        responses: [
          { id: "archive-0", status: 201, body: {} },
          {
            id: "archive-1",
            status: 429,
            body: { error: { message: "Rate limited" } },
          },
        ],
      }),
    });

    const result = await moveThreadsInBatches({
      client,
      threads: [
        { threadId: "thread-1", messageIds: ["message-1"] },
        { threadId: "thread-2", messageIds: ["message-2"] },
      ],
      destinationId: "archive",
      ownerEmail: "owner@example.com",
      logger: createTestLogger(),
    });

    expect(result).toEqual({
      succeededThreadIds: ["thread-1"],
      failedThreadIds: ["thread-2"],
    });
    expect(mockPublishBulkActionToTinybird).toHaveBeenCalledWith({
      threadIds: ["thread-1"],
      action: "archive",
      ownerEmail: "owner@example.com",
    });
  });

  it("stops sending Outlook batches after a rate-limit response", async () => {
    const batchPost = vi.fn(
      async (body: {
        requests: Array<{ id: string; url: string; method: string }>;
      }) => ({
        responses: body.requests.map((request) => ({
          id: request.id,
          status: 429,
          body: { error: { message: "Rate limited" } },
        })),
      }),
    );
    const client = createMockOutlookClient({
      listMessages: async () => ({ value: [] }),
      batchPost,
    });
    const threads = Array.from({ length: 5 }, (_, index) => ({
      threadId: `thread-${index + 1}`,
      messageIds: [`message-${index + 1}`],
    }));

    const result = await moveThreadsInBatches({
      client,
      threads,
      destinationId: "archive",
      ownerEmail: "owner@example.com",
      logger: createTestLogger(),
    });

    expect(batchPost).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      succeededThreadIds: [],
      failedThreadIds: threads.map((thread) => thread.threadId),
    });
  });
});

function createMockOutlookClient({
  listMessages,
  batchPost,
}: {
  listMessages: () => Promise<{
    value: Array<{ id?: string | null; conversationId?: string | null }>;
    "@odata.nextLink"?: string;
  }>;
  batchPost: (body: unknown) => Promise<{
    responses: Array<{ id: string; status: number; body?: unknown }>;
  }>;
}): OutlookClient {
  const api = vi.fn((path: string) => {
    if (path === "/me/messages") {
      return {
        filter: () => ({
          top: () => ({
            select: () => ({
              get: listMessages,
            }),
          }),
        }),
      };
    }

    if (path === "/$batch") {
      return {
        post: batchPost,
      };
    }

    throw new Error(`Unexpected API path: ${path}`);
  });

  return {
    getClient: vi.fn(() => ({ api })),
  } as unknown as OutlookClient;
}
