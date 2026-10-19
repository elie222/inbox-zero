import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, captureExceptionMock, getAccountsMock, enqueueMock } =
  vi.hoisted(() => ({
    envMock: {
      CRON_SECRET: "cron-secret",
    },
    captureExceptionMock: vi.fn(),
    getAccountsMock: vi.fn(),
    enqueueMock: vi.fn(),
  }));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/ai/draft-cleanup", () => ({
  getEmailAccountsWithStaleAIDrafts: () => getAccountsMock(),
}));

vi.mock("@/utils/queue/dispatch", () => ({
  enqueueBackgroundJob: (...args: unknown[]) => enqueueMock(...args),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET, POST } from "./route";

describe("draft cleanup cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
    getAccountsMock.mockResolvedValue(["account-1", "account-2"]);
    enqueueMock.mockResolvedValue("vercel");
  });

  it("rejects GET requests without the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/draft-cleanup"),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("enqueues one cleanup job per account for GET requests with the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/draft-cleanup", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accounts: 2,
      enqueued: 2,
    });
    expect(enqueueMock).toHaveBeenCalledTimes(2);
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
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("enqueues one cleanup job per account for POST requests with the cron secret in the body", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cron/draft-cleanup", {
        method: "POST",
        body: JSON.stringify({ CRON_SECRET: "cron-secret" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accounts: 2,
      enqueued: 2,
    });
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("spaces out jobs and keeps enqueueing after a failure", async () => {
    getAccountsMock.mockResolvedValue(["account-1", "account-2", "account-3"]);
    enqueueMock
      .mockResolvedValueOnce("vercel")
      .mockRejectedValueOnce(new Error("queue unavailable"))
      .mockResolvedValueOnce("vercel");

    const response = await GET(
      new Request("http://localhost:3000/api/cron/draft-cleanup", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      accounts: 3,
      enqueued: 2,
    });
    expect(enqueueMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        body: { emailAccountId: "account-3" },
        vercel: { delaySeconds: 2 },
        qstash: expect.objectContaining({
          path: "/api/cron/draft-cleanup/account",
        }),
      }),
    );
  });
});
