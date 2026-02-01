"use client";

import { PageHeading, TypographyP } from "@/components/Typography";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/new-onboarding/ContinueButton";
import { CustomRulesIllustration } from "@/app/(app)/[emailAccountId]/new-onboarding/illustrations/CustomRulesIllustration";

export function StepCustomRules({
  onNext,
}: {
  provider: string;
  onNext: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="mb-6 h-[240px] flex items-end justify-center">
          <CustomRulesIllustration />
        </div>

        <PageHeading className="mb-3">Custom rules</PageHeading>

        <TypographyP className="text-muted-foreground mb-8">
          We've set up the basics, but that's just the beginning. Your AI
          assistant can handle any email workflow you'd give to a human.
        </TypographyP>

        <ContinueButton onClick={onNext} />
      </div>
    </div>
  );
}
