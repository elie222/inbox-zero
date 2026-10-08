import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Microsoft admin consent helpers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/env");
  });

  it("uses organizations for admin consent when login uses common", async () => {
    const adminConsent = await importAdminConsentModule({
      MICROSOFT_TENANT_ID: "common",
    });

    expect(adminConsent.getMicrosoftAdminConsentTenant()).toBe("organizations");
  });

  it("uses a configured tenant for self-hosted admin consent", async () => {
    const adminConsent = await importAdminConsentModule({
      MICROSOFT_TENANT_ID: "contoso.onmicrosoft.com",
    });

    expect(adminConsent.getMicrosoftAdminConsentTenant()).toBe(
      "contoso.onmicrosoft.com",
    );
  });

  it("builds the Microsoft admin consent URL", async () => {
    const adminConsent = await importAdminConsentModule({
      MICROSOFT_CLIENT_ID: "client-id",
      MICROSOFT_TENANT_ID: "common",
      NEXT_PUBLIC_BASE_URL: "https://app.example.com",
    });

    const url = new URL(
      adminConsent.getMicrosoftAdminConsentUrl("signed-state"),
    );

    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe("/organizations/v2.0/adminconsent");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("scope")).toBe(
      "https://graph.microsoft.com/.default",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/outlook/admin-consent/callback",
    );
    expect(url.searchParams.get("state")).toBe("signed-state");
  });
});

async function importAdminConsentModule(
  envOverrides?: Partial<{
    MICROSOFT_CLIENT_ID: string | undefined;
    MICROSOFT_TENANT_ID: string | undefined;
    NEXT_PUBLIC_BASE_URL: string;
  }>,
) {
  vi.doMock("@/env", () => ({
    env: {
      MICROSOFT_CLIENT_ID: "client-id",
      MICROSOFT_TENANT_ID: "common",
      NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
      ...envOverrides,
    },
  }));

  return import("./admin-consent");
}
