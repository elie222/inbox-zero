import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  processEvent: vi.fn(),
  constructEvent: vi.fn(),
  after: vi.fn(),
}));
vi.mock("./controller", () => ({ processEvent: mocks.processEvent }));
vi.mock("@/ee/billing/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));
vi.mock("@/env", () => ({ env: { STRIPE_WEBHOOK_SECRET: "whsec_test" } }));
vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "Stripe-Signature": "signature_test" }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await import("@/__tests__/helpers");
  return createWithErrorTestMiddleware();
});

describe("Stripe payment webhook acknowledgement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.constructEvent.mockReturnValue({
      id: "evt_test",
      type: "invoice.payment_succeeded",
    });
  });

  it("does not acknowledge successful invoice delivery when processing fails", async () => {
    mocks.processEvent.mockRejectedValue(new Error("conversion unavailable"));
    await expect(
      POST(request(), { params: Promise.resolve({}) }),
    ).rejects.toThrow("conversion unavailable");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("acknowledges only after invoice processing completes", async () => {
    let complete: () => void = () => {};
    mocks.processEvent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const settled = vi.fn();
    const responsePromise = POST(request(), {
      params: Promise.resolve({}),
    }).then((response) => {
      settled();
      return response;
    });
    await vi.waitFor(() => expect(mocks.processEvent).toHaveBeenCalled());
    expect(settled).not.toHaveBeenCalled();
    complete();
    expect((await responsePromise).status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

function request() {
  return new NextRequest("https://example.com/api/stripe/webhook", {
    method: "POST",
    body: "{}",
  });
}
