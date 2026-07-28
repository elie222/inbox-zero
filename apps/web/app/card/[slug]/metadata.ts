import type { Metadata } from "next";
import { BRAND_NAME, toAbsoluteUrl } from "@/utils/branding";
import type { PublicContactCard } from "@/utils/contact-card/public";

export function buildContactCardPageMetadata(
  card: PublicContactCard,
): Metadata {
  const title = card.displayName;
  const description = buildDescription(card);
  const canonicalUrl = toAbsoluteUrl(`/card/${card.slug}`);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    // A personal card is handed to specific people, not published
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: BRAND_NAME,
      type: "profile",
    },
  };
}

function buildDescription(card: PublicContactCard) {
  const role = [card.title, card.companyName].filter(Boolean).join(" at ");
  return card.headline || role || `Contact details for ${card.displayName}`;
}
