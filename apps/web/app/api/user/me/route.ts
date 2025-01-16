import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type UserResponse = Awaited<ReturnType<typeof getUser>>;

async function getUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      statsEmailFrequency: true,
      summaryEmailFrequency: true,
      coldEmailBlocker: true,
      coldEmailPrompt: true,
      premium: {
        select: {
          lemonSqueezyCustomerId: true,
          lemonSqueezySubscriptionId: true,
          lemonSqueezyRenewsAt: true,
          unsubscribeCredits: true,
          bulkUnsubscribeAccess: true,
          aiAutomationAccess: true,
          coldEmailBlockerAccess: true,
          tier: true,
          emailAccountsAccess: true,
          lemonLicenseKey: true,
          pendingInvites: true,
        },
      },
    },
  });

  if (!user) throw new SafeError("User not found");

  return user;
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const user = await getUser(session.user.id);

  return NextResponse.json(user);
});
