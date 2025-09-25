import { auth } from "@/utils/auth";
import { redirect } from "next/navigation";
import prisma from "@/utils/prisma";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;

  const session = await auth();
  const userId = session?.user.id;
  if (!userId) redirect("/login");

  const member = await prisma.member.findFirst({
    where: { emailAccountId, emailAccount: { userId } },
    select: { organizationId: true },
  });

  if (!member) {
    redirect("/organization/create");
  }

  const redirectUrl = `/organization/${member.organizationId}`;

  redirect(redirectUrl);
}
