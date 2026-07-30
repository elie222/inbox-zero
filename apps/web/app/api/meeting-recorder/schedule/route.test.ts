import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  envMock,
  hasCronSecretMock,
  reconcileAccountMock,
  releaseAccountBookingsMock,
  sweepRecordingsMock,
} = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
    RECALL_API_KEY: "recall-api-key",
    RECALL_WEBHOOK_SECRET: "recall-webhook-secret",
  },
  hasCronSecretMock: vi.fn(),
  reconcileAccountMock: vi.fn(),
  releaseAccountBookingsMock: vi.fn(),
  sweepRecordingsMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/cron", () => ({
  hasCronSecret: (...args: unknown[]) => hasCronSecretMock(...args),
  hasPostCronSecret: vi.fn(),
}));
vi.mock("@/utils/meeting-recorder/reconcile", () => ({
  reconcileAccount: (...args: unknown[]) => reconcileAccountMock(...args),
  releaseAccountBookings: (...args: unknown[]) =>
    releaseAccountBookingsMock(...args),
  sweepRecordings: (...args: unknown[]) => sweepRecordingsMock(...args),
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET } from "./route";

describe("meeting recorder schedule route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.RECALL_API_KEY = "recall-api-key";
    envMock.RECALL_WEBHOOK_SECRET = "recall-webhook-secret";
    hasCronSecretMock.mockReturnValue(true);
    prisma.emailAccount.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "downgraded-account" }] as never);
  });

  it("releases scheduled bots for accounts that lost plan access", async () => {
    const response = await GET(
      new Request("https://example.com/api/meeting-recorder/schedule") as never,
    );

    expect(response.status).toBe(200);
    expect(releaseAccountBookingsMock).toHaveBeenCalledWith({
      emailAccountId: "downgraded-account",
      logger: expect.anything(),
    });
    expect(reconcileAccountMock).not.toHaveBeenCalled();
  });

  it("does not schedule bots when webhook verification is not configured", async () => {
    envMock.RECALL_WEBHOOK_SECRET = "";

    const response = await GET(
      new Request("https://example.com/api/meeting-recorder/schedule") as never,
    );

    expect(response.status).toBe(200);
    expect(prisma.emailAccount.findMany).not.toHaveBeenCalled();
    expect(reconcileAccountMock).not.toHaveBeenCalled();
    expect(sweepRecordingsMock).not.toHaveBeenCalled();
  });
});
