import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { OnboardingForm } from "@/app/(landing)/welcome/form";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { PageHeading, TypographyP } from "@/components/Typography";
import { UTMs } from "@/app/(landing)/welcome/utms";
import { SignUpEvent } from "@/app/(landing)/welcome/sign-up-event";
import { CardBasic } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Welcome",
  description: "Get started with Inbox Zero",
  alternates: { canonical: "/welcome" },
};

export default async function WelcomePage(props: {
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

  const questionIndex = searchParams.question
    ? Number.parseInt(searchParams.question)
    : 0;

  return (
    <div className="flex flex-col justify-center px-6 py-20 text-gray-900">
      <SquaresPattern />

      <CardBasic className="mx-auto flex max-w-2xl flex-col justify-center space-y-6 p-10 duration-500 animate-in fade-in">
        <div className="flex flex-col text-center">
          <PageHeading>Welcome to Inbox Zero</PageHeading>
          <TypographyP className="mt-2">Let{"'"}s get you set up!</TypographyP>
          <div className="mt-4">
            <Suspense>
              <OnboardingForm questionIndex={questionIndex} />
            </Suspense>
          </div>
        </div>
      </CardBasic>
      {!user.utms && (
        <Suspense>
          <UTMs userId={session.user.id} />
        </Suspense>
      )}
      {/* {!user.completedOnboardingAt && <SignUpEvent />} */}
      <SignUpEvent />
    </div>
  );
}
