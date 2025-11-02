import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";

export async function checkUserOwnsEmailAccount({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) throw new Error("Not authenticated");

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId, userId },
    select: { id: true },
  });

  if (!emailAccount) {
    throw new Error("Email account not found or you don't have access to it");
  }
}
