import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";
import { registerUtmTracking } from "@/app/(landing)/welcome/utms";
import { auth } from "@/utils/auth";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const maxDuration = 300;

export const metadata: Metadata = {
  title: getBrandTitle("Onboarding"),
  description: `Learn how ${BRAND_NAME} works and get set up.`,
  alternates: { canonical: "/onboarding" },
};

export default async function OnboardingPage(props: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{
    step?: string | string[];
    force?: string | string[];
  }>;
}) {
  const [searchParams, { emailAccountId }, cookieStore] = await Promise.all([
    props.searchParams,
    props.params,
    cookies(),
  ]);
  const step = getSingleSearchParamValue(searchParams.step);
  const force = getSingleSearchParamValue(searchParams.force);

  const utmValues = registerUtmTracking({
    authPromise: auth(),
    cookieStore,
  });

  if (utmValues.utmSource === "briefmymeeting" && !force && !step) {
    redirect(`/${emailAccountId}/onboarding-brief`);
  }

  return (
    <Suspense>
      <OnboardingContent step={step} />
    </Suspense>
  );
}

function getSingleSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
