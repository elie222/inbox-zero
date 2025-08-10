import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import { StepWho } from "@/app/(landing)/onboarding/StepWho";
import { StepIntro } from "@/app/(landing)/onboarding/StepIntro";
import { StepLabels } from "@/app/(landing)/onboarding/StepLabels";

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
  const clampedStep = Math.min(Math.max(step, 1), 3);

  function StepContent() {
    switch (clampedStep) {
      case 1:
        return <StepIntro />;
      case 2:
        return <StepWho initialRole={user?.surveyRole} />;
      default:
        return <StepLabels />;
    }
  }

  return (
    <div className="flex flex-col justify-center px-6 py-20 text-gray-900 bg-slate-50 min-h-screen">
      <div className="mx-auto flex max-w-6xl flex-col justify-center space-y-6 p-10 duration-500 animate-in fade-in">
        <Suspense>
          <StepContent />
        </Suspense>
      </div>
    </div>
  );
}
