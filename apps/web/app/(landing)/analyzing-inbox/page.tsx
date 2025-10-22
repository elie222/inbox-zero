import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/utils/auth";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { AnalyzingInboxContent } from "./AnalyzingInboxContent";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";

export const metadata: Metadata = {
  title: "Analyzing Your Inbox | Inbox Zero",
  alternates: { canonical: "/analyzing-inbox" },
};

export default async function AnalyzingInboxPage() {
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
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-20 text-gray-900">
      <SquaresPattern />

      <div className="relative z-10 w-full max-w-2xl duration-500 animate-in fade-in">
        <Suspense>
          <AnalyzingInboxContent
            userName={user.name || user.email?.split("@")[0] || "there"}
          />
        </Suspense>
      </div>
    </div>
  );
}
