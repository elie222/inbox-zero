import { describe, it, expect, vi, beforeEach } from "vitest";
import { getThreadsBatch } from "./thread";
import { getBatch } from "@/utils/gmail/batch";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/gmail/batch");
vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

describe("getThreadsBatch", () => {
  const logger = createTestLogger();
  const accessToken = "token";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refetches threads that failed with a retryable error", async () => {
    vi.mocked(getBatch)
      .mockResolvedValueOnce([
        {
          error: {
            code: 429,
            message: "Rate limit exceeded",
            errors: [{ reason: "rateLimitExceeded" }],
            status: "RESOURCE_EXHAUSTED",
          },
        },
      ])
      .mockResolvedValueOnce([{ id: "t1", snippet: "hi", messages: [] }]);

    const result = await getThreadsBatch(["t1"], accessToken, logger);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
    expect(getBatch).toHaveBeenCalledTimes(2);
  });

  it("skips threads with a non-retryable error instead of returning them as valid", async () => {
    vi.mocked(getBatch).mockResolvedValueOnce([
      { id: "t1", snippet: "ok", messages: [] },
      {
        error: {
          code: 404,
          message: "Not Found",
          errors: [{ reason: "notFound" }],
          status: "NOT_FOUND",
        },
      },
    ]);

    const result = await getThreadsBatch(["t1", "t2"], accessToken, logger);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
    expect(getBatch).toHaveBeenCalledTimes(1);
  });

  it("throws on a 401 batch error", async () => {
    vi.mocked(getBatch).mockResolvedValueOnce([
      {
        error: {
          code: 401,
          message: "Invalid Credentials",
          errors: [{ reason: "authError" }],
          status: "UNAUTHENTICATED",
        },
      },
    ]);

    await expect(getThreadsBatch(["t1"], accessToken, logger)).rejects.toThrow(
      "Invalid access token",
    );
  });
});
