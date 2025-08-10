import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import { StepWho } from "@/app/(landing)/onboarding/StepWho";
import { StepIntro } from "@/app/(landing)/onboarding/StepIntro";
import { StepLabels } from "@/app/(landing)/onboarding/StepLabels";
import { StepDigest } from "@/app/(landing)/onboarding/StepDigest";

export const metadata: Metadata = {
  title: "Onboarding | Inbox Zero",
  description: "Learn how Inbox Zero works and get set up.",
  alternates: { canonical: "/onboarding" },
};

export default async function OnboardingPage(props: {
  searchParams: Promise<{ step?: string; force?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { completedAppOnboardingAt: true, surveyRole: true },
  });

  if (!user) redirect("/login");

  if (!searchParams.force && user.completedAppOnboardingAt) {
    redirect(env.NEXT_PUBLIC_APP_HOME_PATH);
  }

  const step = searchParams.step ? Number.parseInt(searchParams.step, 10) : 1;
  const clampedStep = Math.min(Math.max(step, 1), 4);

  function StepContent() {
    switch (clampedStep) {
      case 1:
        return <StepIntro />;
      case 2:
        return <StepWho initialRole={user?.surveyRole} />;
      case 3:
        return <StepLabels />;
      case 4:
        return <StepDigest />;
      default:
        return <StepIntro />;
    }
  }

  return (
    <Suspense>
      <StepContent />
    </Suspense>
  );
}
