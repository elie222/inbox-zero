import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { createPreviewMock } = vi.hoisted(() => ({
  createPreviewMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({ invoices: { createPreview: createPreviewMock } }),
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware({ handleSafeErrors: true });
});

import { GET } from "./route";

describe("user/trial-preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPreviewMock.mockResolvedValue({
      amount_due: 21_600,
      currency: "usd",
    });
    mockPremium({
      tier: "STARTER_ANNUALLY",
      stripeSubscriptionId: "sub_1",
      stripeSubscriptionStatus: "trialing",
      stripeTrialEnd: new Date("2026-08-03T00:00:00.000Z"),
    });
  });

  it("returns the exact amount the user would be charged today", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      planName: "Starter",
      isAnnual: true,
      trialEnd: "2026-08-03T00:00:00.000Z",
      amountDue: 21_600,
      currency: "usd",
    });
    expect(createPreviewMock).toHaveBeenCalledWith({
      subscription: "sub_1",
      subscription_details: { trial_end: "now" },
    });
  });

  it("reports monthly plans as not annual", async () => {
    mockPremium({
      tier: "STARTER_MONTHLY",
      stripeSubscriptionId: "sub_1",
      stripeSubscriptionStatus: "trialing",
      stripeTrialEnd: null,
    });

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({ isAnnual: false });
  });

  it("errors when the subscription is no longer trialing", async () => {
    mockPremium({
      tier: "STARTER_ANNUALLY",
      stripeSubscriptionId: "sub_1",
      stripeSubscriptionStatus: "active",
      stripeTrialEnd: null,
    });

    const response = await GET(request());

    expect(response.status).toBe(400);
    expect(createPreviewMock).not.toHaveBeenCalled();
  });

  it("errors when there is no Stripe subscription", async () => {
    mockPremium(null);

    const response = await GET(request());

    expect(response.status).toBe(400);
    expect(createPreviewMock).not.toHaveBeenCalled();
  });
});

function mockPremium(premium: Record<string, unknown> | null) {
  prisma.user.findUnique.mockResolvedValue({ premium } as unknown as Awaited<
    ReturnType<typeof prisma.user.findUnique>
  >);
}

function request() {
  return new NextRequest("https://example.com/api/user/trial-preview");
}
