import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("server-only", () => ({}));

const testLogger = createTestLogger();

const { envMock, captureExceptionMock, enforceRetentionMock } = vi.hoisted(
  () => ({
    envMock: {
      CRON_SECRET: "cron-secret",
      REASONING_RETENTION_DAYS: 30,
    },
    captureExceptionMock: vi.fn(),
    enforceRetentionMock: vi.fn(),
  }),
);

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/privacy/reasoning-retention", () => ({
  enforceConfiguredReasoningRetention: (...args: unknown[]) =>
    enforceRetentionMock(...args),
}));

vi.mock("@/utils/middleware", () => ({
  withError:
    (
      _scope: string,
      handler: (
        request: Request & {
          logger: typeof testLogger;
        },
      ) => Promise<Response>,
    ) =>
    async (request: Request) => {
      const requestWithLogger = request as Request & {
        logger: typeof testLogger;
      };
      requestWithLogger.logger = testLogger;
      return handler(requestWithLogger);
    },
}));

import { GET, POST } from "./route";

describe("reasoning retention cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
    envMock.REASONING_RETENTION_DAYS = 30;
    enforceRetentionMock.mockResolvedValue({
      deletedCount: 3,
      retentionDays: 30,
    });
  });

  it("rejects GET requests without the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/reasoning-retention"),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(enforceRetentionMock).not.toHaveBeenCalled();
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
      deletedCount: 3,
      retentionDays: 30,
    });
    expect(enforceRetentionMock).toHaveBeenCalledWith({
      days: 30,
      logger: testLogger,
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
      deletedCount: 3,
      retentionDays: 30,
    });
    expect(enforceRetentionMock).toHaveBeenCalledWith({
      days: 30,
      logger: testLogger,
    });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
