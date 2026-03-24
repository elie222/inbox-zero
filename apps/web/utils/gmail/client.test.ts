import { beforeEach, describe, expect, it, vi } from "vitest";
import { people } from "@googleapis/people";
import { auth } from "@googleapis/gmail";
import {
  getContactsClient,
  getLinkingOAuth2Client,
} from "@/utils/gmail/client";
import { getGoogleOauthClientOptions } from "@/utils/google/oauth";

vi.mock("@/utils/auth", () => ({
  saveTokens: vi.fn(),
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
}));

const setCredentials = vi.fn();

vi.mock("@googleapis/gmail", () => ({
  auth: {
    OAuth2: vi.fn(function OAuth2() {
      return {
        setCredentials,
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
    expect(people).toHaveBeenCalled();
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
});
