import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import { processHistoryForUser } from "@/utils/webhook/outlook/process-history";
import { getWebhookEmailAccount } from "@/utils/webhook/validate-webhook-account";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  env: { MICROSOFT_WEBHOOK_CLIENT_STATE: "valid-state" },
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await import("@/__tests__/helpers");
  return createWithErrorTestMiddleware();
});
vi.mock("@/utils/redis", () => ({
  redis: { exists: vi.fn(), set: vi.fn(), publish: vi.fn() },
}));
vi.mock("@/utils/webhook/outlook/process-history", () => ({
  processHistoryForUser: vi.fn(),
}));
vi.mock("@/utils/webhook/validate-webhook-account", () => ({
  getWebhookEmailAccount: vi.fn(),
}));
vi.mock("@/utils/webhook/error-handler", () => ({
  handleWebhookError: vi.fn(),
}));
vi.mock("@/app/api/outlook/webhook/process-lifecycle", () => ({
  processOutlookLifecycleNotification: vi.fn(),
}));
vi.mock("@/utils/logger-flush", () => ({
  runWithBackgroundLoggerFlush: ({ task }: { task: () => Promise<void> }) =>
    task(),
}));

describe("Outlook realtime webhook hints", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getWebhookEmailAccount).mockResolvedValue({
      id: "account-a",
    } as never);
    vi.mocked(redis.exists).mockResolvedValue(1);
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(processHistoryForUser).mockResolvedValue(undefined);
  });
  it("rejects unverified notifications without hints or automation", async () => {
    expect((await POST(request("invalid"))).status).toBe(403);
    expect(redis.publish).not.toHaveBeenCalled();
    expect(getWebhookEmailAccount).not.toHaveBeenCalled();
    expect(processHistoryForUser).not.toHaveBeenCalled();
  });
  it("uses resolved subscription ownership for hints and preserves processor input", async () => {
    expect((await POST(request())).status).toBe(200);
    await vi.waitFor(() =>
      expect(processHistoryForUser).toHaveBeenCalledOnce(),
    );
    expect(getWebhookEmailAccount).toHaveBeenCalledWith(
      { watchEmailsSubscriptionId: "subscription-a" },
      expect.anything(),
    );
    expect(redis.publish).toHaveBeenCalledWith("local-mail:account-a", "{}");
    expect(processHistoryForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: "subscription-a",
        resourceData: { id: "message-a" },
        preloadedEmailAccount: { id: "account-a" },
      }),
    );
  });
  it.each([
    "no-interest",
    "redis-failure",
  ])("preserves automation for %s", async (scenario) => {
    if (scenario === "no-interest")
      vi.mocked(redis.exists).mockResolvedValue(0);
    else vi.mocked(redis.exists).mockRejectedValue(new Error("Unavailable"));
    expect((await POST(request())).status).toBe(200);
    await vi.waitFor(() =>
      expect(processHistoryForUser).toHaveBeenCalledOnce(),
    );
    expect(redis.publish).not.toHaveBeenCalled();
  });
  it("does not delay later automation notifications while Redis is stalled", async () => {
    let release!: (value: number) => void;
    const blockedRedis = new Promise<number>((resolve) => {
      release = resolve;
    });
    vi.mocked(redis.exists).mockReturnValue(blockedRedis);
    try {
      expect((await POST(request("valid-state", 2))).status).toBe(200);
      await vi.waitFor(() =>
        expect(processHistoryForUser).toHaveBeenCalledTimes(2),
      );
      expect(redis.publish).not.toHaveBeenCalled();
    } finally {
      release(0);
      await blockedRedis;
    }
  });

  it("does not publish when subscription ownership is unknown", async () => {
    vi.mocked(getWebhookEmailAccount).mockResolvedValue(null);
    await POST(request());
    await vi.waitFor(() =>
      expect(processHistoryForUser).toHaveBeenCalledOnce(),
    );
    expect(redis.publish).not.toHaveBeenCalled();
  });
});
function request(clientState = "valid-state", count = 1) {
  return new NextRequest("http://localhost/api/outlook/webhook", {
    method: "POST",
    body: JSON.stringify({
      value: Array.from({ length: count }, (_, index) => ({
        subscriptionId: "subscription-a",
        clientState,
        changeType: "created",
        resourceData: { id: index ? `message-${index}` : "message-a" },
      })),
    }),
  });
}
