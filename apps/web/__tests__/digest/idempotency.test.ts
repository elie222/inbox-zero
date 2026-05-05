import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getTodayET } from "@/utils/digest/today-et";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/ai/digest/generate-digest-content", () => ({
  generateDigestContent: vi.fn(),
}));
vi.mock("@inboxzero/resend", () => ({
  sendDigestV2Email: vi.fn(async () => ({ id: null })),
}));
vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));

const makeLogger = () =>
  ({
    info: () => {},
    warn: () => {},
    error: () => {},
    with: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
    }),
  }) as never;

describe("Digest idempotency state machine (D-14)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits when DigestSend exists for today's ET date", async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      {
        id: "ea1",
        userId: "u1",
        email: "x@y.com",
        about: null,
        multiRuleSelectionEnabled: false,
        timezone: null,
        calendarBookingLink: null,
        user: {},
        account: { provider: "google", refresh_token: "r" },
      },
    ] as never);
    vi.mocked(prisma.digestSend.findUnique).mockResolvedValue({
      id: "ds1",
    } as never);

    const { runDailyDigest } = await import("@/utils/digest/run-daily-digest");
    const result = await runDailyDigest(makeLogger());

    expect(prisma.digest.findMany).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      sent: false,
      reason: "already-sent-today",
    });
  });

  it("uses today's ET date as a UTC-midnight Date for findUnique key", () => {
    const today = getTodayET();
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMinutes()).toBe(0);
    expect(today.getUTCSeconds()).toBe(0);
  });
});
