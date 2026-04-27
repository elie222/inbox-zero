import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  betterAuthMock,
  createPrivateKeyMock,
  createSignMock,
  expoMock,
  mockedEnv,
  nextCookiesMock,
  oauthProxyMock,
  prismaAccountFindUniqueMock,
  prismaAdapterMock,
  ssoMock,
} = vi.hoisted(() => ({
  betterAuthMock: vi.fn((config) => config),
  createPrivateKeyMock: vi.fn(() => ({ key: "private-key" })),
  createSignMock: vi.fn(() => ({
    end: vi.fn(),
    sign: vi.fn(() => Buffer.from("signature")),
    update: vi.fn(),
  })),
  expoMock: vi.fn(() => ({ id: "expo-plugin" })),
  mockedEnv: {
    ADDITIONAL_TRUSTED_ORIGINS: ["https://extra.example.com"],
    APPLE_APP_BUNDLE_IDENTIFIER: "com.example.mobile",
    APPLE_CLIENT_ID: "com.example.web",
    APPLE_KEY_ID: "APPLE_KEY_ID",
    APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
    APPLE_TEAM_ID: "APPLE_TEAM_ID",
    AUTH_SECRET: "auth-secret",
    AUTO_ENABLE_ORG_ANALYTICS: false,
    AUTO_JOIN_ORGANIZATION_ENABLED: false,
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    IS_OAUTH_PROXY_SERVER: false,
    MICROSOFT_CLIENT_ID: undefined,
    MICROSOFT_CLIENT_SECRET: undefined,
    MICROSOFT_TENANT_ID: "common",
    MOBILE_AUTH_ORIGIN: "com.example.mobile://auth",
    NEXTAUTH_SECRET: undefined,
    NEXT_PUBLIC_BASE_URL: "https://app.example.com",
    OAUTH_PROXY_URL: undefined,
  },
  nextCookiesMock: vi.fn(() => ({ id: "next-cookies-plugin" })),
  oauthProxyMock: vi.fn(() => ({ id: "oauth-proxy-plugin" })),
  prismaAccountFindUniqueMock: vi.fn(),
  prismaAdapterMock: vi.fn(() => ({ id: "prisma-adapter" })),
  ssoMock: vi.fn(() => ({ id: "sso-plugin" })),
}));

vi.mock("node:crypto", () => ({
  createPrivateKey: createPrivateKeyMock,
  createSign: createSignMock,
}));

vi.mock("@/env", () => ({
  env: mockedEnv,
}));

vi.mock("better-auth", () => ({
  betterAuth: betterAuthMock,
}));

vi.mock("@better-auth/sso", () => ({
  sso: ssoMock,
}));

vi.mock("@better-auth/expo", () => ({
  expo: expoMock,
}));

vi.mock("better-auth/plugins", () => ({
  oAuthProxy: oauthProxyMock,
}));

vi.mock("better-auth/plugins/generic-oauth", () => ({
  genericOAuth: vi.fn(() => ({ id: "generic-oauth-plugin" })),
}));

vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: prismaAdapterMock,
}));

vi.mock("better-auth/next-js", () => ({
  nextCookies: nextCookiesMock,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("@/utils/auth-signup-policy", () => ({
  assertAllowedAuthSignupEmail: vi.fn(),
  isAllowedAuthSignupEmail: vi.fn(() => true),
}));

vi.mock("@/utils/dub", () => ({
  trackDubSignUp: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/utils/email/provider-types", () => ({
  isGoogleProvider: vi.fn((providerId: string) => providerId === "google"),
  isMicrosoftProvider: vi.fn((providerId: string) => providerId === "microsoft"),
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/utils/error-messages", () => ({
  ErrorType: {
    ACCOUNT_DISCONNECTED: "ACCOUNT_DISCONNECTED",
  },
  clearSpecificErrorMessages: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/utils/gmail/client", () => ({
  getContactsClient: vi.fn(),
}));

vi.mock("@/utils/gmail/scopes", () => ({
  SCOPES: ["gmail.readonly"],
}));

vi.mock("@/utils/google/oauth", () => ({
  fetchGoogleOpenIdProfile: vi.fn(),
  getGoogleOauthDiscoveryUrl: vi.fn(() => "https://google.example.com/discovery"),
  getGoogleOauthIssuer: vi.fn(() => "https://google.example.com"),
  isGoogleOauthEmulationEnabled: vi.fn(() => false),
}));

vi.mock("@/utils/logger", () => ({
  createScopedLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    with: vi.fn(),
  })),
}));

vi.mock("@/utils/microsoft/oauth", () => ({
  getMicrosoftOauthDiscoveryUrl: vi.fn(
    () => "https://microsoft.example.com/discovery",
  ),
  getMicrosoftOauthIssuer: vi.fn(() => "https://microsoft.example.com"),
  isMicrosoftEmulationEnabled: vi.fn(() => false),
}));

vi.mock("@/utils/oauth/provider-config", () => ({
  hasAppleOauthConfig: vi.fn(() => true),
  hasMicrosoftOauthConfig: vi.fn(() => false),
}));

vi.mock("@/utils/outlook/client", () => ({
  createOutlookClient: vi.fn(),
}));

vi.mock("@/utils/outlook/scopes", () => ({
  SCOPES: ["mail.read"],
}));

vi.mock("@/utils/premium/seats", () => ({
  claimPendingPremiumInvite: vi.fn(() => Promise.resolve(undefined)),
  updateAccountSeats: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    account: {
      findUnique: (...args: unknown[]) => prismaAccountFindUniqueMock(...args),
    },
  },
}));

vi.mock("@inboxzero/loops", () => ({
  createContact: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@inboxzero/resend", () => ({
  createContact: vi.fn(() => Promise.resolve(undefined)),
}));

import { betterAuthConfig } from "./auth";

describe("betterAuthConfig Apple mobile login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("configures native Apple mobile auth with trusted origins", () => {
    const appleProvider = getAppleProvider();

    expect(appleProvider.appBundleIdentifier).toBe(
      mockedEnv.APPLE_APP_BUNDLE_IDENTIFIER,
    );
    expect(getTrustedOrigins()).toEqual(
      expect.arrayContaining([
        mockedEnv.NEXT_PUBLIC_BASE_URL,
        "https://appleid.apple.com",
        mockedEnv.MOBILE_AUTH_ORIGIN,
      ]),
    );
  });

  it("falls back to the linked Apple account email when the profile omits it", async () => {
    prismaAccountFindUniqueMock.mockResolvedValue({
      user: { email: "linked@example.com" },
    });

    const result = await getAppleProvider().mapProfileToUser({
      sub: "apple-user-123",
    });

    expect(prismaAccountFindUniqueMock).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: "apple",
          providerAccountId: "apple-user-123",
        },
      },
      select: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });
    expect(result).toEqual({ email: "linked@example.com" });
  });
});

function getTrustedOrigins() {
  return (
    betterAuthConfig as unknown as {
      trustedOrigins: string[];
    }
  ).trustedOrigins;
}

function getAppleProvider() {
  return (
    betterAuthConfig as unknown as {
      socialProviders: {
        apple: {
          appBundleIdentifier?: string;
          mapProfileToUser: (profile: {
            email?: string;
            sub: string;
          }) => Promise<Record<string, string>>;
        };
      };
    }
  ).socialProviders.apple;
}
