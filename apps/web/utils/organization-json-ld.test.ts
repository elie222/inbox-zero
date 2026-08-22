import { describe, expect, it } from "vitest";
import {
  getOrganizationId,
  getOrganizationJsonLd,
} from "@/utils/organization-json-ld";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/utils/branding";
import { env } from "@/env";

describe("getOrganizationJsonLd", () => {
  it("includes contactPoint with support email", () => {
    const organization = getOrganizationJsonLd();

    expect(organization["@type"]).toBe("Organization");
    expect(organization["@id"]).toBe(getOrganizationId());
    expect(organization.url).toBe(env.NEXT_PUBLIC_BASE_URL);
    expect(organization.contactPoint).toEqual({
      "@type": "ContactPoint",
      email: SUPPORT_EMAIL,
      contactType: "customer support",
    });
  });

  it("includes the public Inbox Zero Inc. PostalAddress when branded as Inbox Zero", () => {
    // Default cloud/local brand is Inbox Zero; address comes from the public privacy policy.
    if (BRAND_NAME !== "Inbox Zero") {
      expect(getOrganizationJsonLd().address).toBeUndefined();
      return;
    }

    expect(getOrganizationJsonLd().address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "131 Continental Dr, Suite 305",
      addressLocality: "Newark",
      addressRegion: "DE",
      postalCode: "19713",
      addressCountry: "US",
    });
    expect(getOrganizationJsonLd().name).toBe("Inbox Zero Inc.");
  });
});
