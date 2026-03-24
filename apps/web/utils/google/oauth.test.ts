import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    GOOGLE_OAUTH_BASE_URL: undefined,
  },
}));

import { fetchGoogleOpenIdProfile } from "./oauth";

describe("fetchGoogleOpenIdProfile", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns a validated OpenID profile", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "google-user-1",
        email: "user@example.com",
        name: "Example User",
      }),
    } as unknown as Response);

    await expect(fetchGoogleOpenIdProfile("token")).resolves.toEqual({
      sub: "google-user-1",
      email: "user@example.com",
      name: "Example User",
    });
  });

  it("throws when the profile payload is missing required fields", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "google-user-1",
      }),
    } as unknown as Response);

    await expect(fetchGoogleOpenIdProfile("token")).rejects.toThrow(
      "Invalid Google profile response",
    );
  });

  it("throws when required identity fields are empty strings", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "",
        email: "",
      }),
    } as unknown as Response);

    await expect(fetchGoogleOpenIdProfile("token")).rejects.toThrow(
      "Invalid Google profile response",
    );
  });
});
