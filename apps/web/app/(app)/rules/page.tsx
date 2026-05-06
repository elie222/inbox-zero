import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";

export default async function RulesRedirectPage() {
  const session = await auth();

  if (!session?.user) redirect("/login");

  const emailAccount = await prisma.emailAccount.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });

  if (!emailAccount) redirect("/connect-mailbox");

  redirect(`/${emailAccount.id}/automation?tab=rules`);
}
