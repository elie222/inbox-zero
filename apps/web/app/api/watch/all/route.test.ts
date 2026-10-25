import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clearWatchLapsedErrorIfResolvedMock,
  ensureEmailAccountsWatchedMock,
  envMock,
  getStandbyEmailAccountsMock,
  notifyLapsedWatchesMock,
} = vi.hoisted(() => ({
  clearWatchLapsedErrorIfResolvedMock: vi.fn(),
  ensureEmailAccountsWatchedMock: vi.fn(),
  envMock: { CRON_SECRET: "cron-secret" },
  getStandbyEmailAccountsMock: vi.fn(),
  notifyLapsedWatchesMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));
vi.mock("@/utils/outlook/mailbox-claim", () => ({
  getStandbyEmailAccounts: (...args: unknown[]) =>
    getStandbyEmailAccountsMock(...args),
}));
vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: (...args: unknown[]) =>
    ensureEmailAccountsWatchedMock(...args),
}));
vi.mock("@/utils/email/notify-lapsed-watches", () => ({
  notifyLapsedWatches: (...args: unknown[]) => notifyLapsedWatchesMock(...args),
}));
vi.mock("@/utils/error-messages", () => ({
  clearWatchLapsedErrorIfResolved: (...args: unknown[]) =>
    clearWatchLapsedErrorIfResolvedMock(...args),
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET, POST } from "./route";

function cronRequest(method: "GET" | "POST") {
  if (method === "POST") {
    return new Request("http://localhost:3000/api/watch/all", {
      method,
      body: JSON.stringify({ CRON_SECRET: "cron-secret" }),
    });
  }

  return new Request("http://localhost:3000/api/watch/all", {
    method,
    headers: { authorization: "Bearer cron-secret" },
  });
}

describe("watch all cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
    ensureEmailAccountsWatchedMock.mockResolvedValue([{ status: "success" }]);
    notifyLapsedWatchesMock.mockResolvedValue(undefined);
    clearWatchLapsedErrorIfResolvedMock.mockResolvedValue(undefined);
  });

  it("renews watches and notifies lapsed ones on the owning copy", async () => {
    getStandbyEmailAccountsMock.mockResolvedValue([]);

    const response = await GET(cronRequest("GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      results: [{ status: "success" }],
    });
    expect(ensureEmailAccountsWatchedMock).toHaveBeenCalledTimes(1);
    expect(notifyLapsedWatchesMock).toHaveBeenCalledTimes(1);
    expect(clearWatchLapsedErrorIfResolvedMock).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", GET],
    ["POST", POST],
  ] as const)("stands by on %s: no renewal, no lapsed notice, existing notice cleared", async (method, handler) => {
    getStandbyEmailAccountsMock.mockResolvedValue([
      { id: "acc-1", userId: "user-1", ownerHosts: ["pc.example.ts.net"] },
      { id: "acc-2", userId: "user-2", ownerHosts: ["pc.example.ts.net"] },
    ]);

    const response = await handler(cronRequest(method));

    await expect(response.json()).resolves.toEqual({
      skipped: "standby",
      ownerHosts: ["pc.example.ts.net"],
    });
    expect(ensureEmailAccountsWatchedMock).not.toHaveBeenCalled();
    expect(notifyLapsedWatchesMock).not.toHaveBeenCalled();
    expect(clearWatchLapsedErrorIfResolvedMock).toHaveBeenCalledTimes(2);
    expect(clearWatchLapsedErrorIfResolvedMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", emailAccountId: "acc-1" }),
    );
    expect(clearWatchLapsedErrorIfResolvedMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-2", emailAccountId: "acc-2" }),
    );
  });

  it("rejects requests without the cron credential before checking standby", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/watch/all"),
    );

    expect(response.status).toBe(401);
    expect(getStandbyEmailAccountsMock).not.toHaveBeenCalled();
  });
});
