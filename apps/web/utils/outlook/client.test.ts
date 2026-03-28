import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@microsoft/microsoft-graph-client";
import { createOutlookClient, getLinkingOAuth2Url } from "./client";
import {
  getMicrosoftGraphClientOptions,
  getMicrosoftOauthAuthorizeUrl,
} from "@/utils/microsoft/oauth";

vi.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    init: vi.fn(),
  },
}));

vi.mock("@/utils/auth", () => ({
  saveTokens: vi.fn(),
}));

vi.mock("@/utils/auth/cleanup-invalid-tokens", () => ({
  cleanupInvalidTokens: vi.fn(),
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
});
