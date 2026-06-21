import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    MOBILE_AUTH_ORIGIN: "inboxzero://",
    NEXT_PUBLIC_BASE_URL: "https://www.getinboxzero.com",
  },
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

import {
  getMobileAuthAppCallbackUrl,
  getMobileAuthBaseUrlOrigin,
  getMobileAuthWebCallbackUrl,
} from "./url";

describe("mobile auth URL helpers", () => {
  beforeEach(() => {
    mockEnv.MOBILE_AUTH_ORIGIN = "inboxzero://";
    mockEnv.NEXT_PUBLIC_BASE_URL = "https://www.getinboxzero.com";
  });

  it("builds the web callback URL from the configured base origin", () => {
    expect(getMobileAuthWebCallbackUrl("state-1234567890")).toBe(
      "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
    );
    expect(getMobileAuthBaseUrlOrigin()).toBe("https://www.getinboxzero.com");
  });

  it("uses the HTTPS app callback URL for production", () => {
    expect(getMobileAuthAppCallbackUrl().toString()).toBe(
      "https://www.getinboxzero.com/auth-callback",
    );
  });

  it("builds custom-scheme callback URLs when requested", () => {
    expect(getMobileAuthAppCallbackUrl("custom-scheme").toString()).toBe(
      "inboxzero://auth-callback",
    );
  });

  it("fails custom-scheme callback URL requests when the scheme is not configured", () => {
    mockEnv.MOBILE_AUTH_ORIGIN = "";

    expect(() => getMobileAuthAppCallbackUrl("custom-scheme")).toThrow(
      "MOBILE_AUTH_ORIGIN is required for mobile custom scheme",
    );
  });

  it("uses the custom-scheme app callback URL for local development", () => {
    mockEnv.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";

    expect(getMobileAuthWebCallbackUrl("state-1234567890")).toBe(
      "http://localhost:3000/api/mobile-auth/callback?state=state-1234567890",
    );
    expect(getMobileAuthBaseUrlOrigin()).toBe("http://localhost:3000");
    expect(getMobileAuthAppCallbackUrl().toString()).toBe(
      "inboxzero://auth-callback",
    );
  });
});
