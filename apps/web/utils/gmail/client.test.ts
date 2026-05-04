import { beforeEach, describe, expect, it, vi } from "vitest";
import { people } from "@googleapis/people";
import { auth } from "@googleapis/gmail";
import prisma from "@/utils/__mocks__/prisma";
import { saveTokens } from "@/utils/auth/save-tokens";
import {
  getContactsClient,
  getGmailClientWithRefresh,
  getLinkingOAuth2Client,
} from "@/utils/gmail/client";
import {
  getGoogleGmailApiRootUrl,
  getGoogleOauthClientOptions,
  getGooglePeopleApiRootUrl,
} from "@/utils/google/oauth";
import { gmail } from "@googleapis/gmail";
import { acquireOwnedLock, clearOwnedLock } from "@/utils/redis/owned-lock";

vi.mock("@/utils/auth/save-tokens", () => ({
  saveTokens: vi.fn(),
  isTokenSaveConflict: vi.fn(() => false),
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/redis/owned-lock", () => ({
  acquireOwnedLock: vi.fn(),
  clearOwnedLock: vi.fn(),
}));

vi.mock("@/utils/google/oauth", () => ({
  getGoogleOauthClientOptions: vi.fn((redirectUri?: string) => ({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri,
    endpoints: {
      oauth2TokenUrl: "http://localhost:4444/oauth2/token",
    },
  })),
  getGoogleGmailApiRootUrl: vi.fn(() => "http://localhost:4444"),
  getGooglePeopleApiRootUrl: vi.fn(() => "http://localhost:4444"),
}));

const setCredentials = vi.fn();
const refreshAccessToken = vi.fn();
const logger = {
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: vi.fn(),
  with: vi.fn(),
} as any;

vi.mock("@googleapis/gmail", () => ({
  auth: {
    OAuth2: vi.fn(function OAuth2() {
      return {
        setCredentials,
        refreshAccessToken,
      };
    }),
  },
  gmail: vi.fn(),
}));

vi.mock("@googleapis/people", () => ({
  people: vi.fn(),
}));

describe("gmail oauth client configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquireOwnedLock).mockResolvedValue("lock-token");
    vi.mocked(clearOwnedLock).mockResolvedValue(true);
  });

  it("uses emulator-aware OAuth options for account refresh clients", () => {
    getContactsClient({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 123,
    });

    expect(getGoogleOauthClientOptions).toHaveBeenCalledWith();
    expect(auth.OAuth2).toHaveBeenCalledWith({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: undefined,
      endpoints: {
        oauth2TokenUrl: "http://localhost:4444/oauth2/token",
      },
    });
    expect(setCredentials).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expiry_date: undefined,
      scope: expect.any(String),
    });
    expect(getGooglePeopleApiRootUrl).toHaveBeenCalledWith();
    expect(people).toHaveBeenCalledWith({
      version: "v1",
      auth: expect.any(Object),
      rootUrl: "http://localhost:4444",
    });
  });

  it("uses emulator-aware OAuth options for the linking client", () => {
    getLinkingOAuth2Client();

    expect(getGoogleOauthClientOptions).toHaveBeenCalledWith(
      "http://localhost:3000/api/google/linking/callback",
    );
    expect(auth.OAuth2).toHaveBeenCalledWith({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/google/linking/callback",
      endpoints: {
        oauth2TokenUrl: "http://localhost:4444/oauth2/token",
      },
    });
  });

  it("uses emulator-aware Gmail root URLs when refreshing tokens", async () => {
    refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access-token",
      },
    });

    await getGmailClientWithRefresh({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: null,
      emailAccountId: "email-account-id",
      logger,
    });

    expect(getGoogleGmailApiRootUrl).toHaveBeenCalledWith();
    expect(gmail).toHaveBeenCalledWith({
      version: "v1",
      auth: expect.any(Object),
      rootUrl: "http://localhost:4444",
    });
  });

  it("uses a distributed lock when refreshing an expired Gmail token", async () => {
    const staleExpiresAt = Date.now() - 1000;
    refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access-token",
        expiry_date: Date.now() + 3_600_000,
      },
    });

    await getGmailClientWithRefresh({
      accessToken: "stale-access-token",
      refreshToken: "refresh-token",
      expiresAt: staleExpiresAt,
      emailAccountId: "email-account-id",
      logger,
    });

    expect(acquireOwnedLock).toHaveBeenCalledWith({
      key: "oauth-token-refresh:google:email-account-id",
      processingTtlSeconds: 30,
    });
    expect(saveTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        accountRefreshToken: "refresh-token",
        provider: "google",
        expectedExpiresAt: staleExpiresAt,
        tokens: expect.objectContaining({
          access_token: "new-access-token",
        }),
      }),
    );
    expect(clearOwnedLock).toHaveBeenCalledWith({
      key: "oauth-token-refresh:google:email-account-id",
      lockToken: "lock-token",
    });
  });

  it("reuses the persisted Gmail token when another process owns the refresh lock", async () => {
    vi.mocked(acquireOwnedLock).mockResolvedValue(null);
    prisma.emailAccount.findUnique.mockResolvedValue({
      account: {
        access_token: "fresh-access-token",
        refresh_token: "refresh-token",
        expires_at: new Date(Date.now() + 3_600_000),
      },
    } as any);

    await getGmailClientWithRefresh({
      accessToken: "stale-access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() - 1000,
      emailAccountId: "email-account-id",
      logger,
    });

    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
    expect(setCredentials).toHaveBeenLastCalledWith(
      expect.objectContaining({
        access_token: "fresh-access-token",
        refresh_token: "refresh-token",
      }),
    );
  });

  it("refreshes Gmail immediately when the refresh lock store is unavailable", async () => {
    vi.mocked(acquireOwnedLock).mockRejectedValue(new Error("redis down"));
    refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access-token",
        expiry_date: Date.now() + 3_600_000,
      },
    });

    await getGmailClientWithRefresh({
      accessToken: "stale-access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() - 1000,
      emailAccountId: "email-account-id",
      logger,
    });

    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
    expect(refreshAccessToken).toHaveBeenCalledOnce();
  });
});
