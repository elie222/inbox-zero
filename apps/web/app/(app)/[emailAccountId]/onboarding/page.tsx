import { Suspense } from "react";
import type { Metadata } from "next";
import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";

export const metadata: Metadata = {
  title: "Onboarding | Inbox Zero",
  description: "Learn how Inbox Zero works and get set up.",
  alternates: { canonical: "/onboarding" },
};

export default async function OnboardingPage(props: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{ step?: string; force?: string }>;
}) {
  const { emailAccountId } = await props.params;
  const searchParams = await props.searchParams;
  // const session = await auth();

  // if (!session?.user) redirect("/login");

  // const user = await prisma.user.findUnique({
  //   where: { id: session.user.id },
  //   select: { completedAppOnboardingAt: true, surveyRole: true },
  // });

  // if (!user) redirect("/login");

  // if (!searchParams.force && user.completedAppOnboardingAt) {
  //   redirect(env.NEXT_PUBLIC_APP_HOME_PATH);
  // }

  const step = searchParams.step ? Number.parseInt(searchParams.step, 10) : 1;

  return (
    <Suspense>
      <OnboardingContent emailAccountId={emailAccountId} step={step} />
    </Suspense>
  );
}
