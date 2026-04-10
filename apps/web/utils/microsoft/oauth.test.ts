import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockHttpsRequest = vi.hoisted(() => vi.fn());

vi.mock("node:https", () => ({
  request: mockHttpsRequest,
}));

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
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mockHttpsRequest.mockImplementation(
      createHttpsJsonResponse({
        access_token: "access-token",
      }),
    );

    const response = await oauth.requestMicrosoftToken({
      client_id: "client-id",
      grant_type: "refresh_token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockHttpsRequest).toHaveBeenCalledTimes(1);
    expect(mockHttpsRequest.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        hostname: "login.microsoftonline.com",
        family: 4,
        method: "POST",
      }),
    );
    await expect(response.json()).resolves.toEqual({
      access_token: "access-token",
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

function createHttpsJsonResponse(payload: unknown, statusCode = 200) {
  return (
    _options: unknown,
    callback: (
      response: EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
      },
    ) => void,
  ) => {
    const response = new EventEmitter() as EventEmitter & {
      statusCode: number;
      headers: Record<string, string>;
    };
    response.statusCode = statusCode;
    response.headers = { "content-type": "application/json" };

    const request = new EventEmitter() as EventEmitter & {
      write: (chunk: string | Buffer) => void;
      end: () => void;
    };
    request.write = vi.fn();
    request.end = () => {
      callback(response);
      response.emit("data", Buffer.from(JSON.stringify(payload)));
      response.emit("end");
    };

    return request;
  };
}
