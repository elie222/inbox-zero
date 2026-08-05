import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn(),
}));

import {
  getAuthProviderFromContext,
  isNewUserAuthContext,
  markAuthContextAsNewUser,
  trackAuthenticationCompleted,
} from "@/utils/analytics/auth-funnel.server";
import { posthogCaptureEvent } from "@/utils/posthog";

describe("server auth funnel analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives only public provider categories from auth callback context", () => {
    expect(
      getAuthProviderFromContext({
        path: "/callback/google",
        params: { id: "google" },
      }),
    ).toBe("google");
    expect(
      getAuthProviderFromContext({
        path: "/oauth2/callback/microsoft",
        params: { providerId: "microsoft" },
      }),
    ).toBe("microsoft");
    expect(
      getAuthProviderFromContext({
        path: "/sso/callback/private-company-saml",
        params: { providerId: "private-company-saml" },
      }),
    ).toBe("sso");
    expect(
      getAuthProviderFromContext({
        path: "/get-session",
        params: {},
      }),
    ).toBe("unknown");
  });

  it("tracks a completed provider login without adding user data as properties", async () => {
    await trackAuthenticationCompleted({
      email: "user@example.com",
      provider: "google",
      isNewUser: true,
    });

    expect(posthogCaptureEvent).toHaveBeenCalledWith(
      "user@example.com",
      "Authentication Completed",
      { provider: "google", is_new_user: true },
    );
  });

  it("distinguishes an existing-user login from new-account completion", async () => {
    await trackAuthenticationCompleted({
      email: "user@example.com",
      provider: "apple",
      isNewUser: false,
    });

    expect(posthogCaptureEvent).toHaveBeenCalledWith(
      "user@example.com",
      "Authentication Completed",
      { provider: "apple", is_new_user: false },
    );
  });

  it("does not emit completion events when provider attribution is unknown", async () => {
    await trackAuthenticationCompleted({
      email: "user@example.com",
      provider: "unknown",
      isNewUser: true,
    });

    expect(posthogCaptureEvent).not.toHaveBeenCalled();
  });

  it("marks new users from the current auth request context", () => {
    const authContext = {};
    const unrelatedAuthContext = {};

    expect(isNewUserAuthContext(authContext)).toBe(false);

    markAuthContextAsNewUser(authContext);

    expect(isNewUserAuthContext(authContext)).toBe(true);
    expect(isNewUserAuthContext(unrelatedAuthContext)).toBe(false);
  });
});
