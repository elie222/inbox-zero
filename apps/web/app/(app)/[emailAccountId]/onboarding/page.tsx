import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";
import { registerUtmTracking } from "@/app/(landing)/welcome/utms";
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
  const [searchParams, { emailAccountId }, cookieStore] = await Promise.all([
    props.searchParams,
    props.params,
    cookies(),
  ]);

  const step = searchParams.step ? Number.parseInt(searchParams.step, 10) : 1;

  const utmValues = registerUtmTracking({
    authPromise: auth(),
    cookieStore,
  });

  if (utmValues.utmSource === "briefmymeeting" && !searchParams.force) {
    redirect(`/${emailAccountId}/onboarding-brief`);
  }

  return (
    <Suspense>
      <OnboardingContent step={step} />
    </Suspense>
  );
}
