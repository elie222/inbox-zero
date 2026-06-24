import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  captureExceptionMock,
  envMock,
  mockPrisma,
  processMeetingBriefingsMock,
} = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  envMock: {
    CRON_SECRET: "cron-secret",
  },
  mockPrisma: {
    emailAccount: {
      findMany: vi.fn(),
    },
  },
  processMeetingBriefingsMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/error", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/utils/prisma", () => ({
  default: mockPrisma,
}));

vi.mock("@/utils/premium", () => ({
  getPremiumUserFilter: vi.fn(() => ({})),
}));

vi.mock("@/utils/meeting-briefs/process", () => ({
  processMeetingBriefings: (...args: unknown[]) =>
    processMeetingBriefingsMock(...args),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET } from "./route";

describe("meeting briefs cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CRON_SECRET = "cron-secret";
  });

  it("processes eligible accounts with bounded concurrency", async () => {
    mockPrisma.emailAccount.findMany.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({
        id: `email-account-${index + 1}`,
        email: `account-${index + 1}@example.test`,
        meetingBriefingsMinutesBefore: 60,
        account: { provider: "google" },
      })),
    );

    let active = 0;
    let maxActive = 0;
    processMeetingBriefingsMock.mockImplementation(
      async ({ emailAccountId }: { emailAccountId: string }) => {
        active++;
        maxActive = Math.max(maxActive, active);

        await new Promise((resolve) => setTimeout(resolve, 0));
        active--;

        if (emailAccountId === "email-account-3") {
          throw new Error("Processing failed");
        }
      },
    );

    const response = await GET(
      new Request("http://localhost:3000/api/meeting-briefs", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      total: 7,
      success: 6,
      errors: 1,
    });
    expect(processMeetingBriefingsMock).toHaveBeenCalledTimes(7);
    expect(maxActive).toBe(5);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
