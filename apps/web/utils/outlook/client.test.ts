import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@microsoft/microsoft-graph-client";
import prisma from "@/utils/__mocks__/prisma";
import { saveTokens } from "@/utils/auth/save-tokens";
import {
  createOutlookClient,
  getLinkingOAuth2Url,
  getOutlookClientWithRefresh,
} from "./client";
import {
  getMicrosoftGraphClientOptions,
  getMicrosoftOauthAuthorizeUrl,
  requestMicrosoftToken,
} from "@/utils/microsoft/oauth";
import { acquireOwnedLock, clearOwnedLock } from "@/utils/redis/owned-lock";

vi.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    init: vi.fn(),
  },
}));

vi.mock("@/utils/auth/save-tokens", () => ({
  saveTokens: vi.fn(),
  isTokenSaveConflict: vi.fn(() => false),
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/auth/cleanup-invalid-tokens", () => ({
  cleanupInvalidTokens: vi.fn(),
}));

vi.mock("@/utils/redis/owned-lock", () => ({
  acquireOwnedLock: vi.fn(),
  clearOwnedLock: vi.fn(),
}));

vi.mock("@/utils/microsoft/oauth", () => ({
  getMicrosoftGraphClientOptions: vi.fn(() => ({
    baseUrl: "http://localhost:4003/",
    customHosts: new Set(["localhost"]),
    defaultVersion: "v1.0",
    fetchOptions: {
      headers: {
        Authorization: "Bearer emulator-token",
      },
    },
  })),
  getMicrosoftOauthAuthorizeUrl: vi.fn(
    () => "http://localhost:4003/oauth2/v2.0/authorize",
  ),
  getMicrosoftOauthTokenUrl: vi.fn(),
  requestMicrosoftToken: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    MICROSOFT_CLIENT_ID: "client-id",
    MICROSOFT_CLIENT_SECRET: "client-secret",
    MICROSOFT_TENANT_ID: "common",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: false,
  },
}));

describe("outlook client emulator configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(acquireOwnedLock).mockResolvedValue("lock-token");
    vi.mocked(clearOwnedLock).mockResolvedValue(true);
  });

  it("passes emulator-aware Graph options into the client", () => {
    createOutlookClient("emulator-token", {
      error: vi.fn(),
      info: vi.fn(),
      trace: vi.fn(),
      warn: vi.fn(),
      with: vi.fn(),
    } as any);

    expect(getMicrosoftGraphClientOptions).toHaveBeenCalledWith(
      "emulator-token",
    );
    expect(Client.init).toHaveBeenCalledWith({
      authProvider: expect.any(Function),
      baseUrl: "http://localhost:4003/",
      customHosts: new Set(["localhost"]),
      defaultVersion: "v1.0",
      fetchOptions: {
        headers: {
          Authorization: "Bearer emulator-token",
          Prefer: 'IdType="ImmutableId"',
        },
      },
    });
  });

  it("uses the emulator authorize URL for linking", () => {
    const url = new URL(getLinkingOAuth2Url());

    expect(url.origin + url.pathname).toBe(
      "http://localhost:4003/oauth2/v2.0/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/outlook/linking/callback",
    );
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(
      "openid profile email User.Read offline_access Mail.ReadWrite MailboxSettings.ReadWrite",
    );
    expect(getMicrosoftOauthAuthorizeUrl).toHaveBeenCalledWith();
  });

  it("uses a distributed lock when refreshing an expired Outlook token", async () => {
    const staleExpiresAt = Date.now() - 1000;
    vi.mocked(requestMicrosoftToken).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        expires_in: 3600,
      }),
    } as any);

    await getOutlookClientWithRefresh({
      accessToken: "stale-access-token",
      refreshToken: "refresh-token",
      expiresAt: staleExpiresAt,
      emailAccountId: "email-account-id",
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        trace: vi.fn(),
        warn: vi.fn(),
        with: vi.fn(),
      } as any,
    });

    expect(acquireOwnedLock).toHaveBeenCalledWith({
      key: "oauth-token-refresh:microsoft:email-account-id",
      processingTtlSeconds: 30,
    });
    expect(saveTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "email-account-id",
        accountRefreshToken: "refresh-token",
        provider: "microsoft",
        expectedExpiresAt: staleExpiresAt,
        tokens: expect.objectContaining({
          access_token: "new-access-token",
        }),
      }),
    );
    expect(clearOwnedLock).toHaveBeenCalledWith({
      key: "oauth-token-refresh:microsoft:email-account-id",
      lockToken: "lock-token",
    });
  });

  it("reuses the persisted Outlook token when another process owns the refresh lock", async () => {
    vi.mocked(acquireOwnedLock).mockResolvedValue(null);
    prisma.emailAccount.findUnique.mockResolvedValue({
      account: {
        access_token: "fresh-access-token",
        refresh_token: "refresh-token",
        expires_at: new Date(Date.now() + 3_600_000),
      },
    } as any);

    await getOutlookClientWithRefresh({
      accessToken: "stale-access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() - 1000,
      emailAccountId: "email-account-id",
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        trace: vi.fn(),
        warn: vi.fn(),
        with: vi.fn(),
      } as any,
    });

    expect(requestMicrosoftToken).not.toHaveBeenCalled();
    expect(saveTokens).not.toHaveBeenCalled();
    expect(getMicrosoftGraphClientOptions).toHaveBeenCalledWith(
      "fresh-access-token",
    );
  });

  it("refreshes Outlook immediately when the refresh lock store is unavailable", async () => {
    vi.mocked(acquireOwnedLock).mockRejectedValue(new Error("redis down"));
    vi.mocked(requestMicrosoftToken).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        expires_in: 3600,
      }),
    } as any);

    await getOutlookClientWithRefresh({
      accessToken: "stale-access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() - 1000,
      emailAccountId: "email-account-id",
      logger: {
        error: vi.fn(),
        info: vi.fn(),
        trace: vi.fn(),
        warn: vi.fn(),
        with: vi.fn(),
      } as any,
    });

    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
    expect(requestMicrosoftToken).toHaveBeenCalledOnce();
  });
});
