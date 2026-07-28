import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPublicContactCard } from "@/utils/contact-card/public";
import { SafeError } from "@/utils/error";
import { buildContactCardPageMetadata } from "./metadata";
import { ContactCardClient } from "./ContactCardClient";

const getCachedPublicContactCard = cache(getPublicContactCard);

type ContactCardPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ContactCardPageProps): Promise<Metadata> {
  const { slug } = await params;
  const card = await getCardOrNull(slug);

  if (!card) {
    return { robots: { index: false, follow: false } };
  }

  return buildContactCardPageMetadata(card);
}

export default async function ContactCardPage({
  params,
}: ContactCardPageProps) {
  const { slug } = await params;
  const card = await getCardOrNull(slug);

  if (!card) notFound();

  return <ContactCardClient card={card} />;
}

async function getCardOrNull(slug: string) {
  return getCachedPublicContactCard(slug).catch((error: unknown) => {
    // Only swallow the explicit "not found" path — a DB outage must not
    // masquerade as a missing card
    if (error instanceof SafeError && error.statusCode === 404) return null;
    throw error;
  });
}
