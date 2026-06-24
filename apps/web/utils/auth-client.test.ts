import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
const mockCreateAuthClient = vi.fn(() => ({
  getSession: vi.fn(),
  signIn: {
    oauth2: vi.fn(),
    social: vi.fn(),
  },
  signOut: vi.fn(),
  signUp: vi.fn(),
  sso: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: mockCreateAuthClient,
}));

vi.mock("@better-auth/sso/client", () => ({
  ssoClient: vi.fn(() => "sso-client"),
}));

vi.mock("better-auth/client/plugins", () => ({
  genericOAuthClient: vi.fn(() => "generic-oauth-client"),
  organizationClient: vi.fn(() => "organization-client"),
}));

describe("auth-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses same-origin auth requests for the browser client", async () => {
    await import("./auth-client");

    expect(mockCreateAuthClient).toHaveBeenCalledWith({
      plugins: ["sso-client", "organization-client"],
    });
  });
});

describe("signInWithOauth2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("does not attach a fallback error message to successful responses", async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({
        url: "https://example.com/oauth",
      }),
      ok: true,
      status: 200,
    });

    const { signInWithOauth2 } = await import("./auth-client");

    const result = await signInWithOauth2({
      callbackURL: "/welcome",
      errorCallbackURL: "/login/error",
      providerId: "google",
    });

    expect(result).toEqual({
      error: undefined,
      url: "https://example.com/oauth",
    });
  });

  it("uses the fallback error message only for failed responses", async () => {
    mockFetch.mockResolvedValue({
      json: async () => ({}),
      ok: false,
      status: 500,
    });

    const { signInWithOauth2 } = await import("./auth-client");

    await expect(
      signInWithOauth2({
        callbackURL: "/welcome",
        errorCallbackURL: "/login/error",
        providerId: "google",
      }),
    ).rejects.toThrow("Request failed with status 500");
  });
});
