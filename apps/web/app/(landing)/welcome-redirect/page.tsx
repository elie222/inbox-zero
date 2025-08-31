import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { WelcomeRedirectContent } from "@/app/(landing)/welcome-redirect/content";

export default async function WelcomeRedirectPage(props: {
  searchParams: Promise<{ question?: string; force?: boolean }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user) redirect("/login");
  if (!env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID)
    redirect(env.NEXT_PUBLIC_APP_HOME_PATH);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { completedOnboardingAt: true, utms: true },
  });

  if (!user) redirect("/login");

  if (!searchParams.force && user.completedOnboardingAt)
    redirect(env.NEXT_PUBLIC_APP_HOME_PATH);

  return <WelcomeRedirectContent />;
}
