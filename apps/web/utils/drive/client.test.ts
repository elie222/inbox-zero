import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@googleapis/drive";
import {
  exchangeGoogleDriveCode,
  getGoogleDriveOAuth2Client,
} from "@/utils/drive/client";
import {
  fetchGoogleOpenIdProfile,
  getGoogleOauthClientOptions,
  isGoogleOauthEmulationEnabled,
} from "@/utils/google/oauth";

const getToken = vi.fn();
const verifyIdToken = vi.fn();

vi.mock("@/utils/google/oauth", () => ({
  fetchGoogleOpenIdProfile: vi.fn(),
  getGoogleOauthClientOptions: vi.fn((redirectUri?: string) => ({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri,
  })),
  isGoogleOauthEmulationEnabled: vi.fn(),
}));

vi.mock("@googleapis/drive", () => ({
  auth: {
    OAuth2: vi.fn(function OAuth2() {
      return {
        getToken,
        verifyIdToken,
      };
    }),
  },
}));

describe("google drive oauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses emulator-aware OAuth options for the drive client", () => {
    getGoogleDriveOAuth2Client();

    expect(getGoogleOauthClientOptions).toHaveBeenCalledWith(
      "http://localhost:3000/api/google/drive/callback",
    );
    expect(auth.OAuth2).toHaveBeenCalled();
  });

  it("uses OpenID userinfo for emulator token exchange", async () => {
    vi.mocked(isGoogleOauthEmulationEnabled).mockReturnValue(true);
    getToken.mockResolvedValue({
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expiry_date: 123,
      },
    });
    vi.mocked(fetchGoogleOpenIdProfile).mockResolvedValue({
      sub: "sub-1",
      email: "user@example.com",
    } as any);

    await expect(exchangeGoogleDriveCode("code")).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(123),
      email: "user@example.com",
    });
    expect(fetchGoogleOpenIdProfile).toHaveBeenCalledWith("access-token");
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("fails when emulator profile does not include an email", async () => {
    vi.mocked(isGoogleOauthEmulationEnabled).mockReturnValue(true);
    getToken.mockResolvedValue({
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
      },
    });
    vi.mocked(fetchGoogleOpenIdProfile).mockResolvedValue({
      sub: "sub-1",
    } as any);

    await expect(exchangeGoogleDriveCode("code")).rejects.toThrow(
      "Could not get email from Google profile",
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
