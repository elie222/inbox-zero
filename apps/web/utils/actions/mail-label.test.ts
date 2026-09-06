import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { redis } from "@/utils/redis";
import { applyThreadLabelsAction } from "@/utils/actions/mail-label";

vi.mock("@/utils/prisma");
vi.mock("@/utils/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
const { modify, getLabel } = vi.hoisted(() => ({
  modify: vi.fn(),
  getLabel: vi.fn(),
}));
vi.mock("@/utils/email-account-client", () => ({
  getGmailClientForEmail: vi.fn(async () => ({
    users: { threads: { modify }, labels: { get: getLabel } },
  })),
}));

describe("manual thread labels", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(redis.get).mockResolvedValue(null);
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "user@example.com",
        userId: "user-1",
        provider: "google",
      }),
    );
    getLabel.mockResolvedValue({
      data: { id: "label-1", name: "Projects", type: "user" },
    });
    modify.mockResolvedValue({ data: {} });
  });

  afterEach(() => vi.useRealTimers());

  it("adds a label to each whole conversation without removing inbox or other labels", async () => {
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1", "thread-2", "thread-1"],
      labelId: "label-1",
    });
    expect(result?.data).toEqual({
      succeededThreadIds: ["thread-1", "thread-2"],
      failedThreadIds: [],
    });
    expect(modify).toHaveBeenCalledTimes(2);
    for (const id of ["thread-1", "thread-2"]) {
      expect(modify).toHaveBeenCalledWith({
        userId: "me",
        id,
        requestBody: { addLabelIds: ["label-1"], removeLabelIds: undefined },
      });
    }
  });

  it("removes inbox while applying the destination label when moving", async () => {
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1"],
      labelId: "label-1",
      removeFromInbox: true,
    });

    expect(result?.data).toEqual({
      succeededThreadIds: ["thread-1"],
      failedThreadIds: [],
    });
    expect(modify).toHaveBeenCalledWith({
      userId: "me",
      id: "thread-1",
      requestBody: {
        addLabelIds: ["label-1"],
        removeLabelIds: ["INBOX"],
      },
    });
  });

  it("reports partial failures so successful conversations are not retried", async () => {
    modify.mockRejectedValueOnce(new Error("Invalid request"));
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1", "thread-2"],
      labelId: "label-1",
    });
    expect(result?.data).toEqual({
      succeededThreadIds: ["thread-2"],
      failedThreadIds: ["thread-1"],
    });
  });

  it("retries a transient label lookup failure", async () => {
    vi.useFakeTimers();
    getLabel.mockRejectedValueOnce(
      Object.assign(new Error("Unavailable"), { status: 503 }),
    );
    const pendingResult = applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1"],
      labelId: "label-1",
    });
    await vi.runAllTimersAsync();
    const result = await pendingResult;
    expect(getLabel).toHaveBeenCalledTimes(2);
    expect(result?.data?.succeededThreadIds).toEqual(["thread-1"]);
  });

  it("does not call Gmail while the account is rate limited", async () => {
    vi.mocked(redis.get).mockResolvedValue(
      JSON.stringify({
        provider: "google",
        retryAt: new Date(Date.now() + 120_000).toISOString(),
        detectedAt: new Date().toISOString(),
      }),
    );
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1"],
      labelId: "label-1",
    });
    expect(result?.serverError).toBeTruthy();
    expect(getLabel).not.toHaveBeenCalled();
    expect(modify).not.toHaveBeenCalled();
  });

  it("records throttling and skips later writes while preserving partial success", async () => {
    let rateLimitState: string | null = null;
    vi.mocked(redis.get).mockImplementation(async () => rateLimitState);
    vi.mocked(redis.set).mockImplementation(async (_key, value) => {
      rateLimitState = String(value);
      return "OK";
    });
    modify.mockRejectedValueOnce(
      Object.assign(new Error("Rate limit exceeded"), {
        status: 429,
        response: { headers: { "retry-after": "120" } },
      }),
    );
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: Array.from({ length: 6 }, (_, index) => `thread-${index + 1}`),
      labelId: "label-1",
    });
    expect(redis.set).toHaveBeenCalledWith(
      "email-provider-rate-limit:account-1",
      expect.any(String),
      expect.objectContaining({ ex: expect.any(Number) }),
    );
    expect(modify).toHaveBeenCalledTimes(5);
    expect(result?.data).toEqual({
      succeededThreadIds: ["thread-2", "thread-3", "thread-4", "thread-5"],
      failedThreadIds: ["thread-1", "thread-6"],
    });
  });

  it("rejects system labels before modifying conversations", async () => {
    getLabel.mockResolvedValue({ data: { id: "TRASH", type: "system" } });
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1"],
      labelId: "TRASH",
    });
    expect(result?.serverError).toBe("Select a user-created Gmail label.");
    expect(modify).not.toHaveBeenCalled();
  });

  it("rejects unsupported accounts", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "user@example.com",
        userId: "user-1",
        provider: "microsoft",
      }),
    );
    const result = await applyThreadLabelsAction("account-1", {
      threadIds: ["thread-1"],
      labelId: "label-1",
    });
    expect(result?.serverError).toBe(
      "Manual labeling is available for Gmail accounts.",
    );
    expect(modify).not.toHaveBeenCalled();
  });
});
