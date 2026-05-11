import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { authMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: authMock,
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET } from "./route";

describe("user/me route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: { id: "user-1" },
    });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      aiProvider: "openai",
      aiModel: "gpt-5.1",
      aiApiKey: "secret-api-key",
      webhookSecret: "secret-webhook-key",
      referralCode: null,
      announcementDismissedAt: null,
      dismissedHints: [],
      premium: null,
      emailAccounts: [
        {
          id: "acc-1",
          email: "user@example.com",
          name: "Example User",
          members: [
            {
              organizationId: "org-1",
              role: "admin",
              organization: {
                name: "Example Org",
              },
            },
          ],
        },
      ],
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);
  });

  it("returns 401 with isKnownError when not authenticated", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/user/me"),
      {} as never,
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Not authenticated");
    expect(body.isKnownError).toBe(true);
  });

  it("returns secret presence flags instead of raw secret values", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/user/me"),
      {} as never,
    );

    const body = await response.json();

    expect(body.hasAiApiKey).toBe(true);
    expect(body.hasWebhookSecret).toBe(true);
    expect(body.aiApiKey).toBeUndefined();
    expect(body.webhookSecret).toBeUndefined();
    expect(body.referralCode).toBeUndefined();
    expect(body.members).toEqual([
      {
        organizationId: "org-1",
        role: "admin",
        organization: {
          name: "Example Org",
        },
        emailAccountId: "acc-1",
      },
    ]);
    expect(body.emailAccounts).toEqual([
      {
        id: "acc-1",
        email: "user@example.com",
        name: "Example User",
      },
    ]);
  });

  it("does not expose backend-only Apple subscription identifiers", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      aiProvider: "openai",
      aiModel: "gpt-5.1",
      aiApiKey: null,
      webhookSecret: null,
      referralCode: null,
      announcementDismissedAt: null,
      dismissedHints: [],
      premium: {
        appleExpiresAt: new Date("2026-02-01T00:00:00.000Z"),
        appleRevokedAt: null,
        appleSubscriptionStatus: "ACTIVE",
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        lemonSqueezyRenewsAt: null,
        stripeCustomerId: null,
        stripePriceId: null,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        unsubscribeCredits: 0,
        tier: null,
        emailAccountsAccess: 0,
        lemonLicenseKey: null,
        pendingInvites: [],
      },
      emailAccounts: [],
    } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/user/me"),
      {} as never,
    );

    const body = await response.json();

    expect(body.premium).toMatchObject({
      appleExpiresAt: "2026-02-01T00:00:00.000Z",
      appleRevokedAt: null,
      appleSubscriptionStatus: "ACTIVE",
    });
    expect(body.premium.appleAppAccountToken).toBeUndefined();
    expect(body.premium.appleEnvironment).toBeUndefined();
    expect(body.premium.appleLatestTransactionId).toBeUndefined();
    expect(body.premium.appleOriginalTransactionId).toBeUndefined();
    expect(body.premium.appleProductId).toBeUndefined();
    expect(body.premium.applePurchaseDate).toBeUndefined();
  });
});
