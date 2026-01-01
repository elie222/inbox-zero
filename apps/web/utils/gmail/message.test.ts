import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMessagesBatch } from "./message";
import { getBatch } from "@/utils/gmail/batch";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/gmail/batch");
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("gmail-api-parse-message", () => ({
  default: vi.fn((m) => m),
}));

describe("getMessagesBatch", () => {
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

    const result = await getMessagesBatch({ messageIds, accessToken });

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

    const result = await getMessagesBatch({ messageIds, accessToken });

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

    const result = await getMessagesBatch({ messageIds, accessToken });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("id1");
    expect(getBatch).toHaveBeenCalledTimes(2);
  });
});
