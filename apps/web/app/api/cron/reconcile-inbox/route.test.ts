import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, captureExceptionMock, reconcileMock } = vi.hoisted(() => ({
  envMock: {
    CRON_SECRET: "cron-secret",
  },
  captureExceptionMock: vi.fn(),
  reconcileMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/email/reconcile-inbox", () => ({
  reconcileAllEmailInboxes: (...args: unknown[]) => reconcileMock(...args),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET, POST } from "./route";

describe("reconcile inbox cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
    reconcileMock.mockResolvedValue({
      accountCount: 1,
      results: [],
    });
  });

  it("rejects GET requests without the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/reconcile-inbox"),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(reconcileMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("runs inbox reconcile for GET requests with the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/reconcile-inbox", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accountCount: 1,
      results: [],
    });
    expect(reconcileMock).toHaveBeenCalledWith({
      logger: expect.anything(),
    });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it("runs inbox reconcile for POST requests with the cron secret in the body", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/cron/reconcile-inbox", {
        method: "POST",
        body: JSON.stringify({ CRON_SECRET: "cron-secret" }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accountCount: 1,
      results: [],
    });
    expect(reconcileMock).toHaveBeenCalledWith({
      logger: expect.anything(),
    });
  });
});
