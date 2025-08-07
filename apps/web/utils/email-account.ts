import { notFound } from "next/navigation";
import { auth } from "@/utils/auth";
import { headers } from "next/headers";
import prisma from "@/utils/prisma";

export async function checkUserOwnsEmailAccount({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user.id;
  if (!userId) notFound();

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId, userId },
    select: { id: true },
  });
  if (!emailAccount) notFound();
}
