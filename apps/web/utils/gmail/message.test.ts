import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMessagesBatch,
  hasPreviousCommunicationsWithSenderOrDomain,
} from "./message";
import { getBatch } from "@/utils/gmail/batch";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/gmail/batch");
vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("gmail-api-parse-message", () => ({
  default: vi.fn((m) => m),
}));

describe("getMessagesBatch", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should retry on retryable 403 error (rate limit)", async () => {
    const messageIds = ["id1"];
    const accessToken = "token";

    // First attempt fails with rate limit
    // Second attempt succeeds
    vi.mocked(getBatch)
      .mockResolvedValueOnce([
        {
          error: {
            code: 403,
            message: "Rate limit exceeded",
            errors: [{ reason: "rateLimitExceeded" }],
            status: "PERMISSION_DENIED",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "id1",
          threadId: "thread1",
          payload: { headers: [] },
        },
      ]);

    const result = await getMessagesBatch({ messageIds, accessToken, logger });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("id1");
    expect(getBatch).toHaveBeenCalledTimes(2);
  });

  it("should not retry on non-retryable 403 error (insufficient permissions)", async () => {
    const messageIds = ["id1"];
    const accessToken = "token";

    vi.mocked(getBatch).mockResolvedValueOnce([
      {
        error: {
          code: 403,
          message: "Insufficient Permission",
          errors: [{ reason: "insufficientPermissions" }],
          status: "PERMISSION_DENIED",
        },
      },
    ]);

    const result = await getMessagesBatch({ messageIds, accessToken, logger });

    expect(result).toHaveLength(0);
    expect(getBatch).toHaveBeenCalledTimes(1);
  });

  it("should retry on generic retryable errors", async () => {
    const messageIds = ["id1"];
    const accessToken = "token";

    vi.mocked(getBatch)
      .mockResolvedValueOnce([
        {
          error: {
            code: 500,
            message: "Internal Server Error",
            errors: [],
            status: "INTERNAL",
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "id1",
          threadId: "thread1",
          payload: { headers: [] },
        },
      ]);

    const result = await getMessagesBatch({ messageIds, accessToken, logger });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("id1");
    expect(getBatch).toHaveBeenCalledTimes(2);
  });

  it("should retry rate-limited messages in smaller chunks", async () => {
    const messageIds = Array.from(
      { length: 12 },
      (_, index) => `id${index + 1}`,
    );
    const accessToken = "token";

    vi.mocked(getBatch)
      .mockResolvedValueOnce(
        messageIds.map(() => ({
          error: {
            code: 429,
            message: "Too many concurrent requests for user",
            errors: [{ reason: "rateLimitExceeded" }],
            status: "RESOURCE_EXHAUSTED",
          },
        })),
      )
      .mockResolvedValueOnce(
        messageIds.slice(0, 10).map((id) => ({
          id,
          threadId: `${id}-thread`,
          payload: { headers: [] },
        })),
      )
      .mockResolvedValueOnce(
        messageIds.slice(10).map((id) => ({
          id,
          threadId: `${id}-thread`,
          payload: { headers: [] },
        })),
      );

    const result = await getMessagesBatch({ messageIds, accessToken, logger });

    expect(result).toHaveLength(12);
    expect(getBatch).toHaveBeenCalledTimes(3);
    expect(vi.mocked(getBatch).mock.calls.map(([ids]) => ids.length)).toEqual([
      12, 10, 2,
    ]);
  });
});

describe("hasPreviousCommunicationsWithSenderOrDomain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts prior sent history for public-email senders by searching both from and to", async () => {
    const listMessages = vi.fn().mockResolvedValue({
      data: {
        messages: [
          { id: "current-message", threadId: "thread-1" },
          { id: "prior-sent-message", threadId: "thread-2" },
        ],
      },
    });
    const gmail = {
      users: {
        messages: {
          list: listMessages,
        },
      },
    } as any;
    const date = new Date("2026-04-22T12:34:56.789Z");
    const beforeTimestamp = Math.floor(date.getTime() / 1000);

    const result = await hasPreviousCommunicationsWithSenderOrDomain(gmail, {
      from: "mutual.contact@gmail.com",
      date,
      messageId: "current-message",
    });

    expect(result).toBe(true);
    expect(listMessages).toHaveBeenCalledWith({
      userId: "me",
      maxResults: 4,
      q: `(from:mutual.contact@gmail.com OR to:mutual.contact@gmail.com) before:${beforeTimestamp}`,
      pageToken: undefined,
      labelIds: undefined,
    });
  });

  it("searches company senders by domain and ignores the current message", async () => {
    const listMessages = vi.fn().mockResolvedValue({
      data: {
        messages: [{ id: "current-message", threadId: "thread-1" }],
      },
    });
    const gmail = {
      users: {
        messages: {
          list: listMessages,
        },
      },
    } as any;
    const date = new Date("2026-04-22T12:34:56.789Z");
    const beforeTimestamp = Math.floor(date.getTime() / 1000);

    const result = await hasPreviousCommunicationsWithSenderOrDomain(gmail, {
      from: "introducer@acme.example",
      date,
      messageId: "current-message",
    });

    expect(result).toBe(false);
    expect(listMessages).toHaveBeenCalledWith({
      userId: "me",
      maxResults: 4,
      q: `(from:acme.example OR to:acme.example) before:${beforeTimestamp}`,
      pageToken: undefined,
      labelIds: undefined,
    });
  });
});
