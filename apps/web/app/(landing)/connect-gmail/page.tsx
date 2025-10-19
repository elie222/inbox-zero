import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { ConnectGmailContent } from "./ConnectGmailContent";
import { CardBasic } from "@/components/ui/card";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";

export const metadata: Metadata = {
  title: "Connect Gmail | Inbox Zero",
  description: "Connect your Gmail account to Inbox Zero.",
  alternates: { canonical: "/connect-gmail" },
};

export default async function ConnectGmailPage() {
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
    redirect("/");
  }

  return (
    <div className="flex flex-col justify-center px-6 py-20 text-gray-900">
      <SquaresPattern />

      <CardBasic className="mx-auto flex max-w-2xl flex-col justify-center space-y-6 p-10 duration-500 animate-in fade-in">
        <Suspense>
          <ConnectGmailContent
            userName={user.name || user.email?.split("@")[0] || "there"}
          />
        </Suspense>
      </CardBasic>
    </div>
  );
}
