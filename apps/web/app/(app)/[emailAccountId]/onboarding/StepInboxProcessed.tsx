import { CheckCheckIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { ONBOARDING_PROCESS_EMAILS_COUNT } from "@/utils/config";
import { usePremium } from "@/components/PremiumAlert";

export function StepInboxProcessed({ onNext }: { onNext: () => void }) {
  const { isPremium } = usePremium();

  return (
    <OnboardingWrapper>
      <IconCircle size="lg" className="mx-auto">
        <CheckCheckIcon className="size-6" />
      </IconCircle>

      <div className="text-center mt-4">
        <PageHeading>Inbox Preview Ready</PageHeading>
        <TypographyP className="mt-2 max-w-xl mx-auto">
          We labeled your last {ONBOARDING_PROCESS_EMAILS_COUNT} emails and
          drafted replies (nothing was archived).
          {!isPremium && (
            <>
              <br />
              To have incoming emails processed automatically, you'll need to
              upgrade.
            </>
          )}
        </TypographyP>
      </div>

      <div className="flex justify-center mt-8">
        <ContinueButton onClick={onNext} />
      </div>
    </OnboardingWrapper>
  );
}
