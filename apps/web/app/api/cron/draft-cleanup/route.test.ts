import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const testLogger = createTestLogger();

const { envMock, captureExceptionMock, cleanupDraftsMock } = vi.hoisted(() => ({
  envMock: {
    CRON_SECRET: "cron-secret",
  },
  captureExceptionMock: vi.fn(),
  cleanupDraftsMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/ai/draft-cleanup", () => ({
  cleanupConfiguredAIDrafts: (...args: unknown[]) => cleanupDraftsMock(...args),
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

describe("draft cleanup cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
    cleanupDraftsMock.mockResolvedValue({
      deletedDrafts: 2,
      skippedDrafts: 1,
    });
  });

  it("rejects GET requests without the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/draft-cleanup"),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(cleanupDraftsMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("runs draft cleanup for GET requests with the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/draft-cleanup", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deletedDrafts: 2,
      skippedDrafts: 1,
    });
    expect(cleanupDraftsMock).toHaveBeenCalledWith({
      logger: testLogger,
    });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("rejects POST requests without the cron secret in the body", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cron/draft-cleanup", {
        method: "POST",
        body: JSON.stringify({ CRON_SECRET: "wrong-secret" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(cleanupDraftsMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("runs draft cleanup for POST requests with the cron secret in the body", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cron/draft-cleanup", {
        method: "POST",
        body: JSON.stringify({ CRON_SECRET: "cron-secret" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deletedDrafts: 2,
      skippedDrafts: 1,
    });
    expect(cleanupDraftsMock).toHaveBeenCalledWith({
      logger: testLogger,
    });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
