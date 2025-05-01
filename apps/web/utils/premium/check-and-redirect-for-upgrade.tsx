import { redirect } from "next/navigation";
import { isPremium } from "@/utils/premium";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { env } from "@/env";

export async function checkAndRedirectForUpgrade() {
  if (!env.NEXT_PUBLIC_WELCOME_UPGRADE_ENABLED) return;

  const session = await auth();

  const email = session?.user.email;

  if (!email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      premium: { select: { lemonSqueezyRenewsAt: true } },
      completedAppOnboardingAt: true,
    },
  });

  if (!user) redirect("/login");

  if (!isPremium(user.premium?.lemonSqueezyRenewsAt || null)) {
    if (!user.completedAppOnboardingAt) redirect("/setup");
    else redirect("/welcome-upgrade");
  }
}
