import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { createPreviewMock, retrieveSubscriptionMock } = vi.hoisted(() => ({
  createPreviewMock: vi.fn(),
  retrieveSubscriptionMock: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    invoices: { createPreview: createPreviewMock },
    subscriptions: { retrieve: retrieveSubscriptionMock },
  }),
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
    mockSubscriptionInterval("year");
    mockPremium({
      tier: "STARTER_ANNUALLY",
      stripeSubscriptionId: "sub_1",
      stripeSubscriptionStatus: "trialing",
      stripeTrialEnd: new Date("2026-08-03T00:00:00.000Z"),
    });
  });

  it("returns the exact amount the user would be charged today", async () => {
    const response = await callRoute();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      planName: "Starter",
      interval: "year",
      trialEnd: "2026-08-03T00:00:00.000Z",
      amountDue: 21_600,
      currency: "usd",
    });
    expect(createPreviewMock).toHaveBeenCalledWith({
      subscription: "sub_1",
      subscription_details: { trial_end: "now" },
    });
  });

  it("takes the billing period from the price, not the tier name", async () => {
    mockSubscriptionInterval("year");
    mockPremium({
      tier: null,
      stripeSubscriptionId: "sub_1",
      stripeSubscriptionStatus: "trialing",
      stripeTrialEnd: null,
    });

    const response = await callRoute();

    await expect(response.json()).resolves.toMatchObject({ interval: "year" });
  });

  it("returns a null interval when the price has no recurring schedule", async () => {
    retrieveSubscriptionMock.mockResolvedValue({
      items: { data: [{ price: {} }] },
    });

    const response = await callRoute();

    await expect(response.json()).resolves.toMatchObject({ interval: null });
  });

  it("errors when the subscription is no longer trialing", async () => {
    mockPremium({
      tier: "STARTER_ANNUALLY",
      stripeSubscriptionId: "sub_1",
      stripeSubscriptionStatus: "active",
      stripeTrialEnd: null,
    });

    const response = await callRoute();

    expect(response.status).toBe(400);
    expect(createPreviewMock).not.toHaveBeenCalled();
  });

  it("errors when there is no Stripe subscription", async () => {
    mockPremium(null);

    const response = await callRoute();

    expect(response.status).toBe(400);
    expect(createPreviewMock).not.toHaveBeenCalled();
  });
});

function mockPremium(premium: Record<string, unknown> | null) {
  prisma.user.findUnique.mockResolvedValue({ premium } as unknown as Awaited<
    ReturnType<typeof prisma.user.findUnique>
  >);
}

function mockSubscriptionInterval(interval: string) {
  retrieveSubscriptionMock.mockResolvedValue({
    items: { data: [{ price: { recurring: { interval } } }] },
  });
}

function callRoute() {
  return GET(
    new NextRequest("https://example.com/api/user/trial-preview"),
    {} as never,
  );
}
