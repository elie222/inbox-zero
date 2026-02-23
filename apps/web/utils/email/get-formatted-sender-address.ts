import { formatEmailWithName } from "@/utils/email";
import prisma from "@/utils/prisma";

export async function getFormattedSenderAddress({
  emailAccountId,
  fallbackEmail,
}: {
  emailAccountId: string;
  fallbackEmail?: string | null;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      name: true,
      email: true,
    },
  });

  const resolvedEmail = emailAccount?.email || fallbackEmail;
  if (!resolvedEmail) return null;

  return formatEmailWithName(emailAccount?.name, resolvedEmail);
}
