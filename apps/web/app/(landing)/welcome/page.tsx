import { Metadata } from "next";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/Card";
import { OnboardingForm } from "@/app/(landing)/welcome/form";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";
import { env } from "@/env.mjs";
import prisma from "@/utils/prisma";

export const metadata: Metadata = {
  title: "Welcome",
  description: "Get started with Inbox Zero",
};

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: { question?: string; force?: boolean };
}) {
  const session = await auth();

  if (!session?.user.email) redirect("/login");
  if (!env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID) redirect("/stats");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { completedOnboarding: true },
  });
  if (!searchParams.force && user.completedOnboarding) redirect("/stats");

  const questionIndex = searchParams.question
    ? parseInt(searchParams.question)
    : 0;

  return (
    <div className="flex h-screen flex-col justify-center p-6 text-gray-900">
      <SquaresPattern />

      <Card className="mx-auto flex max-w-5xl flex-col justify-center space-y-6 p-10 duration-500 animate-in fade-in">
        <div className="flex flex-col text-center">
          <h1 className="font-cal text-2xl font-semibold">
            Welcome to Inbox Zero
          </h1>
          <p className="mt-2">Clean your inbox, fast.</p>
          <div className="mt-8">
            <OnboardingForm questionIndex={questionIndex} />
          </div>
        </div>
      </Card>
    </div>
  );
}
