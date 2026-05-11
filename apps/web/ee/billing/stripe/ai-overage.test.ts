import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as { STRIPE_AI_GENERATION_OVERAGE_CONFIG?: string },
}));

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockInvoiceItemCreate = vi.fn();
const mockGetAiGenerationCountByEmailAccounts = vi.fn();
const mockGetStripeSubscriptionTier = vi.fn();

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    premium: {
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
}));

vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    invoiceItems: {
      create: mockInvoiceItemCreate,
    },
  }),
}));

vi.mock("@inboxzero/tinybird-ai-analytics", () => ({
  getAiGenerationCountByEmailAccounts: mockGetAiGenerationCountByEmailAccounts,
}));

vi.mock("@/app/(app)/premium/config", () => ({
  getStripeSubscriptionTier: mockGetStripeSubscriptionTier,
}));

const logger = createTestLogger();

describe("syncAiGenerationOverageForUpcomingInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockEnv.STRIPE_AI_GENERATION_OVERAGE_CONFIG = undefined;
    mockGetStripeSubscriptionTier.mockReturnValue("STARTER_MONTHLY");
  });

  it("does nothing when overage config is disabled", async () => {
    mockFindUnique.mockResolvedValue({
      id: "premium-1",
      tier: "STARTER_MONTHLY",
      stripePriceId: "price_123",
      stripeAiOverageLastInvoiceId: null,
      stripeAiOverageLastPeriodEnd: null,
      users: [{ emailAccounts: [{ id: "acc-1" }] }],
    });

    const { syncAiGenerationOverageForUpcomingInvoice } = await import(
      "./ai-overage"
    );

    await syncAiGenerationOverageForUpcomingInvoice({
      event: upcomingInvoiceEvent(),
      logger,
    });

    expect(mockGetAiGenerationCountByEmailAccounts).not.toHaveBeenCalled();
    expect(mockInvoiceItemCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("stores a zero-unit checkpoint when usage is within included generations", async () => {
    mockEnv.STRIPE_AI_GENERATION_OVERAGE_CONFIG = JSON.stringify({
      STARTER_MONTHLY: { included: 3000, overageUsdPer1000: 5 },
    });

    mockFindUnique.mockResolvedValue({
      id: "premium-1",
      tier: "STARTER_MONTHLY",
      stripePriceId: "price_123",
      stripeAiOverageLastInvoiceId: null,
      stripeAiOverageLastPeriodEnd: null,
      users: [{ emailAccounts: [{ id: "acc-1" }] }],
    });
    mockGetAiGenerationCountByEmailAccounts.mockResolvedValue(2800);

    const { syncAiGenerationOverageForUpcomingInvoice } = await import(
      "./ai-overage"
    );

    await syncAiGenerationOverageForUpcomingInvoice({
      event: upcomingInvoiceEvent(),
      logger,
    });

    expect(mockInvoiceItemCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "premium-1" },
      data: expect.objectContaining({
        stripeAiOverageLastInvoiceId: null,
        stripeAiOverageLastUnits: 0,
      }),
    });
  });

  it("creates an invoice item when usage exceeds included generations", async () => {
    mockEnv.STRIPE_AI_GENERATION_OVERAGE_CONFIG = JSON.stringify({
      STARTER_MONTHLY: { included: 3000, overageUsdPer1000: 5 },
    });

    mockFindUnique.mockResolvedValue({
      id: "premium-1",
      tier: "STARTER_MONTHLY",
      stripePriceId: "price_123",
      stripeAiOverageLastInvoiceId: null,
      stripeAiOverageLastPeriodEnd: null,
      users: [{ emailAccounts: [{ id: "acc-1" }] }],
    });
    mockGetAiGenerationCountByEmailAccounts.mockResolvedValue(4500);

    const { syncAiGenerationOverageForUpcomingInvoice } = await import(
      "./ai-overage"
    );

    await syncAiGenerationOverageForUpcomingInvoice({
      event: upcomingInvoiceEvent(),
      logger,
    });

    expect(mockInvoiceItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        amount: 1000,
        currency: "usd",
      }),
      expect.objectContaining({
        idempotencyKey: "ai-overage-cus_123-1700200000000",
      }),
    );

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "premium-1" },
      data: expect.objectContaining({
        stripeAiOverageLastInvoiceId: null,
        stripeAiOverageLastUnits: 2,
      }),
    });
  });

  it("skips when the invoice was already processed", async () => {
    mockEnv.STRIPE_AI_GENERATION_OVERAGE_CONFIG = JSON.stringify({
      STARTER_MONTHLY: { included: 3000, overageUsdPer1000: 5 },
    });

    mockFindUnique.mockResolvedValue({
      id: "premium-1",
      tier: "STARTER_MONTHLY",
      stripePriceId: "price_123",
      stripeAiOverageLastInvoiceId: null,
      stripeAiOverageLastPeriodEnd: new Date(1_700_200_000_000),
      users: [{ emailAccounts: [{ id: "acc-1" }] }],
    });

    const { syncAiGenerationOverageForUpcomingInvoice } = await import(
      "./ai-overage"
    );

    await syncAiGenerationOverageForUpcomingInvoice({
      event: upcomingInvoiceEvent(),
      logger,
    });

    expect(mockGetAiGenerationCountByEmailAccounts).not.toHaveBeenCalled();
    expect(mockInvoiceItemCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

function upcomingInvoiceEvent(): Stripe.Event {
  return {
    id: "evt_123",
    type: "invoice.upcoming",
    object: "event",
    api_version: "2025-03-31.basil",
    created: 1,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: null,
        customer: "cus_123",
        period_start: 1_700_000_000,
        period_end: 1_700_200_000,
      },
    },
  } as unknown as Stripe.Event;
}
