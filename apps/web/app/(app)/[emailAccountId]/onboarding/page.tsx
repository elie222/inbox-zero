import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { after } from "next/server";
import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";
import {
  extractUtmValues,
  fetchUserAndStoreUtms,
} from "@/app/(landing)/welcome/utms";
import { auth } from "@/utils/auth";

export const maxDuration = 300;

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

  const cookieStore = await cookies();
  const utmValues = extractUtmValues(cookieStore);

  after(async () => {
    const user = await authPromise;
    if (!user?.user) return;
    await fetchUserAndStoreUtms(user.user.id, utmValues);
  });

  return (
    <Suspense>
      <OnboardingContent step={step} />
    </Suspense>
  );
}
