import prisma from "@/utils/prisma";
import { extractEmailAddress } from "@/utils/email";

export async function findSenderByEmail({
  emailAccountId,
  email,
}: {
  emailAccountId: string;
  email: string;
}) {
  if (!email) return null;
  const extractedEmail = extractEmailAddress(email);

  const newsletter = await prisma.newsletter.findFirst({
    where: {
      emailAccountId,
      email: { contains: extractedEmail },
    },
  });

  if (!newsletter) return null;
  if (
    newsletter.email !== extractedEmail ||
    newsletter.email.endsWith(`<${extractedEmail}>`)
  )
    return null;

  return newsletter;
}
