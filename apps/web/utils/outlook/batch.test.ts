import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutlookClient } from "@/utils/outlook/client";
import { createTestLogger } from "@/__tests__/helpers";
import { moveMessagesForSenders } from "./batch";

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
