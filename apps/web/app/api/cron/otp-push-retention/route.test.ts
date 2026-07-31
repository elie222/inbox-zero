import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureExceptionMock, deleteExpiredMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  deleteExpiredMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: { CRON_SECRET: "cron-secret" },
}));
vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));
vi.mock("@/utils/otp-push-retention", () => ({
  deleteExpiredOtpPushNotifications: () => deleteExpiredMock(),
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET } from "./route";

describe("OTP push retention cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteExpiredMock.mockResolvedValue(3);
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/otp-push-retention"),
    );

    expect(response.status).toBe(401);
    expect(deleteExpiredMock).not.toHaveBeenCalled();
    expect(captureExceptionMock).toHaveBeenCalledOnce();
  });

  it("deletes expired claims for an authorized request", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/cron/otp-push-retention", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 3 });
    expect(deleteExpiredMock).toHaveBeenCalledOnce();
  });
});
