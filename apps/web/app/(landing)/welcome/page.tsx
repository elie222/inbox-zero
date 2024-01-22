import { Suspense } from "react";
import { Metadata } from "next";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { OnboardingForm } from "@/app/(landing)/welcome/form";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";
import { env } from "@/env.mjs";
import prisma from "@/utils/prisma";
import { PageHeading, TypographyP } from "@/components/Typography";
import { LoadStats } from "@/providers/StatLoaderProvider";

export const metadata: Metadata = {
  title: "Welcome",
  description: "Get started with Inbox Zero",
  alternates: { canonical: "/welcome" },
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: { question?: string; force?: boolean };
}) {
  const session = await auth();

  if (!session?.user.email) redirect("/login");
  if (!env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID) redirect("/newsletters");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { completedOnboarding: true },
  });
  if (!searchParams.force && user.completedOnboarding) redirect("/newsletters");

  const questionIndex = searchParams.question
    ? parseInt(searchParams.question)
    : 0;

  return (
    <div className="flex h-screen flex-col justify-center p-6 text-gray-900">
      <SquaresPattern />

      <Card className="mx-auto flex max-w-2xl flex-col justify-center space-y-6 p-10 duration-500 animate-in fade-in">
        <div className="flex flex-col text-center">
          <PageHeading>Welcome to Inbox Zero</PageHeading>
          <TypographyP className="mt-2">Clean your inbox, fast.</TypographyP>
          <div className="mt-4">
            <Suspense>
              <OnboardingForm questionIndex={questionIndex} />
            </Suspense>
          </div>
        </div>
      </Card>
      <LoadStats loadBefore showToast={false} />
    </div>
  );
}
