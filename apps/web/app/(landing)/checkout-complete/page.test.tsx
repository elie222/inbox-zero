import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  retrieveSession: vi.fn(),
  syncStripeDataToDb: vi.fn(),
  findUser: vi.fn(),
  trackStripeCheckoutCompleted: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirect(url),
}));
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => callback(),
}));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { retrieve: mocks.retrieveSession } },
  }),
}));
vi.mock("@/ee/billing/stripe/sync-stripe", () => ({
  syncStripeDataToDb: mocks.syncStripeDataToDb,
}));
vi.mock("@/utils/prisma", () => ({
  default: { user: { findFirst: mocks.findUser } },
}));
vi.mock("@/utils/posthog", () => ({
  trackStripeCheckoutCompleted: mocks.trackStripeCheckoutCompleted,
}));
vi.mock("@/components/layouts/BasicLayout", () => ({
  BasicLayout: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ConversionAnalytics", () => ({
  ConversionAnalyticsScript: () => null,
  ConversionQueryParamEvents: () => null,
}));

import CheckoutCompletePage from "./page";

describe("desktop checkout return page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({ email: "user@example.com" });
  });

  it("syncs the plan and reports a trial start for a trialing checkout", async () => {
    mocks.retrieveSession.mockResolvedValue({
      status: "complete",
      customer: "cus_1",
      subscription: { status: "trialing" },
    });

    const redirectUrl = await getRedirect("cs_trial");

    expect(mocks.syncStripeDataToDb).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cus_1" }),
    );
    expect(mocks.trackStripeCheckoutCompleted).toHaveBeenCalled();
    expect(redirectUrl.searchParams.get("status")).toBe("trial");
    expect(redirectUrl.searchParams.get("conversion_event")).toBe(
      "trial_started",
    );
  });

  it("does not report a trial for a paid checkout without one", async () => {
    mocks.retrieveSession.mockResolvedValue({
      status: "complete",
      customer: "cus_1",
      subscription: { status: "active" },
    });

    const redirectUrl = await getRedirect("cs_paid");

    expect(redirectUrl.searchParams.get("status")).toBe("subscribed");
    expect(redirectUrl.searchParams.has("conversion_event")).toBe(false);
  });

  it("reports nothing for a checkout Stripe has not completed", async () => {
    mocks.retrieveSession.mockResolvedValue({
      status: "open",
      customer: "cus_1",
      subscription: null,
    });

    const redirectUrl = await getRedirect("cs_open");

    expect(mocks.syncStripeDataToDb).not.toHaveBeenCalled();
    expect(mocks.trackStripeCheckoutCompleted).not.toHaveBeenCalled();
    expect(redirectUrl.searchParams.get("status")).toBe("unconfirmed");
    expect(redirectUrl.searchParams.has("conversion_event")).toBe(false);
  });

  it("reports nothing for a session id Stripe does not know", async () => {
    mocks.retrieveSession.mockRejectedValue(new Error("No such session"));

    const redirectUrl = await getRedirect("cs_made_up");

    expect(mocks.trackStripeCheckoutCompleted).not.toHaveBeenCalled();
    expect(redirectUrl.searchParams.get("status")).toBe("unconfirmed");
    expect(redirectUrl.searchParams.has("conversion_event")).toBe(false);
  });
});

async function getRedirect(sessionId: string) {
  const error = await CheckoutCompletePage({
    searchParams: Promise.resolve({ session_id: sessionId }),
  }).catch((caught: Error) => caught);
  if (!(error instanceof Error) || !error.message.startsWith("redirect:")) {
    throw new Error("Expected the page to redirect");
  }
  return new URL(error.message.slice("redirect:".length), "http://localhost");
}
