import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

// Should this path be renamed to email account instead of user?
export type UserResponse = Awaited<ReturnType<typeof getEmailAccount>> | null;

async function getEmailAccount({ email }: { email: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      userId: true,
      statsEmailFrequency: true,
      summaryEmailFrequency: true,
      coldEmailBlocker: true,
      coldEmailPrompt: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
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

// Intentionally not using withAuth because we want to return null if the user is not authenticated
export const GET = withError(async () => {
  const session = await auth();
  const email = session?.user.id;
  if (!email) return NextResponse.json(null);

  const user = await getEmailAccount({ email });

  return NextResponse.json(user);
});
