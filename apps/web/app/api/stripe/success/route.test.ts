import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { afterMock, redirectMock, syncStripeDataToDbMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  redirectMock: vi.fn(),
  syncStripeDataToDbMock: vi.fn(),
}));

vi.mock("next/server", async (importActual) => ({
  ...(await importActual<typeof import("next/server")>()),
  after: afterMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");
  const { withAuth } = createWithAuthTestMiddleware();

  return {
    withAuth: (
      scopeOrHandler: Parameters<typeof withAuth>[0],
      handler?: Parameters<typeof withAuth>[1],
    ) => {
      const wrapped = withAuth(scopeOrHandler, handler);
      return (request: Request, ...context: unknown[]) =>
        wrapped(request.clone(), ...context);
    },
  };
});

vi.mock("@/utils/prisma");

vi.mock("@/ee/billing/stripe/sync-stripe", () => ({
  syncStripeDataToDb: syncStripeDataToDbMock,
}));

vi.mock("@/utils/posthog", () => ({
  trackStripeCheckoutCompleted: vi.fn(),
}));

import { GET } from "./route";

describe("stripe success route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      premium: { stripeCustomerId: "stripe-customer-id" },
    } as never);
  });

  it("redirects with the checkout session after authenticated request enrichment", async () => {
    await GET(
      new Request(
        "http://localhost:3000/api/stripe/success?session_id=checkout-session-id",
      ) as never,
      {} as never,
    );

    expect(syncStripeDataToDbMock).toHaveBeenCalledWith({
      customerId: "stripe-customer-id",
      logger: expect.anything(),
    });
    expect(redirectMock).toHaveBeenCalledWith(
      "/setup?conversion_event=trial_started&conversion_event_id=checkout-session-id",
    );
  });
});
