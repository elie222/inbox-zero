import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {} as {
    STRIPE_API_BASE_URL?: string;
    STRIPE_SECRET_KEY?: string;
  },
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

describe("getStripe", () => {
  beforeEach(() => {
    vi.resetModules();
    mockEnv.STRIPE_SECRET_KEY = "test-key";
    mockEnv.STRIPE_API_BASE_URL = undefined;
  });

  it("targets Stripe when no emulator override is set", async () => {
    const { getStripe } = await import("./index");

    expect(getStripe().getApiField("host")).toBe("api.stripe.com");
  });

  it("targets a loopback emulator when the override is set", async () => {
    mockEnv.STRIPE_API_BASE_URL = "http://127.0.0.1:4005";
    const { getStripe } = await import("./index");
    const stripe = getStripe();

    expect(stripe.getApiField("host")).toBe("127.0.0.1");
    expect(stripe.getApiField("port")).toBe("4005");
    expect(stripe.getApiField("protocol")).toBe("http");
  });

  // This client sends STRIPE_SECRET_KEY on every request, so an override that
  // pointed elsewhere would hand a live key to another host.
  it.each([
    "http://stripe.example.com",
    "https://stripe.example.com",
    "http://169.254.169.254",
    "ftp://127.0.0.1",
  ])("refuses the override %s", async (baseUrl) => {
    mockEnv.STRIPE_API_BASE_URL = baseUrl;
    const { getStripe } = await import("./index");

    expect(() => getStripe()).toThrow(/loopback/);
  });
});
