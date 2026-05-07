import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import type { SafeError } from "@/utils/error";

const { envMock, ensureEmailAccountsWatchedMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
  },
  ensureEmailAccountsWatchedMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/prisma");

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();

  return {
    ...actual,
    after: vi.fn((callback: () => Promise<void> | void) => callback()),
  };
});

vi.mock("@/utils/logger", () => ({
  createScopedLogger: vi.fn(() => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    with: vi.fn(),
  })),
}));

vi.mock("@/utils/email/watch-manager", () => ({
  ensureEmailAccountsWatched: ensureEmailAccountsWatchedMock,
}));

import { assertCanUseDigests, assertCanUseDigestsIfNeeded } from "./server";

describe("digest premium guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = false;
  });

  it("skips the premium lookup when no digest action is being enabled", async () => {
    await expect(
      assertCanUseDigestsIfNeeded("user-1", [{ type: ActionType.LABEL }]),
    ).resolves.toBeUndefined();

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("throws a 403 SafeError when a digest action is requested below Plus", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        tier: "STARTER_MONTHLY",
        stripeSubscriptionStatus: "active",
        lemonSqueezyRenewsAt: null,
        appleExpiresAt: null,
        appleRevokedAt: null,
        appleSubscriptionStatus: null,
        adminGrantExpiresAt: null,
        adminGrantTier: null,
      },
    } as never);

    await expect(
      assertCanUseDigestsIfNeeded("user-1", [{ type: ActionType.DIGEST }]),
    ).rejects.toMatchObject({
      name: "SafeError",
      safeMessage: "Digests are available on the Plus plan.",
      statusCode: 403,
    } satisfies Partial<SafeError>);
  });

  it("allows digest access from an active Plus admin grant", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        tier: null,
        stripeSubscriptionStatus: null,
        lemonSqueezyRenewsAt: null,
        appleExpiresAt: null,
        appleRevokedAt: null,
        appleSubscriptionStatus: null,
        adminGrantExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        adminGrantTier: "PLUS_MONTHLY",
      },
    } as never);

    await expect(assertCanUseDigests("user-1")).resolves.toBeUndefined();
  });
});
