import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  activateLicenseKeyAction,
  generateCheckoutSessionAction,
  updateStripeInvoiceEmailsAction,
} from "./premium";

const mocks = vi.hoisted(() => ({
  activateLemonLicenseKey: vi.fn(),
  createCheckoutSession: vi.fn(),
  licenseEnv: {
    LICENSE_1_SEAT_VARIANT_ID: 101 as number | undefined,
    LICENSE_3_SEAT_VARIANT_ID: 101 as number | undefined,
    LICENSE_5_SEAT_VARIANT_ID: 105 as number | undefined,
    LICENSE_10_SEAT_VARIANT_ID: 110 as number | undefined,
    LICENSE_25_SEAT_VARIANT_ID: 125 as number | undefined,
  },
  upgradeToPremiumLemon: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("@/env")>();
  return { env: { ...env, ...mocks.licenseEnv } };
});
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/ee/billing/lemon/index", () => ({
  activateLemonLicenseKey: mocks.activateLemonLicenseKey,
}));
vi.mock("@/utils/premium/server", () => ({
  grantPremiumAdmin: vi.fn(),
  upgradeToPremiumLemon: mocks.upgradeToPremiumLemon,
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

describe("activateLicenseKeyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a valid Lemon license for an unconfigured variant", async () => {
    mocks.activateLemonLicenseKey.mockResolvedValue(
      activatedLicenseResponse({ variantId: 999 }),
    );

    const result = await activateLicenseKeyAction({
      licenseKey: "foreign-license-key",
    });

    expect(result?.serverError).toBe(
      "License key is not valid for this product.",
    );
    expect(mocks.upgradeToPremiumLemon).not.toHaveBeenCalled();
  });

  it("rejects an unsuccessful activation", async () => {
    mocks.activateLemonLicenseKey.mockResolvedValue({
      ...activatedLicenseResponse({ variantId: 105 }),
      data: {
        ...activatedLicenseResponse({ variantId: 105 }).data,
        activated: false,
        error: "License key is already activated.",
        instance: null,
      },
    });

    const result = await activateLicenseKeyAction({
      licenseKey: "already-activated-license-key",
    });

    expect(result?.data).toEqual({
      error: "License key is already activated.",
    });
    expect(mocks.upgradeToPremiumLemon).not.toHaveBeenCalled();
  });

  it("rejects duplicate variant mappings", async () => {
    mocks.activateLemonLicenseKey.mockResolvedValue(
      activatedLicenseResponse({ variantId: 101 }),
    );

    const result = await activateLicenseKeyAction({
      licenseKey: "ambiguous-license-key",
    });

    expect(result?.serverError).toBe(
      "License key is not valid for this product.",
    );
    expect(mocks.upgradeToPremiumLemon).not.toHaveBeenCalled();
  });

  it("grants the configured number of seats for an allowed variant", async () => {
    mocks.activateLemonLicenseKey.mockResolvedValue(
      activatedLicenseResponse({ variantId: 105 }),
    );

    const result = await activateLicenseKeyAction({
      licenseKey: "inbox-zero-license-key",
    });

    expect(result?.serverError).toBeUndefined();
    expect(mocks.upgradeToPremiumLemon).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        tier: "LIFETIME",
        lemonLicenseKey: "inbox-zero-license-key",
        lemonLicenseInstanceId: "instance-1",
        lemonSqueezyVariantId: 105,
        emailAccountsAccess: 5,
      }),
    );
  });
});

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
    expect(mocks.createCheckoutSession.mock.calls[0][1]).toEqual({
      idempotencyKey: expect.stringMatching(/^checkout:[a-f0-9]{64}$/),
    });
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

function activatedLicenseResponse({ variantId }: { variantId: number }) {
  return {
    statusCode: 200,
    error: null,
    data: {
      activated: true,
      error: null,
      license_key: {
        id: 1,
        status: "active",
        key: "license-key",
        activation_limit: 1,
        activation_usage: 1,
        created_at: "2026-08-12T00:00:00.000Z",
        expires_at: null,
        test_mode: false,
      },
      instance: {
        id: "instance-1",
        name: "License for user-1",
        created_at: "2026-08-12T00:00:00.000Z",
      },
      meta: {
        store_id: 1,
        order_id: 2,
        order_item_id: 3,
        product_id: 4,
        product_name: "Inbox Zero",
        variant_id: variantId,
        variant_name: "Lifetime",
        customer_id: 5,
        customer_name: "Customer",
        customer_email: "customer@example.com",
      },
    },
  };
}
