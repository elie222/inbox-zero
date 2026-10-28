import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Onboarding } from "@/app/(app)/[emailAccountId]/onboarding/Onboarding";
import {
  ConversionAnalyticsScript,
  ConversionQueryParamEvents,
} from "@/components/ConversionAnalytics";
import { registerUtmTracking } from "@/app/(landing)/welcome/utms";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";
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

  const authPromise = auth();
  const utmValues = registerUtmTracking({ authPromise, cookieStore });

  if (utmValues.utmSource === "briefmymeeting" && !force && !step) {
    redirect(`/${emailAccountId}/onboarding-brief`);
  }

  const session = await authPromise;
  const user = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { signupIntent: true },
      })
    : null;

  return (
    <>
      <Suspense>
        <ConversionQueryParamEvents />
      </Suspense>
      <ConversionAnalyticsScript />
      <Suspense>
        <Onboarding step={step} signupIntent={user?.signupIntent ?? null} />
      </Suspense>
    </>
  );
}

function getSingleSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
