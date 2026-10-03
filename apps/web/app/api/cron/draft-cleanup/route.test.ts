import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  envMock,
  captureExceptionMock,
  cleanupDraftsMock,
  cleanupResourcesMock,
} = vi.hoisted(() => ({
  envMock: {
    CRON_SECRET: "cron-secret",
  },
  captureExceptionMock: vi.fn(),
  cleanupDraftsMock: vi.fn(),
  cleanupResourcesMock: vi.fn(),
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
vi.mock("@/utils/email/draft-resource-cleanup", () => ({
  cleanupDraftResources: cleanupResourcesMock,
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
    cleanupDraftsMock.mockResolvedValue({
      deletedDrafts: 2,
      skippedDrafts: 1,
    });
    cleanupResourcesMock.mockResolvedValue({
      examined: 1,
      consumed: 1,
      errors: 0,
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
      draftResources: { examined: 1, consumed: 1, errors: 0 },
    });
    expect(cleanupDraftsMock).toHaveBeenCalledWith({
      logger: expect.anything(),
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
      draftResources: { examined: 1, consumed: 1, errors: 0 },
    });
    expect(cleanupDraftsMock).toHaveBeenCalledWith({
      logger: expect.anything(),
    });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
