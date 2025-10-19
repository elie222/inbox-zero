import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/utils/auth";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { ReadyForBriefContent } from "./ReadyForBriefContent";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";
import { CardBasic } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Ready for your first Brief | Inbox Zero",
  alternates: { canonical: "/ready-for-brief" },
};

export default async function ReadyForBriefPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      completedOnboardingAt: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  // If user has already completed onboarding, redirect to app home
  if (user.completedOnboardingAt) {
    redirect(env.NEXT_PUBLIC_APP_HOME_PATH);
  }

  return (
    <div className="flex flex-col justify-center px-6 py-20 text-gray-900">
      <SquaresPattern />

      <CardBasic className="mx-auto flex max-w-2xl flex-col justify-center space-y-6 p-10 duration-500 animate-in fade-in">
        <Suspense>
          <ReadyForBriefContent
            userName={user.name || user.email?.split("@")[0] || "there"}
          />
        </Suspense>
      </CardBasic>
    </div>
  );
}
