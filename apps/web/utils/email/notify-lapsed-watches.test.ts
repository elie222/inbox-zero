import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { hasAiAccess } from "@/utils/premium";
import { addUserErrorMessageWithNotification } from "@/utils/error-messages";
import { notifyLapsedWatches } from "./notify-lapsed-watches";

vi.mock("@/utils/prisma");

vi.mock("@/utils/premium", () => ({
  getPremiumUserFilter: vi.fn(() => ({
    user: { premium: { tier: { not: null } } },
  })),
  getUserTier: vi.fn(() => "STARTER_MONTHLY"),
  hasAiAccess: vi.fn(() => true),
  premiumEntitlementSelect: {},
}));

vi.mock("@/utils/error-messages", () => ({
  ErrorType: { EMAIL_WATCH_LAPSED: "Email automation stopped" },
  addUserErrorMessageWithNotification: vi.fn(),
  watchLapsedErrorKey: (emailAccountId: string) =>
    `Email automation stopped:${emailAccountId}`,
}));

const logger = createTestLogger();

const NOW = new Date("2026-07-07T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function getLapsedEmailAccount(overrides?: {
  id?: string;
  email?: string;
  userId?: string;
}) {
  return {
    id: "email-account-1",
    email: "user@example.com",
    userId: "user-1",
    user: { aiApiKey: null, premium: {} },
    ...overrides,
  };
}

describe("notifyLapsedWatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("only targets connected premium accounts that lapsed between 1 and 7 days ago", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([]);

    await notifyLapsedWatches({ logger });

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: { premium: { tier: { not: null } } },
          account: { disconnectedAt: null },
          watchEmailsExpirationDate: {
            gte: new Date(NOW.getTime() - 7 * DAY_MS),
            lt: new Date(NOW.getTime() - DAY_MS),
          },
        }),
      }),
    );
    expect(addUserErrorMessageWithNotification).not.toHaveBeenCalled();
  });

  it("notifies each recently lapsed account", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      getLapsedEmailAccount(),
      getLapsedEmailAccount({
        id: "email-account-2",
        email: "other@example.com",
        userId: "user-2",
      }),
    ] as any);

    const result = await notifyLapsedWatches({ logger });

    expect(result).toEqual({ notified: 2 });
    expect(addUserErrorMessageWithNotification).toHaveBeenCalledTimes(2);
    expect(addUserErrorMessageWithNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        userEmail: "user@example.com",
        emailAccountId: "email-account-1",
        errorType: "Email automation stopped",
        storageKey: "Email automation stopped:email-account-1",
      }),
    );
    expect(addUserErrorMessageWithNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2",
        userEmail: "other@example.com",
        emailAccountId: "email-account-2",
        storageKey: "Email automation stopped:email-account-2",
      }),
    );
  });

  it("skips accounts without AI access", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      getLapsedEmailAccount(),
      getLapsedEmailAccount({
        id: "email-account-2",
        email: "no-ai@example.com",
        userId: "user-2",
      }),
    ] as any);
    vi.mocked(hasAiAccess).mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = await notifyLapsedWatches({ logger });

    expect(result).toEqual({ notified: 1 });
    expect(addUserErrorMessageWithNotification).toHaveBeenCalledTimes(1);
    expect(addUserErrorMessageWithNotification).toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "email-account-1" }),
    );
  });

  it("queries oldest-expired-first and requests one extra row to detect truncation", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([]);

    await notifyLapsedWatches({ logger });

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { watchEmailsExpirationDate: "asc" },
        take: 501,
      }),
    );
  });

  it("processes all 500 accounts when the match count exactly equals the cap", async () => {
    const exactlyCapped = Array.from({ length: 500 }, (_, i) =>
      getLapsedEmailAccount({ id: `email-account-${i}`, userId: `user-${i}` }),
    );
    prisma.emailAccount.findMany.mockResolvedValue(exactlyCapped as any);

    const result = await notifyLapsedWatches({ logger });

    expect(result).toEqual({ notified: 500 });
  });

  it("drops the extra row fetched to detect truncation instead of processing it", async () => {
    const overCapped = Array.from({ length: 501 }, (_, i) =>
      getLapsedEmailAccount({ id: `email-account-${i}`, userId: `user-${i}` }),
    );
    prisma.emailAccount.findMany.mockResolvedValue(overCapped as any);

    const result = await notifyLapsedWatches({ logger });

    expect(result).toEqual({ notified: 500 });
    expect(addUserErrorMessageWithNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "email-account-500" }),
    );
  });
});
