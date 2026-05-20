import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MICROSOFT_ADMIN_CONSENT_PAGE_PATH,
  MICROSOFT_ADMIN_CONSENT_STATE_COOKIE_NAME,
  type MicrosoftAdminConsentState,
} from "@/utils/microsoft/admin-consent";
import { generateSignedOAuthState } from "@/utils/oauth/state";

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET } from "./route";

describe("GET /api/outlook/admin-consent/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to success and clears the signed state cookie when consent is granted", async () => {
    const state = createAdminConsentState();

    const response = await GET(
      createRequest(
        `/api/outlook/admin-consent/callback?admin_consent=True&state=${encodeURIComponent(state)}`,
        state,
      ),
    );

    expectRedirect(response, { status: "success" });
    expectStateCookieCleared(response);
  });

  it("rejects a missing or mismatched state before trusting callback params", async () => {
    const state = createAdminConsentState();

    const response = await GET(
      createRequest(
        `/api/outlook/admin-consent/callback?admin_consent=true&state=${encodeURIComponent(state)}`,
        createAdminConsentState(),
      ),
    );

    expectRedirect(response, { error: "invalid_state" });
    expectStateCookieCleared(response);
  });

  it("rejects signed states for other OAuth callback types", async () => {
    const state = generateSignedOAuthState({ type: "outlook-linking" });

    const response = await GET(
      createRequest(
        `/api/outlook/admin-consent/callback?admin_consent=true&state=${encodeURIComponent(state)}`,
        state,
      ),
    );

    expectRedirect(response, { error: "invalid_state" });
    expectStateCookieCleared(response);
  });

  it("maps Microsoft callback errors to a stable admin consent error", async () => {
    const state = createAdminConsentState();

    const response = await GET(
      createRequest(
        `/api/outlook/admin-consent/callback?error=access_denied&admin_consent=true&state=${encodeURIComponent(state)}`,
        state,
      ),
    );

    expectRedirect(response, { error: "oauth_error" });
    expectStateCookieCleared(response);
  });

  it("requires Microsoft to confirm admin consent was granted", async () => {
    const state = createAdminConsentState();

    const response = await GET(
      createRequest(
        `/api/outlook/admin-consent/callback?admin_consent=false&state=${encodeURIComponent(state)}`,
        state,
      ),
    );

    expectRedirect(response, { error: "not_granted" });
    expectStateCookieCleared(response);
  });
});

function createAdminConsentState() {
  return generateSignedOAuthState<MicrosoftAdminConsentState>({
    type: "microsoft-admin-consent",
  });
}

function createRequest(path: string, cookieState?: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookieState
      ? {
          cookie: `${MICROSOFT_ADMIN_CONSENT_STATE_COOKIE_NAME}=${cookieState}`,
        }
      : undefined,
  });
}

function expectRedirect(
  response: Response,
  query: { status: "success" } | { error: string },
) {
  const expectedUrl = new URL(
    MICROSOFT_ADMIN_CONSENT_PAGE_PATH,
    "http://localhost:3000",
  );
  for (const [key, value] of Object.entries(query)) {
    expectedUrl.searchParams.set(key, value);
  }

  expect(response.headers.get("location")).toBe(expectedUrl.toString());
}

function expectStateCookieCleared(response: Response) {
  expect(response.headers.get("set-cookie")).toContain(
    `${MICROSOFT_ADMIN_CONSENT_STATE_COOKIE_NAME}=`,
  );
  expect(response.headers.get("set-cookie")).toContain(
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  );
}
