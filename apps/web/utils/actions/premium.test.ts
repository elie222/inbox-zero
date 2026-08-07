import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  generateCheckoutSessionAction,
  updateStripeInvoiceEmailsAction,
} from "./premium";

const mocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: mocks.createCheckoutSession } },
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

describe("generateCheckoutSessionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      _count: { emailAccounts: 2 },
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_existing",
        stripeSubscriptionStatus: status,
        stripeEndedAt: endedAt,
        users: [{ _count: { emailAccounts: 2 } }],
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

  it("uses a stable idempotency key for concurrent checkout requests", async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      utms: null,
      _count: { emailAccounts: 2 },
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        stripeEndedAt: null,
        users: [{ _count: { emailAccounts: 2 } }],
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
    expect(mocks.createCheckoutSession.mock.calls[0][1]).toEqual(
      mocks.createCheckoutSession.mock.calls[1][1],
    );
  });

  it("uses a new idempotency key when the checkout quantity changes", async () => {
    let emailAccounts = 1;
    prisma.user.findUnique.mockImplementation(
      async () =>
        ({
          email: "user@example.com",
          utms: null,
          _count: { emailAccounts },
          premium: {
            id: "premium-1",
            stripeCustomerId: "cus_test",
            stripeSubscriptionId: null,
            stripeSubscriptionStatus: null,
            stripeEndedAt: null,
            users: [{ _count: { emailAccounts } }],
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

  it("allows a new checkout after the previous subscription has ended", async () => {
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      utms: null,
      _count: { emailAccounts: 2 },
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        stripeSubscriptionId: "sub_ended",
        stripeSubscriptionStatus: "canceled",
        stripeEndedAt: new Date(),
        users: [{ _count: { emailAccounts: 2 } }],
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
  });
});
