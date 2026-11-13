import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureExceptionMock, resumeStalledJobsMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  resumeStalledJobsMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: { CRON_SECRET: "cron-secret" } }));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/bulk-inbox-action/resume-stalled-job", () => ({
  resumeStalledBulkInboxActionJobs: (...args: unknown[]) =>
    resumeStalledJobsMock(...args),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET, POST } from "./route";

const URL = "http://localhost:3000/api/cron/bulk-inbox-action-recovery";

describe("bulk inbox action recovery cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resumeStalledJobsMock.mockResolvedValue({ checked: 2 });
  });

  it("rejects requests without the cron secret", async () => {
    const response = await GET(new Request(URL));

    expect(response.status).toBe(401);
    expect(resumeStalledJobsMock).not.toHaveBeenCalled();
  });

  it("sweeps stalled jobs for GET requests with the cron bearer token", async () => {
    const response = await GET(
      new Request(URL, { headers: { authorization: "Bearer cron-secret" } }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ checked: 2 });
    expect(resumeStalledJobsMock).toHaveBeenCalledTimes(1);
  });

  it("sweeps stalled jobs for POST requests with the cron secret", async () => {
    const response = await POST(
      new Request(URL, {
        method: "POST",
        body: JSON.stringify({ CRON_SECRET: "cron-secret" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(resumeStalledJobsMock).toHaveBeenCalledTimes(1);
  });
});
