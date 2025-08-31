import { Suspense } from "react";
import type { Metadata } from "next";
import { after } from "next/server";
import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";
import { fetchUserAndStoreUtms } from "@/app/(landing)/welcome/utms";
import { auth } from "@/utils/auth";

export const metadata: Metadata = {
  title: "Onboarding | Inbox Zero",
  description: "Learn how Inbox Zero works and get set up.",
  alternates: { canonical: "/onboarding" },
};

export default async function OnboardingPage(props: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{ step?: string; force?: string }>;
}) {
  const searchParams = await props.searchParams;

  const step = searchParams.step ? Number.parseInt(searchParams.step, 10) : 1;

  const authPromise = auth();

  after(async () => {
    const user = await authPromise;
    if (!user?.user) return;
    await fetchUserAndStoreUtms(user.user.id);
  });

  return (
    <Suspense>
      <OnboardingContent step={step} />
    </Suspense>
  );
}
