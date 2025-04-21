import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { SafeError } from "@/utils/error";

export type UserResponse = Awaited<ReturnType<typeof getUser>>;

async function getUser({ email }: { email: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      userId: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      statsEmailFrequency: true,
      summaryEmailFrequency: true,
      coldEmailBlocker: true,
      coldEmailPrompt: true,
      user: {
        select: {
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
      },
    },
  });

  if (!emailAccount) throw new SafeError("User not found");

  return emailAccount;
}

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;

  const user = await getUser({ email });

  return NextResponse.json(user);
});
