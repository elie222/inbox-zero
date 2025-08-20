import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/utils/auth";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { WelcomeRedirectContent } from "@/app/(landing)/welcome-redirect/content";
import { storeUtms } from "@/app/(landing)/welcome/utms";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("welcome-redirect");

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

  after(async () => {
    if (!user.utms) {
      await storeUtms(session.user.id).catch((error) => {
        logger.error("Failed to store utms", { error });
      });
    }
  });

  return <WelcomeRedirectContent />;
}
