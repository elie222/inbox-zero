import prisma from "@/utils/prisma";
import { extractEmailAddress } from "@/utils/email";

// Contacts store emails trimmed + lowercased (utils/actions/contact.ts), so
// the sender must be normalized the same way for the unique lookup to hit
export async function isKnownContact({
  emailAccountId,
  from,
}: {
  emailAccountId: string;
  from: string;
}): Promise<boolean> {
  const email = (extractEmailAddress(from) || from).trim().toLowerCase();
  if (!email) return false;

  const contact = await prisma.contact.findUnique({
    where: { emailAccountId_email: { emailAccountId, email } },
    select: { id: true },
  });
  return !!contact;
}
