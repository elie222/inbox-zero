import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  envMock,
  captureExceptionMock,
  enforceRetentionMock,
  enforceDraftSentTextRetentionMock,
} = vi.hoisted(() => ({
  envMock: {
    CRON_SECRET: "cron-secret",
    REASONING_RETENTION_DAYS: 30,
    DRAFT_SENT_TEXT_RETENTION_DAYS: 14,
  },
  captureExceptionMock: vi.fn(),
  enforceRetentionMock: vi.fn(),
  enforceDraftSentTextRetentionMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/privacy/reasoning-retention", () => ({
  enforceConfiguredReasoningRetention: (...args: unknown[]) =>
    enforceRetentionMock(...args),
  enforceDraftSentTextRetention: (...args: unknown[]) =>
    enforceDraftSentTextRetentionMock(...args),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET, POST } from "./route";

describe("reasoning retention cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
    envMock.REASONING_RETENTION_DAYS = 30;
    envMock.DRAFT_SENT_TEXT_RETENTION_DAYS = 14;
    enforceRetentionMock.mockResolvedValue({
      skipped: false,
      executedRules: 3,
    });
    enforceDraftSentTextRetentionMock.mockResolvedValue({
      draftSendLogs: 4,
    });
  });

  it("rejects GET requests without the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/reasoning-retention"),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(enforceRetentionMock).not.toHaveBeenCalled();
    expect(enforceDraftSentTextRetentionMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("runs retention for GET requests with the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/reasoning-retention", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reasoning: {
        skipped: false,
        executedRules: 3,
      },
      draftSentText: {
        draftSendLogs: 4,
      },
    });
    expect(enforceRetentionMock).toHaveBeenCalledWith({
      days: 30,
      logger: expect.anything(),
    });
    expect(enforceDraftSentTextRetentionMock).toHaveBeenCalledWith({
      days: 14,
      logger: expect.anything(),
    });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("rejects POST requests without the cron secret in the body", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cron/reasoning-retention", {
        method: "POST",
        body: JSON.stringify({ CRON_SECRET: "wrong-secret" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(enforceRetentionMock).not.toHaveBeenCalled();
    expect(enforceDraftSentTextRetentionMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("runs retention for POST requests with the cron secret in the body", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cron/reasoning-retention", {
        method: "POST",
        body: JSON.stringify({ CRON_SECRET: "cron-secret" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reasoning: {
        skipped: false,
        executedRules: 3,
      },
      draftSentText: {
        draftSendLogs: 4,
      },
    });
    expect(enforceRetentionMock).toHaveBeenCalledWith({
      days: 30,
      logger: expect.anything(),
    });
    expect(enforceDraftSentTextRetentionMock).toHaveBeenCalledWith({
      days: 14,
      logger: expect.anything(),
    });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
