import { NextResponse } from "next/server";
import { getCardSlugSuggestion } from "@/utils/contact-card/slug";
import { getContactCardUrl } from "@/utils/contact-card/url";
import { getContactCardStats } from "@/utils/contact-card/views";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type ContactCardResponse = Awaited<ReturnType<typeof getContactCard>>;

export const GET = withEmailAccount("contact-card", async (request) => {
  const result = await getContactCard(request.auth.emailAccountId);
  return NextResponse.json(result);
});

async function getContactCard(emailAccountId: string) {
  const card = await prisma.contactCard.findUnique({
    where: { emailAccountId },
    select: {
      id: true,
      slug: true,
      isActive: true,
      displayName: true,
      headline: true,
      title: true,
      companyName: true,
      email: true,
      phone: true,
      website: true,
      photoUrl: true,
      location: true,
      linkedinUrl: true,
      xUrl: true,
      instagramUrl: true,
    },
  });

  if (!card) {
    // No card yet: hand the form sensible starting values from the account
    const account = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { name: true, email: true },
    });

    return {
      card: null,
      url: null,
      stats: null,
      defaults: {
        slug: getCardSlugSuggestion(account?.name),
        displayName: account?.name ?? account?.email ?? "",
        email: account?.email ?? "",
      },
    };
  }

  return {
    card,
    url: getContactCardUrl(card.slug),
    stats: await getContactCardStats(card.id),
    defaults: null,
  };
}
