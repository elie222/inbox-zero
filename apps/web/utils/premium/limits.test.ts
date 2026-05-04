import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";

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

  it("throws a not found error when the user record is missing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(assertHasAiAccess({ userId: "missing-user" })).rejects.toMatchObject({
      name: "SafeError",
      message: "User not found",
      statusCode: 404,
    });
  });

  it("throws an upgrade error when the user has no premium entitlement", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      premium: null,
    } as any);

    await expect(assertHasAiAccess({ userId: "free-user" })).rejects.toMatchObject({
      name: "SafeError",
      message: "Please upgrade for AI access",
      statusCode: 403,
    });
  });

  it("allows starter-tier users without a personal API key", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      premium: {
        appleExpiresAt: null,
        appleRevokedAt: null,
        appleSubscriptionStatus: null,
        adminGrantExpiresAt: null,
        adminGrantTier: null,
        lemonSqueezyRenewsAt: null,
        stripeSubscriptionStatus: "active",
        tier: "STARTER_MONTHLY",
      },
    } as any);

    await expect(
      assertHasAiAccess({ userId: "starter-user", hasUserApiKey: false }),
    ).resolves.toBeUndefined();
  });

  it("requires a personal API key for lower paid tiers such as pro monthly", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      premium: {
        appleExpiresAt: null,
        appleRevokedAt: null,
        appleSubscriptionStatus: null,
        adminGrantExpiresAt: null,
        adminGrantTier: null,
        lemonSqueezyRenewsAt: null,
        stripeSubscriptionStatus: "active",
        tier: "PRO_MONTHLY",
      },
    } as any);

    await expect(
      assertHasAiAccess({ userId: "pro-user", hasUserApiKey: false }),
    ).rejects.toMatchObject({
      name: "SafeError",
      message: "Please upgrade for AI access",
      statusCode: 403,
    });

    await expect(
      assertHasAiAccess({ userId: "pro-user", hasUserApiKey: true }),
    ).resolves.toBeUndefined();
  });
});
