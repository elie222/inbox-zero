import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { redirectToEmailAccountPath } from "@/utils/account";
import { isPremiumRecord, premiumEntitlementSelect } from "@/utils/premium";

export default async function WelcomeRedirectPage(props: {
  searchParams: Promise<{ force?: boolean }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      completedOnboardingAt: true,
      premiumId: true,
    },
  });

  // Session exists but user doesn't - invalid state, log out
  if (!user) redirect("/logout");
  if (searchParams.force) redirect("/onboarding");
  if (user.completedOnboardingAt) {
    await redirectToEmailAccountPath("/automation");
  }

  if (user.premiumId) {
    const premium = await prisma.premium.findUnique({
      where: { id: user.premiumId },
      select: premiumEntitlementSelect,
    });

    if (isPremiumRecord(premium)) {
      await redirectToEmailAccountPath("/setup");
    }
  }

  redirect("/onboarding");
}
