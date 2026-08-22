import type { Organization } from "schema-dts";
import {
  BRAND_ICON_URL,
  BRAND_NAME,
  SUPPORT_EMAIL,
  toAbsoluteUrl,
} from "@/utils/branding";
import { env } from "@/env";

/** Public legal address from getinboxzero.com/privacy (Inbox Zero Inc.). */
const INBOX_ZERO_ADDRESS = {
  "@type": "PostalAddress" as const,
  streetAddress: "131 Continental Dr, Suite 305",
  addressLocality: "Newark",
  addressRegion: "DE",
  postalCode: "19713",
  addressCountry: "US",
};

export function getOrganizationId() {
  return `${env.NEXT_PUBLIC_BASE_URL}/#organization`;
}

export function getOrganizationJsonLd(): Organization {
  const isInboxZeroBrand = BRAND_NAME === "Inbox Zero";

  return {
    "@type": "Organization",
    "@id": getOrganizationId(),
    name: isInboxZeroBrand ? "Inbox Zero Inc." : BRAND_NAME,
    url: env.NEXT_PUBLIC_BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: toAbsoluteUrl(BRAND_ICON_URL),
    },
    sameAs: [
      "https://x.com/inboxzero_ai",
      "https://github.com/elie222/inbox-zero",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: SUPPORT_EMAIL,
      contactType: "customer support",
    },
    ...(isInboxZeroBrand ? { address: INBOX_ZERO_ADDRESS } : {}),
  };
}
