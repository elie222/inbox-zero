import { redirect } from "next/navigation";
import { isPremium } from "@/utils/premium";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { env } from "@/env";

export async function checkAndRedirectForUpgrade() {
  if (!env.NEXT_PUBLIC_WELCOME_UPGRADE_ENABLED) return;

  const session = await auth();

  const userId = session?.user.id;

  if (!userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: {
          lemonSqueezyRenewsAt: true,
          stripeSubscriptionStatus: true,
        },
      },
      completedAppOnboardingAt: true,
    },
  });

  if (!user) redirect("/login");

  if (
    !isPremium(
      user.premium?.lemonSqueezyRenewsAt || null,
      user.premium?.stripeSubscriptionStatus || null,
    )
  ) {
    if (!user.completedAppOnboardingAt) redirect("/setup");
    else redirect("/welcome-upgrade");
  }
}
