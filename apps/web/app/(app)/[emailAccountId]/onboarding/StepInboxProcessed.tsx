"use client";

import { ArrowRightIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { EmailsSortedIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/EmailsSortedIllustration";
import { InboxReadyIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/InboxReadyIllustration";
import {
  ONBOARDING_FLOW_VARIANTS,
  type OnboardingFlowVariant,
} from "@/app/(app)/[emailAccountId]/onboarding/onboardingFlow";
import { ONBOARDING_PROCESS_EMAILS_COUNT } from "@/utils/config";
import { usePremium } from "@/components/PremiumAlert";

export function StepInboxProcessed({
  flowVariant,
  onNext,
}: {
  flowVariant: OnboardingFlowVariant;
  onNext: () => void;
}) {
  const { isPremium } = usePremium();
  const isFastFlow = flowVariant === ONBOARDING_FLOW_VARIANTS.FAST_5;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="mb-6 h-[240px] flex items-end justify-center">
          {isFastFlow ? (
            <EmailsSortedIllustration />
          ) : (
            <InboxReadyIllustration />
          )}
        </div>

        <PageHeading className="mb-3">Inbox Preview Ready</PageHeading>

        <TypographyP className="text-muted-foreground mb-8">
          {isFastFlow
            ? `We organized your last ${ONBOARDING_PROCESS_EMAILS_COUNT} emails into categories so you can preview how the inbox will look.`
            : `We labeled your last ${ONBOARDING_PROCESS_EMAILS_COUNT} emails and drafted replies (nothing was archived).`}
          {!isPremium && (
            <>
              <br />
              To have incoming emails processed automatically, you'll need to
              upgrade.
            </>
          )}
        </TypographyP>

        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button className="w-full" onClick={onNext}>
            Continue
            <ArrowRightIcon className="size-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
