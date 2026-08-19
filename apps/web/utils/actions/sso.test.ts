import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { registerSSOProviderAction } from "./sso";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => import("@/__tests__/mocks/sentry-nextjs.mock"));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({ auth: mockAuth }));
vi.mock("@/env", () => ({
  env: {
    ADMINS: ["admin@example.com"],
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    NODE_ENV: "test",
  },
}));

const IDP_METADATA = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data>
          <ds:X509Certificate>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

const input = {
  organizationName: "Acme Corp",
  providerId: "acme-saml",
  domain: "acme.com",
  idpMetadata: IDP_METADATA,
};

describe("registerSSOProviderAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "admin-user", email: "admin@example.com" },
    });
    prisma.ssoProvider.findUnique.mockResolvedValue(null);
    prisma.ssoProvider.create.mockImplementation(
      async ({ data }) =>
        ({
          id: "sso-1",
          providerId: data.providerId,
          domain: data.domain,
          organization: {
            id: data.organizationId,
            name: input.organizationName,
            slug: "acme-corp",
          },
        }) as never,
    );
  });

  it("creates a new organization when none exists with that name", async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({
      id: "org-new",
      name: "Acme Corp",
      slug: "acme-corp",
    } as never);

    const result = await registerSSOProviderAction(input);

    expect(result?.serverError).toBeUndefined();
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: { name: "Acme Corp", slug: "acme-corp" },
      select: { id: true, name: true, slug: true },
    });
    expect(prisma.ssoProvider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org-new" }),
      }),
    );
  });

  it("attaches the SSO provider to an existing organization without SSO", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: "org-existing",
      name: "Acme Corp",
      slug: "acme-corp",
      SsoProvider: [],
    } as never);

    const result = await registerSSOProviderAction(input);

    expect(result?.serverError).toBeUndefined();
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.ssoProvider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org-existing" }),
      }),
    );
  });

  it("errors when the existing organization already has an SSO provider", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: "org-existing",
      name: "Acme Corp",
      slug: "acme-corp",
      SsoProvider: [{ providerId: "existing-saml" }],
    } as never);

    const result = await registerSSOProviderAction(input);

    expect(result?.serverError).toMatch(/already has an SSO provider/i);
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(prisma.ssoProvider.create).not.toHaveBeenCalled();
  });
});
