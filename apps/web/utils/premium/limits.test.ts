import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { SafeError } from "@/utils/error";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: false,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/prisma");

import { assertHasAiAccess } from "./limits";

describe("assertHasAiAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = false;
  });

  it("throws a 404 SafeError when the user does not exist", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(assertHasAiAccess({ userId: "missing-user" })).rejects.toMatchObject(
      {
        name: "SafeError",
        safeMessage: "User not found",
        statusCode: 404,
      } satisfies Partial<SafeError>,
    );
  });

  it("throws a 403 SafeError when the user has no premium entitlement", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: null,
    } as never);

    await expect(assertHasAiAccess({ userId: "free-user" })).rejects.toMatchObject(
      {
        name: "SafeError",
        safeMessage: "Please upgrade for AI access",
        statusCode: 403,
      } satisfies Partial<SafeError>,
    );
  });

  it("throws a 403 SafeError when a premium user still lacks AI access", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        tier: "PRO_MONTHLY",
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
      assertHasAiAccess({ userId: "pro-without-key", hasUserApiKey: false }),
    ).rejects.toMatchObject({
      name: "SafeError",
      safeMessage: "Please upgrade for AI access",
      statusCode: 403,
    } satisfies Partial<SafeError>);
  });

  it("allows starter users without a personal API key", async () => {
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
      assertHasAiAccess({ userId: "starter-user", hasUserApiKey: false }),
    ).resolves.toBeUndefined();
  });

  it("allows lower-tier premium users when they provide their own API key", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        tier: "PRO_MONTHLY",
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
      assertHasAiAccess({ userId: "pro-with-key", hasUserApiKey: true }),
    ).resolves.toBeUndefined();
  });
});
