import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { MeetingBriefsOnboardingContent } from "./MeetingBriefsOnboardingContent";
import { registerUtmTracking } from "@/app/(landing)/welcome/utms";
import { auth } from "@/utils/auth";
import { getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Meeting Briefs Setup"),
  description:
    "Set up meeting briefs to receive personalized briefings before your meetings.",
  alternates: { canonical: "/onboarding-brief" },
};

export default async function MeetingBriefsOnboardingPage(props: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const [searchParams, cookieStore] = await Promise.all([
    props.searchParams,
    cookies(),
  ]);
  const parsedStep = searchParams.step ? Number.parseInt(searchParams.step) : 1;
  const step = Number.isNaN(parsedStep) ? 1 : parsedStep;

  registerUtmTracking({
    authPromise: auth(),
    cookieStore,
  });

  return (
    <Suspense>
      <MeetingBriefsOnboardingContent step={step} />
    </Suspense>
  );
}
