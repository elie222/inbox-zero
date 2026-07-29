import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  hasCronSecretMock,
  reconcileAccountMock,
  releaseAccountBookingsMock,
  sweepRecordingsMock,
} = vi.hoisted(() => ({
  hasCronSecretMock: vi.fn(),
  reconcileAccountMock: vi.fn(),
  releaseAccountBookingsMock: vi.fn(),
  sweepRecordingsMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
    RECALL_API_KEY: "recall-api-key",
  },
}));
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
});
