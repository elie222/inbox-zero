import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { REQUIRED_SCOPES, SCOPES } from "@/utils/gmail/scopes";
import { handleGmailPermissionsCheck } from "./permissions";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_CONTACTS_ENABLED: true },
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/gmail/client", () => ({
  getAccessTokenFromClient: vi.fn(),
  getGmailClientWithRefresh: vi.fn(),
}));
vi.mock("@/utils/google/oauth", () => ({
  getGoogleTokenInfoUrl: vi.fn(
    (accessToken: string) =>
      `https://example.com/tokeninfo?access_token=${accessToken}`,
  ),
  isGoogleOauthEmulationEnabled: vi.fn(() => false),
}));

describe("handleGmailPermissionsCheck", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uses stored granted scopes in Google OAuth emulation", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(true);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: SCOPES.join(" "),
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("accepts comma-separated stored scopes in Google OAuth emulation", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(true);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: SCOPES.join(","),
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports missing scopes from stored granted scopes in emulation", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(true);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: REQUIRED_SCOPES.slice(0, -1).join(" "),
    });

    expect(result).toEqual({
      hasAllPermissions: false,
      missingScopes: [REQUIRED_SCOPES.at(-1)!],
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not require optional contact access", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        scope: REQUIRED_SCOPES.join(" "),
      }),
    } as unknown as Response);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(SCOPES).toHaveLength(REQUIRED_SCOPES.length + 1);
    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
  });

  it("keeps older emulated accounts working when stored scope is missing", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(true);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uses tokeninfo outside Google OAuth emulation", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(false);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ scope: SCOPES.join(" ") }),
    } as unknown as Response);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/tokeninfo?access_token=access-token",
    );
  });

  it("cleans up invalid Gmail tokens after a failed refresh", async () => {
    const oauth = await import("@/utils/google/oauth");
    const gmailClient = await import("@/utils/gmail/client");

    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(false);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ error: "invalid_grant" }),
    } as unknown as Response);
    prisma.emailAccount.findUnique.mockResolvedValue({
      accountId: "account-1",
    } as never);
    vi.mocked(gmailClient.getGmailClientWithRefresh).mockRejectedValue(
      new Error("refresh failed"),
    );

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: false,
      error: "Gmail access expired. Please reconnect your account.",
      missingScopes: REQUIRED_SCOPES,
    });
  });

  it("fails open when the token info request hits a network error", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(false);
    vi.mocked(global.fetch).mockRejectedValue(new Error("network down"));

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/tokeninfo?access_token=access-token",
    );
  });

  it("fails open when the token info request returns a non-OK response", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(false);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
  });

  it("fails closed on 4xx auth errors and refreshes the token", async () => {
    const oauth = await import("@/utils/google/oauth");
    const gmailClient = await import("@/utils/gmail/client");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(false);
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: "invalid_token" }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ scope: SCOPES.join(" ") }),
      } as unknown as Response);
    vi.mocked(gmailClient.getGmailClientWithRefresh).mockResolvedValue(
      {} as never,
    );
    vi.mocked(gmailClient.getAccessTokenFromClient).mockReturnValue(
      "refreshed-token",
    );

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
    expect(gmailClient.getGmailClientWithRefresh).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://example.com/tokeninfo?access_token=refreshed-token",
    );
  });

  it("fails closed on a 200 response with an error body", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(false);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ error: "invalid_token" }),
    } as unknown as Response);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: null,
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: false,
      missingScopes: REQUIRED_SCOPES,
      error: "invalid_token",
    });
  });

  it("fails open on 4xx responses without a token error body", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(false);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
  });

  it("fails open on 4xx responses with an unrecognized error body", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(false);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 429,
      json: vi.fn().mockResolvedValue({
        error: {
          code: 429,
          message: "Quota exceeded",
          status: "RESOURCE_EXHAUSTED",
        },
      }),
    } as unknown as Response);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("fails open on a 200 response with an unrecognized error body", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(false);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ error: "some_backend_error" }),
    } as unknown as Response);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: null,
    });

    expect(result).toEqual({
      hasAllPermissions: true,
      missingScopes: [],
    });
  });
});
