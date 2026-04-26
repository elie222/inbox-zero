import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("google oauth helpers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.doUnmock("@/env");
  });

  it("uses production OAuth endpoints by default", async () => {
    const oauth = await importGoogleOauthModule();

    expect(oauth.isGoogleOauthEmulationEnabled()).toBe(false);
    expect(oauth.getGoogleOauthDiscoveryUrl()).toBe(
      "https://accounts.google.com/.well-known/openid-configuration",
    );
    expect(oauth.getGoogleOauthIssuer()).toBe("https://accounts.google.com");
    expect(
      oauth.getGoogleOauthClientOptions("http://localhost:3000/callback"),
    ).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
    });
    expect(oauth.getGoogleOauthTokenUrl()).toBe(
      "https://oauth2.googleapis.com/token",
    );
    expect(oauth.getGoogleApiRootUrl()).toBe("https://www.googleapis.com/");
    expect(oauth.getGoogleGmailApiRootUrl()).toBe(
      "https://gmail.googleapis.com/",
    );
    expect(oauth.getGoogleGmailBatchUrl()).toBe(
      "https://gmail.googleapis.com/batch/gmail/v1",
    );
    expect(oauth.getGooglePeopleApiRootUrl()).toBe(
      "https://people.googleapis.com/",
    );
    expect(oauth.getGoogleTokenInfoUrl("token")).toBe(
      "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=token",
    );
  });

  it("uses emulator OAuth endpoints when configured", async () => {
    const oauth = await importGoogleOauthModule({
      GOOGLE_BASE_URL: "http://localhost:4444/",
    });

    expect(oauth.isGoogleOauthEmulationEnabled()).toBe(true);
    expect(oauth.getGoogleOauthDiscoveryUrl()).toBe(
      "http://localhost:4444/.well-known/openid-configuration",
    );
    expect(oauth.getGoogleOauthIssuer()).toBe("http://localhost:4444");
    expect(
      oauth.getGoogleOauthClientOptions("http://localhost:3000/callback"),
    ).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/callback",
      endpoints: {
        oauth2AuthBaseUrl: "http://localhost:4444/o/oauth2/v2/auth",
        oauth2TokenUrl: "http://localhost:4444/oauth2/token",
        oauth2RevokeUrl: "http://localhost:4444/oauth2/revoke",
      },
      issuers: ["http://localhost:4444"],
    });
    expect(oauth.getGoogleOauthTokenUrl()).toBe(
      "http://localhost:4444/oauth2/token",
    );
    expect(oauth.getGoogleApiRootUrl()).toBe("http://localhost:4444");
    expect(oauth.getGoogleGmailApiRootUrl()).toBe("http://localhost:4444");
    expect(oauth.getGoogleGmailBatchUrl()).toBe(
      "http://localhost:4444/batch/gmail/v1",
    );
    expect(oauth.getGooglePeopleApiRootUrl()).toBe("http://localhost:4444");
    expect(oauth.getGoogleTokenInfoUrl("token")).toBe(
      "http://localhost:4444/oauth2/v1/tokeninfo?access_token=token",
    );
  });

  it("fetches and validates the OpenID profile", async () => {
    const oauth = await importGoogleOauthModule({
      GOOGLE_BASE_URL: "http://localhost:4444",
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "google-user-1",
        email: "user@example.com",
        picture: null,
      }),
    } as unknown as Response);

    await expect(oauth.fetchGoogleOpenIdProfile("token")).resolves.toEqual({
      sub: "google-user-1",
      email: "user@example.com",
      picture: null,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:4444/oauth2/v2/userinfo",
      {
        headers: {
          Authorization: "Bearer token",
        },
      },
    );
  });

  it("throws when the OpenID profile is missing required fields", async () => {
    const oauth = await importGoogleOauthModule();

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        sub: "google-user-1",
      }),
    } as unknown as Response);

    await expect(oauth.fetchGoogleOpenIdProfile("token")).rejects.toThrow(
      "Invalid Google profile response",
    );
  });
});

async function importGoogleOauthModule(
  envOverrides?: Partial<{
    GOOGLE_BASE_URL: string | undefined;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
  }>,
) {
  vi.doMock("@/env", () => ({
    env: {
      GOOGLE_BASE_URL: undefined,
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      ...envOverrides,
    },
  }));

  return import("./oauth");
}
