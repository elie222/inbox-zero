import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createMobileAuthStateMock,
  handlerMock,
  isGoogleOauthEmulationEnabledMock,
  isMicrosoftEmulationEnabledMock,
  mockEnv,
  storeMobileAuthStateMock,
} = vi.hoisted(() => ({
  createMobileAuthStateMock: vi.fn(),
  handlerMock: vi.fn(),
  isGoogleOauthEmulationEnabledMock: vi.fn(),
  isMicrosoftEmulationEnabledMock: vi.fn(),
  mockEnv: {
    DESKTOP_AUTH_ORIGIN: "inboxzero://",
    MOBILE_AUTH_ORIGIN: "inboxzero://",
    NEXT_PUBLIC_BASE_URL: "https://www.getinboxzero.com",
  },
  storeMobileAuthStateMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@/utils/auth", () => ({
  betterAuthConfig: {
    handler: handlerMock,
  },
}));

vi.mock("@/utils/google/oauth", () => ({
  isGoogleOauthEmulationEnabled: isGoogleOauthEmulationEnabledMock,
}));

vi.mock("@/utils/microsoft/oauth", () => ({
  isMicrosoftEmulationEnabled: isMicrosoftEmulationEnabledMock,
}));

vi.mock("@/utils/mobile-auth/oauth-code", () => ({
  createMobileAuthState: createMobileAuthStateMock,
  storeMobileAuthState: storeMobileAuthStateMock,
}));

import { startMobileSocialAuth } from "./start-social";

describe("startMobileSocialAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isGoogleOauthEmulationEnabledMock.mockReturnValue(false);
    isMicrosoftEmulationEnabledMock.mockReturnValue(false);
    createMobileAuthStateMock.mockReturnValue("state-1234567890");
    storeMobileAuthStateMock.mockResolvedValue(undefined);
    handlerMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "http://127.0.0.1:3003/o/oauth2/v2/auth?client_id=client",
        }),
        {
          headers: {
            "content-type": "application/json",
            "set-cookie":
              "better-auth.oauth_state=encrypted-oauth-state; Path=/; HttpOnly",
          },
          status: 200,
        },
      ),
    );
  });

  it("starts Google through social sign-in when the emulator is off", async () => {
    const started = await startMobileSocialAuth({
      provider: "google",
      returnUrlMode: "desktop-scheme",
    });

    expect(started.authorizationURL).toBe(
      "http://127.0.0.1:3003/o/oauth2/v2/auth?client_id=client",
    );
    const [signInRequest] = handlerMock.mock.calls[0] as [Request];
    expect(signInRequest.url).toBe(
      "https://www.getinboxzero.com/api/auth/sign-in/social",
    );
    await expect(signInRequest.json()).resolves.toMatchObject({
      provider: "google",
      disableRedirect: true,
    });
  });

  it("starts Google through oauth2 when the emulator is enabled", async () => {
    isGoogleOauthEmulationEnabledMock.mockReturnValue(true);

    const started = await startMobileSocialAuth({
      provider: "google",
      returnUrlMode: "desktop-scheme",
    });

    expect(started.authorizationURL).toBe(
      "http://127.0.0.1:3003/o/oauth2/v2/auth?client_id=client",
    );
    const [signInRequest] = handlerMock.mock.calls[0] as [Request];
    expect(signInRequest.url).toBe(
      "https://www.getinboxzero.com/api/auth/sign-in/oauth2",
    );
    await expect(signInRequest.json()).resolves.toMatchObject({
      providerId: "google",
      disableRedirect: true,
    });
  });
});
