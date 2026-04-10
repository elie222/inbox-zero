import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("microsoft oauth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/env");
    vi.unstubAllGlobals();
  });

  it("uses production Microsoft endpoints by default", async () => {
    const oauth = await importMicrosoftOauthModule();

    expect(oauth.isMicrosoftEmulationEnabled()).toBe(false);
    expect(oauth.getMicrosoftOauthDiscoveryUrl()).toBe(
      "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
    );
    expect(oauth.getMicrosoftOauthIssuer()).toBe(
      "https://login.microsoftonline.com/common/v2.0",
    );
    expect(oauth.getMicrosoftOauthAuthorizeUrl()).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(oauth.getMicrosoftOauthTokenUrl()).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    );
    expect(oauth.getMicrosoftGraphApiRootUrl()).toBe(
      "https://graph.microsoft.com/v1.0",
    );
    expect(oauth.getMicrosoftGraphUrl("/me")).toBe(
      "https://graph.microsoft.com/v1.0/me",
    );
    expect(oauth.getMicrosoftGraphClientOptions("token")).toEqual({});
  });

  it("uses emulator endpoints when configured", async () => {
    const oauth = await importMicrosoftOauthModule({
      MICROSOFT_BASE_URL: "http://localhost:4003/",
    });

    expect(oauth.isMicrosoftEmulationEnabled()).toBe(true);
    expect(oauth.getMicrosoftOauthDiscoveryUrl()).toBe(
      "http://localhost:4003/.well-known/openid-configuration",
    );
    expect(oauth.getMicrosoftOauthIssuer()).toBe("http://localhost:4003");
    expect(oauth.getMicrosoftOauthAuthorizeUrl()).toBe(
      "http://localhost:4003/oauth2/v2.0/authorize",
    );
    expect(oauth.getMicrosoftOauthTokenUrl()).toBe(
      "http://localhost:4003/oauth2/v2.0/token",
    );
    expect(oauth.getMicrosoftGraphApiRootUrl()).toBe(
      "http://localhost:4003/v1.0",
    );
    expect(oauth.getMicrosoftGraphUrl("me/photo/$value")).toBe(
      "http://localhost:4003/v1.0/me/photo/$value",
    );
    expect(oauth.getMicrosoftGraphClientOptions("emulator-token")).toEqual({
      baseUrl: "http://localhost:4003/",
      customHosts: new Set(["localhost"]),
      defaultVersion: "v1.0",
      fetchOptions: {
        headers: {
          Authorization: "Bearer emulator-token",
        },
      },
    });
  });

  it("posts token requests to the emulator token endpoint", async () => {
    const oauth = await importMicrosoftOauthModule({
      MICROSOFT_BASE_URL: "http://localhost:4003",
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await oauth.requestMicrosoftToken({
      client_id: "client-id",
      grant_type: "refresh_token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4003/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: "client-id",
          grant_type: "refresh_token",
        }),
      },
    );
  });

  it("retries Microsoft token requests with IPv4 after an IPv6 reachability failure", async () => {
    const oauth = await importMicrosoftOauthModule();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(createFetchFailedError("ENETUNREACH"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const response = await oauth.requestMicrosoftToken({
      client_id: "client-id",
      grant_type: "refresh_token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        dispatcher: expect.any(Object),
        method: "POST",
      }),
    );
    await expect(response.json()).resolves.toEqual({});
  });

  it("returns the Microsoft user profile and derived email", async () => {
    const oauth = await importMicrosoftOauthModule();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "user-id",
        userPrincipalName: "user@example.com",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      oauth.fetchMicrosoftUserProfile("access-token"),
    ).resolves.toEqual({
      profile: {
        id: "user-id",
        userPrincipalName: "user@example.com",
      },
      email: "user@example.com",
    });
  });

  it("throws a typed error when the Microsoft profile request fails", async () => {
    const oauth = await importMicrosoftOauthModule();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(
      oauth.fetchMicrosoftUserProfile("access-token"),
    ).rejects.toMatchObject({
      message: "Failed to fetch Microsoft user profile",
      status: 503,
    });
  });
});

async function importMicrosoftOauthModule(
  envOverrides?: Partial<{
    MICROSOFT_BASE_URL: string | undefined;
    MICROSOFT_TENANT_ID: string;
  }>,
) {
  vi.doMock("@/env", () => ({
    env: {
      MICROSOFT_BASE_URL: undefined,
      MICROSOFT_TENANT_ID: "common",
      ...envOverrides,
    },
  }));

  return import("./oauth");
}

function createFetchFailedError(code: string) {
  const connectError = Object.assign(new Error(`connect ${code}`), { code });
  const error = new TypeError("fetch failed") as TypeError & {
    cause: AggregateError;
  };

  error.cause = new AggregateError([connectError], `connect ${code}`);

  return error;
}
