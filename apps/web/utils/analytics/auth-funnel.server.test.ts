import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import {
  getAuthProviderFromContext,
  trackAuthenticationCompleted,
} from "@/utils/analytics/auth-funnel.server";
import { posthogCaptureEvent } from "@/utils/posthog";
import prisma from "@/utils/prisma";

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
    prisma.user.findUnique.mockResolvedValue({
      createdAt: new Date("2026-08-02T11:59:30.000Z"),
      email: "user@example.com",
    });

    await trackAuthenticationCompleted({
      userId: "user-id",
      provider: "google",
      authenticatedAt: new Date("2026-08-02T12:00:00.000Z"),
    });

    expect(posthogCaptureEvent).toHaveBeenCalledWith(
      "user@example.com",
      "Authentication Completed",
      { provider: "google", is_new_user: true },
    );
  });

  it("distinguishes an existing-user login from new-account completion", async () => {
    prisma.user.findUnique.mockResolvedValue({
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      email: "user@example.com",
    });

    await trackAuthenticationCompleted({
      userId: "user-id",
      provider: "apple",
      authenticatedAt: new Date("2026-08-02T12:00:00.000Z"),
    });

    expect(posthogCaptureEvent).toHaveBeenCalledWith(
      "user@example.com",
      "Authentication Completed",
      { provider: "apple", is_new_user: false },
    );
  });

  it("does not emit completion events when provider attribution is unknown", async () => {
    await trackAuthenticationCompleted({
      userId: "user-id",
      provider: "unknown",
      authenticatedAt: new Date("2026-08-02T12:00:00.000Z"),
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(posthogCaptureEvent).not.toHaveBeenCalled();
  });
});
