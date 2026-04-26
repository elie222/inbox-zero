import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { SCOPES } from "@/utils/gmail/scopes";
import { handleGmailPermissionsCheck } from "./permissions";

vi.mock("server-only", () => ({}));
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

  it("reports missing scopes from stored granted scopes in emulation", async () => {
    const oauth = await import("@/utils/google/oauth");
    vi.mocked(oauth.isGoogleOauthEmulationEnabled).mockReturnValue(true);

    const result = await handleGmailPermissionsCheck({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      emailAccountId: "email-account-1",
      grantedScope: SCOPES.slice(0, -1).join(" "),
    });

    expect(result).toEqual({
      hasAllPermissions: false,
      missingScopes: [SCOPES.at(-1)!],
    });
    expect(global.fetch).not.toHaveBeenCalled();
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
      missingScopes: SCOPES,
    });
  });
});
