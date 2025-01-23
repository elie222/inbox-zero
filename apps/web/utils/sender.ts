import type { Prisma } from "@prisma/client";
import prisma from "@/utils/prisma";

// in the database we store: Name <email@domain.com>
// but the AI will often give us just email@domain.com
// so we need to find the sender by email
export async function findSenderByEmail<T extends Prisma.NewsletterSelect>(
  { userId, email }: { userId: string; email: string },
  select?: T,
) {
  return (await prisma.newsletter.findFirst({
    where: {
      userId,
      OR: [{ email: { contains: `<${email}>` } }, { email }],
    },
    select,
  })) as Prisma.NewsletterGetPayload<{ select: T }>;
}
