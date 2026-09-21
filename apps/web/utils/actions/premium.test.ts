import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockOrganizationMembership } from "@/__tests__/helpers";
import { getStripePriceId } from "@/app/(app)/premium/config";
import prisma from "@/utils/__mocks__/prisma";
import {
  endStripeTrialAction,
  generateCheckoutSessionAction,
  getBillingPortalUrlAction,
  updateStripeInvoiceEmailsAction,
} from "./premium";

const mocks = vi.hoisted(() => ({
  createBillingPortalSession: vi.fn(),
  createCheckoutSession: vi.fn(),
  retrieveSubscription: vi.fn(),
  updateSubscription: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    billingPortal: { sessions: { create: mocks.createBillingPortalSession } },
    checkout: { sessions: { create: mocks.createCheckoutSession } },
    subscriptions: {
      retrieve: mocks.retrieveSubscription,
      update: mocks.updateSubscription,
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn() })),
}));
vi.mock("@/utils/posthog", () => ({
  trackStripeCheckoutCreated: vi.fn(),
  trackStripeCustomerCreated: vi.fn(),
}));

describe("updateStripeInvoiceEmailsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      emailAccounts: [],
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        admins: [{ id: "user-1" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
  });

  it.each([
    true,
    false,
  ])("sets the Stripe invoice email preference to %s for an admin", async (enabled) => {
    const result = await updateStripeInvoiceEmailsAction({ enabled });

    expect(prisma.premium.update).toHaveBeenCalledWith({
      where: { id: "premium-1" },
      data: { stripeInvoiceEmailsEnabled: enabled },
    });
    expect(result?.data).toEqual({ enabled });
  });

  it("rejects a non-admin user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      emailAccounts: [],
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        admins: [{ id: "another-user" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await updateStripeInvoiceEmailsAction({ enabled: true });

    expect(result?.serverError).toBe("Not admin");
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });

  it("rejects a user without a Stripe billing account", async () => {
    prisma.user.findUnique.mockResolvedValue({
      emailAccounts: [],
      premium: {
        id: "premium-1",
        stripeCustomerId: null,
        admins: [{ id: "user-1" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await updateStripeInvoiceEmailsAction({ enabled: true });

    expect(result?.serverError).toBe("Stripe billing account not found");
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });
});

describe("getBillingPortalUrlAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an organization member even when they are a plan admin", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_test",
        stripeSubscriptionItemId: "si_test",
        stripeSubscriptionStatus: "active",
        users: [{ _count: { emailAccounts: 1 } }],
        admins: [{ id: "user-1" }, { id: "org-owner" }],
      },
      emailAccounts: [
        {
          members: [
            getMockOrganizationMembership({
              role: "member",
              ownerUserId: "org-owner",
              ownerPremiumId: "premium-1",
            }),
          ],
        },
      ],
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mocks.createBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.test",
    });

    const result = await getBillingPortalUrlAction({});

    expect(result?.serverError).toBe("Not admin");
    expect(mocks.createBillingPortalSession).not.toHaveBeenCalled();
  });

  it.each([
    "admin",
    "owner",
  ])("allows an organization %s who is not a plan admin", async (role) => {
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_test",
        stripeSubscriptionItemId: "si_test",
        stripeSubscriptionStatus: "active",
        users: [{ _count: { emailAccounts: 1 } }],
        admins: [{ id: "another-user" }],
      },
      emailAccounts: [
        {
          members: [
            getMockOrganizationMembership({
              role,
              ownerUserId: "another-user",
              ownerPremiumId: "premium-1",
            }),
          ],
        },
      ],
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mocks.createBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.test",
    });

    const result = await getBillingPortalUrlAction({});

    expect(result?.data).toEqual({ url: "https://billing.stripe.test" });
  });

  it("rejects a non-admin shared plan member", async () => {
    prisma.user.findUnique.mockResolvedValue({
      emailAccounts: [],
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_test",
        stripeSubscriptionItemId: "si_test",
        stripeSubscriptionStatus: "active",
        users: [{ _count: { emailAccounts: 1 } }],
        admins: [{ id: "another-user" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await getBillingPortalUrlAction({ tier: "BASIC_MONTHLY" });

    expect(result?.serverError).toBe("Not admin");
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(mocks.createBillingPortalSession).not.toHaveBeenCalled();
  });

  it("allows the original owner of a legacy premium record", async () => {
    prisma.user.findUnique.mockResolvedValue({
      emailAccounts: [],
      premium: {
        id: "user-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_test",
        stripeSubscriptionItemId: "si_test",
        stripeSubscriptionStatus: "active",
        users: [{ _count: { emailAccounts: 1 } }],
        admins: [],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mocks.createBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.test",
    });

    const result = await getBillingPortalUrlAction({});

    expect(result?.data).toEqual({ url: "https://billing.stripe.test" });
  });

  it("rejects a member of a legacy shared plan without recorded admins", async () => {
    prisma.user.findUnique.mockResolvedValue({
      emailAccounts: [],
      premium: {
        id: "original-owner",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_test",
        stripeSubscriptionItemId: "si_test",
        stripeSubscriptionStatus: "active",
        users: [
          { _count: { emailAccounts: 1 } },
          { _count: { emailAccounts: 1 } },
        ],
        admins: [],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await getBillingPortalUrlAction({});

    expect(result?.serverError).toBe("Not admin");
    expect(mocks.createBillingPortalSession).not.toHaveBeenCalled();
  });

  it("opens a plan-change session for the annual price on an existing monthly subscription", async () => {
    prisma.user.findUnique.mockResolvedValue(
      billingPortalUser({
        stripeSubscriptionItemId: "si_stale",
        emailAccountCount: 2,
      }),
    );
    mocks.retrieveSubscription.mockResolvedValue(
      stripeSubscription({ itemId: "si_live" }),
    );
    mocks.createBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.test/confirm-annual",
    });

    const result = await getBillingPortalUrlAction({
      tier: "BASIC_ANNUALLY",
    });

    expect(result?.data).toEqual({
      url: "https://billing.stripe.test/confirm-annual",
    });
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.createBillingPortalSession).toHaveBeenCalledWith({
      customer: "cus_test",
      return_url: "http://localhost:3000/premium",
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: "sub_test",
          items: [
            {
              id: "si_live",
              price: getStripePriceId({ tier: "BASIC_ANNUALLY" }),
              quantity: 2,
            },
          ],
        },
      },
    });
  });

  it("still switches to the annual price when Stripe cannot confirm the interval change in the portal", async () => {
    prisma.user.findUnique.mockResolvedValue(billingPortalUser());
    mocks.retrieveSubscription.mockResolvedValue(stripeSubscription());
    mocks.createBillingPortalSession.mockRejectedValue(
      stripeInvalidRequestError(
        "The customer portal cannot update this subscription to a price with a different billing interval.",
        "flow_data[subscription_update_confirm][items][0][price]",
      ),
    );
    mocks.updateSubscription.mockResolvedValue({
      id: "sub_test",
      status: "active",
      latest_invoice: {
        status: "open",
        hosted_invoice_url: "https://invoice.stripe.test/annual",
      },
    });

    const result = await getBillingPortalUrlAction({
      tier: "BASIC_ANNUALLY",
    });

    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({
      url: "https://invoice.stripe.test/annual",
    });
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
    expect(mocks.updateSubscription).toHaveBeenCalledWith("sub_test", {
      items: [
        {
          id: "si_live",
          price: getStripePriceId({ tier: "BASIC_ANNUALLY" }),
          quantity: 1,
        },
      ],
      cancel_at_period_end: false,
      proration_behavior: "create_prorations",
      payment_behavior: "pending_if_incomplete",
      expand: ["latest_invoice"],
    });
  });

  it("returns the app billing page after a direct annual switch that does not need another payment", async () => {
    prisma.user.findUnique.mockResolvedValue(billingPortalUser());
    mocks.retrieveSubscription.mockResolvedValue(stripeSubscription());
    mocks.createBillingPortalSession.mockRejectedValue(
      stripeInvalidRequestError(
        "The specified price is not available in the customer portal.",
      ),
    );
    mocks.updateSubscription.mockResolvedValue({
      id: "sub_test",
      status: "active",
      latest_invoice: { status: "paid", hosted_invoice_url: null },
    });

    const result = await getBillingPortalUrlAction({
      tier: "BASIC_ANNUALLY",
    });

    expect(result?.data).toEqual({ url: "http://localhost:3000/premium" });
  });

  it("does not change the subscription when the portal fails for an unrelated reason", async () => {
    prisma.user.findUnique.mockResolvedValue(billingPortalUser());
    mocks.retrieveSubscription.mockResolvedValue(stripeSubscription());
    mocks.createBillingPortalSession.mockRejectedValue(
      Object.assign(new Error("Stripe is temporarily unavailable"), {
        type: "api_error",
      }),
    );

    const result = await getBillingPortalUrlAction({
      tier: "BASIC_ANNUALLY",
    });

    expect(result?.serverError).toBe("An unknown error occurred.");
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
  });

  it("does not guess a subscription item when the stored item is missing from a multi-item subscription", async () => {
    prisma.user.findUnique.mockResolvedValue(
      billingPortalUser({ stripeSubscriptionItemId: "si_stale" }),
    );
    mocks.retrieveSubscription.mockResolvedValue({
      id: "sub_test",
      status: "active",
      items: {
        data: [
          { id: "si_addon", quantity: 1 },
          { id: "si_live", quantity: 1 },
        ],
      },
    });
    mocks.createBillingPortalSession.mockResolvedValue({
      url: "https://billing.stripe.test",
    });

    const result = await getBillingPortalUrlAction({
      tier: "BASIC_ANNUALLY",
    });

    expect(result?.serverError).toBe(
      "We couldn't change your plan. Your subscription has not been changed.",
    );
    expect(mocks.createBillingPortalSession).not.toHaveBeenCalled();
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
  });
});

describe("endStripeTrialAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-admin shared plan member", async () => {
    prisma.user.findUnique.mockResolvedValue({
      emailAccounts: [],
      premium: {
        id: "premium-1",
        stripeSubscriptionId: "sub_test",
        stripeSubscriptionStatus: "trialing",
        admins: [{ id: "another-user" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await endStripeTrialAction();

    expect(result?.serverError).toBe("Not admin");
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
  });
});

describe("generateCheckoutSessionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-admin shared plan member", async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      utms: null,
      emailAccounts: [],
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        stripeEndedAt: null,
        users: [{ _count: { emailAccounts: 1 } }],
        admins: [{ id: "another-user" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await generateCheckoutSessionAction({
      tier: "BASIC_MONTHLY",
    });

    expect(result?.serverError).toBe("Not admin");
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    { status: "active", endedAt: null },
    { status: "canceled", endedAt: null },
  ])("does not create a second checkout for a $status Stripe subscription that has not ended", async ({
    status,
    endedAt,
  }) => {
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      utms: null,
      emailAccounts: [],
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_existing",
        stripeSubscriptionStatus: status,
        stripeEndedAt: endedAt,
        users: [{ _count: { emailAccounts: 2 } }],
        admins: [{ id: "user-1" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await generateCheckoutSessionAction({
      tier: "BASIC_MONTHLY",
    });

    expect(result?.serverError).toBe(
      "You already have an existing subscription. Change your plan instead of starting a new subscription.",
    );
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("includes a trial and uses a stable idempotency key for concurrent first checkouts", async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      utms: null,
      emailAccounts: [],
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        stripeEndedAt: null,
        users: [{ _count: { emailAccounts: 2 } }],
        admins: [{ id: "user-1" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mocks.createCheckoutSession.mockResolvedValue({
      id: "cs_test",
      url: "https://stripe.test",
    });

    const results = await Promise.all([
      generateCheckoutSessionAction({ tier: "BASIC_MONTHLY" }),
      generateCheckoutSessionAction({ tier: "BASIC_MONTHLY" }),
    ]);

    expect(results.map((result) => result?.data?.url)).toEqual([
      "https://stripe.test",
      "https://stripe.test",
    ]);
    expect(mocks.createCheckoutSession).toHaveBeenCalledTimes(2);
    expect(mocks.createCheckoutSession.mock.calls[0][1]).toEqual({
      idempotencyKey: expect.stringMatching(/^checkout:[a-f0-9]{64}$/),
    });
    expect(mocks.createCheckoutSession.mock.calls[0][1]).toEqual(
      mocks.createCheckoutSession.mock.calls[1][1],
    );
    expect(
      mocks.createCheckoutSession.mock.calls[0]?.[0].subscription_data,
    ).toHaveProperty("trial_period_days", 7);
  });

  it("uses a new idempotency key when the checkout quantity changes", async () => {
    let emailAccounts = 1;
    prisma.user.findUnique.mockImplementation(
      async () =>
        ({
          email: "user@example.com",
          utms: null,
          emailAccounts: [],
          premium: {
            id: "premium-1",
            stripeCustomerId: "cus_test",
            stripeSubscriptionId: null,
            stripeSubscriptionStatus: null,
            stripeEndedAt: null,
            users: [{ _count: { emailAccounts } }],
            admins: [{ id: "user-1" }],
          },
        }) as Awaited<ReturnType<typeof prisma.user.findUnique>>,
    );
    mocks.createCheckoutSession.mockResolvedValue({
      id: "cs_test",
      url: "https://stripe.test",
    });

    await generateCheckoutSessionAction({ tier: "BASIC_MONTHLY" });
    emailAccounts = 2;
    await generateCheckoutSessionAction({ tier: "BASIC_MONTHLY" });

    expect(mocks.createCheckoutSession.mock.calls[0][1]).not.toEqual(
      mocks.createCheckoutSession.mock.calls[1][1],
    );
  });

  it("allows a new paid checkout after the previous subscription has ended", async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      utms: null,
      emailAccounts: [],
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_ended",
        stripeSubscriptionStatus: "canceled",
        stripeEndedAt: new Date(),
        users: [{ _count: { emailAccounts: 2 } }],
        admins: [{ id: "user-1" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    mocks.createCheckoutSession.mockResolvedValue({
      id: "cs_ended",
      url: "https://stripe.test",
    });

    const result = await generateCheckoutSessionAction({
      tier: "BASIC_MONTHLY",
    });

    expect(result?.data).toEqual({ url: "https://stripe.test" });
    expect(
      mocks.createCheckoutSession.mock.calls[0]?.[0].subscription_data,
    ).not.toHaveProperty("trial_period_days");
  });
});

function billingPortalUser({
  stripeSubscriptionItemId = "si_test",
  emailAccountCount = 1,
}: {
  stripeSubscriptionItemId?: string;
  emailAccountCount?: number;
} = {}) {
  return {
    emailAccounts: [],
    premium: {
      id: "premium-1",
      stripeCustomerId: "cus_test",
      stripeSubscriptionId: "sub_test",
      stripeSubscriptionItemId,
      stripeSubscriptionStatus: "active",
      users: [{ _count: { emailAccounts: emailAccountCount } }],
      admins: [{ id: "user-1" }],
    },
  } as Awaited<ReturnType<typeof prisma.user.findUnique>>;
}

function stripeSubscription({
  itemId = "si_live",
  quantity = 1,
}: {
  itemId?: string;
  quantity?: number;
} = {}) {
  return {
    id: "sub_test",
    status: "active",
    items: {
      data: [{ id: itemId, quantity }],
    },
  };
}

function stripeInvalidRequestError(message: string, param?: string) {
  return Object.assign(new Error(message), {
    type: "invalid_request_error",
    ...(param ? { param } : {}),
  });
}
