import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

// Only the fields the public page renders — an inactive or missing card is a
// 404, never a hint that the slug exists.
export async function getPublicContactCard(slug: string) {
  const card = await prisma.contactCard.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      slug: true,
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

  if (!card) throw new SafeError("Card not found", 404);

  return card;
}

export type PublicContactCard = Awaited<
  ReturnType<typeof getPublicContactCard>
>;
