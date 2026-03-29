import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: vi.fn(() => ({
    signIn: {
      social: vi.fn(),
      oauth2: vi.fn(),
    },
    signOut: vi.fn(),
    signUp: vi.fn(),
    useSession: vi.fn(),
    getSession: vi.fn(),
    sso: vi.fn(),
  })),
}));

vi.mock("@better-auth/sso/client", () => ({
  ssoClient: vi.fn(() => ({})),
}));

vi.mock("better-auth/client/plugins", () => ({
  genericOAuthClient: vi.fn(() => ({})),
  organizationClient: vi.fn(() => ({})),
}));

describe("signInWithOauth2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("does not attach a fallback error message to successful responses", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        url: "https://example.com/oauth",
      }),
    });

    const { signInWithOauth2 } = await import("./auth-client");

    const result = await signInWithOauth2({
      providerId: "google",
      callbackURL: "/welcome",
      errorCallbackURL: "/login/error",
    });

    expect(result).toEqual({
      url: "https://example.com/oauth",
      error: undefined,
    });
  });

  it("uses the fallback error message only for failed responses", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const { signInWithOauth2 } = await import("./auth-client");

    await expect(
      signInWithOauth2({
        providerId: "google",
        callbackURL: "/welcome",
        errorCallbackURL: "/login/error",
      }),
    ).rejects.toThrow("Request failed with status 500");
  });
});
