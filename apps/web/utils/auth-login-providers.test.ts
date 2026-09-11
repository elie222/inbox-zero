import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("better-auth", () => ({
  betterAuth: vi.fn((options: unknown) => ({
    api: {
      getSession: vi.fn(),
    },
    options,
  })),
}));

vi.mock("@/utils/prisma");
vi.mock("@googleapis/people", () => ({
  people: vi.fn(),
}));
vi.mock("@googleapis/gmail", () => ({
  auth: {
    OAuth2: vi.fn(),
  },
}));
vi.mock("@/utils/encryption", () => ({
  encryptToken: vi.fn((token) => token),
}));

describe("betterAuthConfig login providers", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/utils/oauth/login-providers");
  });

  it("does not register social providers when only SSO login is enabled", async () => {
    const betterAuthConfig = await loadBetterAuthConfig(["sso"]);

    expect(betterAuthConfig.options.socialProviders).toEqual({});
  });

  it("registers only enabled social providers", async () => {
    const betterAuthConfig = await loadBetterAuthConfig(["apple"]);

    expect(Object.keys(betterAuthConfig.options.socialProviders)).toEqual([
      "apple",
    ]);
  });
});

async function loadBetterAuthConfig(enabledProviders: string[]) {
  vi.resetModules();
  vi.doMock("@/utils/oauth/login-providers", () => ({
    getEnabledLoginProviders: () => new Set(enabledProviders),
  }));

  const { betterAuthConfig } = await import("@/utils/auth");

  return betterAuthConfig as any;
}
